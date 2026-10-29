# Consume the RISC-V WASM Toolchain Release at Runtime — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fun_Studio downloads the standalone `riscv-wasm-toolchain` release from GitHub at runtime and serves the compiler from an in-memory FS, so the repo/working tree stop carrying the bundled toolchain and build cruft.

**Architecture:** A new `src/toolchain-loader.mjs` fetches the release tarball, gunzips + untars it in the worker (`fflate`), and builds an in-memory `Map<relPath, Uint8Array>`. The worker reads all toolchain modules, `sysroot/` and `manifest.json` from that map, and instantiates each module with `wasmBinary` (no per-file HTTP). Browser caches the compressed bytes in IndexedDB keyed by version; Node skips the cache. The board-specific ch32fun `sdk/` stays local (re-homed) and is never in the release.

**Tech Stack:** Node 22 / ES modules, Web Workers, `fflate` (gunzip + untar), GitHub Releases, IndexedDB (browser only).

**Spec:** `docs/superpowers/specs/2026-10-29-consume-riscv-wasm-release-design.md`

## Global Constraints

- Release pin: `v0.2.0`, asset `riscv-wasm-toolchain.tar.gz` at
  `https://github.com/NoNamedCat/riscv-wasm-toolchain/releases/download/v0.2.0/riscv-wasm-toolchain.tar.gz`.
- The release contains exactly: 7 `.js` + 7 `.wasm` (cc1, cc1plus, riscv-as, riscv-ld, riscv-objcopy, riscv-objdump, riscv-size), `manifest.json`, and `sysroot/`. It contains NO `headers.json`, NO `gcc-headers.json`, NO `sdk/`.
- `headers.json`/`gcc-headers.json` are optional (worker already defaults them to `{}` on failure); they are intentionally absent post-change.
- The ch32fun `sdk/` (ch32fun.c, ch32fun.ld, rv003usb.c, rv003usb.S) stays in Fun_Studio and is NOT part of the release.
- No change to the compile pipeline (cc1 → as → ld → objcopy → HEX).
- The Node E2E harness (`tests/compile-harness.mjs`) must pass with NO local `public/wasm-toolchain/` present (proves runtime fetch).
- Emscripten modules are `-sMODULARIZE=1` factories; feed the `.wasm` via the `wasmBinary` option, not `locateFile`.

## Review Focus

- **First-load network failure** (GitHub unreachable) → expect a clear error, not a silently-empty toolchain. Loader surfaces the fetch/gunzip/untar failure.
- **Version pin bump** (cached `v0.1.0` on disk when pin is `v0.2.0`) → expect a forced refetch on tag mismatch, not serving the stale cache.
- **Truncated tarball** (partial download) → expect gunzip/untar to throw a surfaced error, not a half-built FS map.
- **Missing sysroot file** (`manifest.json` lists a path whose bytes are absent) → expect `fetchSysrootBinary` to throw a clear error naming the path.
- **IndexedDB unavailable** (browser private mode / quota) → expect a graceful in-memory fallback (no cache), compile still works.

---

### Task 1: Add `fflate` and the toolchain loader

**Files:**
- Modify: `package.json` (add `fflate` dependency)
- Create: `src/toolchain-loader.mjs`
- Test: `tests/toolchain-loader.test.mjs`

**Interfaces:**
- Produces:
  - `getToolchainFS(): Promise<Map<string, Uint8Array>>` — keys are release paths with no leading `./` (e.g. `cc1.js`, `riscv-ld.wasm`, `sysroot/lib/.../libc.a`, `manifest.json`); values are `Uint8Array` bytes. Populates and returns the in-memory map (cached across calls).
  - `getToolchainText(relPath: string): Promise<string>` — UTF-8 decode of a map entry (for `.js` / `manifest.json`).
  - Constant `TOOLCHAIN_RELEASE: string` (the pin, `"v0.2.0"`).

- [ ] **Step 1: Add the dependency**

Add `fflate` to `package.json` `dependencies` and install:

```json
"dependencies": {
  "fflate": "^0.8.3"
}
```

Run: `npm install` (from the repo root). Confirm `node -e "require('fflate'); console.log('ok')"` prints `ok` (or the ESM import resolves).

- [ ] **Step 2: Write the failing test**

Create `tests/toolchain-loader.test.mjs`:

```js
import assert from "node:assert";
import { getToolchainFS } from "../src/toolchain-loader.mjs";

const fs = await getToolchainFS();
const required = [
  "cc1.js", "cc1.wasm", "cc1plus.wasm",
  "riscv-as.wasm", "riscv-ld.wasm", "riscv-objcopy.wasm",
  "riscv-objdump.wasm", "riscv-size.wasm",
  "manifest.json",
];
for (const k of required) assert.ok(fs.has(k), `missing ${k}`);
// a known sysroot file must resolve to bytes
const libc = [...fs.keys()].find((k) => k.startsWith("sysroot/lib/") && k.endsWith("/libc.a"));
assert.ok(libc, "no sysroot libc.a found");
assert.ok(fs.get(libc).length > 0, "libc.a empty");
console.log("loader test PASS");
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node tests/toolchain-loader.test.mjs`
Expected: FAIL — `Cannot find module '.../src/toolchain-loader.mjs'` (module not created yet).

- [ ] **Step 4: Implement `src/toolchain-loader.mjs`**

```js
import { gunzipSync, strFromU8, u8arr } from "fflate";
import { untar } from "fflate";

export const TOOLCHAIN_RELEASE = "v0.2.0";
const RELEASE_URL =
  "https://github.com/NoNamedCat/riscv-wasm-toolchain/releases/download/" +
  TOOLCHAIN_RELEASE + "/riscv-wasm-toolchain.tar.gz";

const IS_BROWSER = typeof indexedDB !== "undefined";
const DB_NAME = "riscv-wasm-toolchain";
const DB_STORE = "toolchain";

let cachedMap = null;

async function idbGet(bytesKey) { /* read compressed bytes + tag from IDB; return null if absent */ }
async function idbSet(tag, bytes) { /* write { tag, bytes } to IDB; swallow quota/priv-mode errors */ }

async function fetchTarball() {
  const res = await fetch(RELEASE_URL);
  if (!res.ok) throw new Error(`toolchain release fetch failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function tarballToMap(bytes) {
  // bytes = gzip tar. gunzipSync -> tar bytes. untar -> { name: Uint8Array }.
  const tar = gunzipSync(bytes);
  const entries = untar(tar);
  const map = new Map();
  for (const name of Object.keys(entries)) {
    const key = name.replace(/^\.\//, "");
    if (key === "" || key.endsWith("/")) continue;
    map.set(key, entries[name]);
  }
  return map;
}

export async function getToolchainFS() {
  if (cachedMap) return cachedMap;
  let bytes = null;
  if (IS_BROWSER) {
    const hit = await idbGet("toolchain");
    if (hit && hit.tag === TOOLCHAIN_RELEASE) bytes = hit.bytes;
  }
  if (!bytes) {
    bytes = await fetchTarball();
    if (IS_BROWSER) await idbSet(TOOLCHAIN_RELEASE, bytes);
  }
  cachedMap = tarballToMap(bytes);
  return cachedMap;
}

export async function getToolchainText(relPath) {
  const map = await getToolchainFS();
  const data = map.get(relPath);
  if (!data) throw new Error(`toolchain file missing: ${relPath}`);
  return strFromU8(data);
}
```

Notes for the implementer:
- `fflate` `untar` returns a flat object of path → `Uint8Array`. Strip the leading `./` and skip directory entries.
- `idbGet`/`idbSet` use a single object store; on any IDB error (quota, private mode) `idbGet` returns `null` and `idbSet` no-ops, so the path degrades to in-memory.
- `getToolchainFS` is idempotent (returns the same map each call).

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/toolchain-loader.test.mjs`
Expected: `loader test PASS` (requires network to GitHub).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/toolchain-loader.mjs tests/toolchain-loader.test.mjs
git commit -m "feat: fetch RISC-V WASM toolchain release into an in-memory FS"
```

---

### Task 2: Point the worker at the in-memory toolchain FS

**Files:**
- Modify: `src/compiler-worker.js` (loading layer only — `WASM_BASE` usage, `loadToolFactory`, `fetchSysrootBinary`, `ensureSysrootManifest`, `preloadEnvironment`, sdk paths, factory call sites)
- Test: `tests/compile-harness.mjs` (existing E2E, must pass)

**Interfaces:**
- Consumes: `getToolchainFS()`, `getToolchainText(relPath)` from `src/toolchain-loader.mjs`.
- Produces: worker behavior unchanged externally (same postMessage contract); toolchain files now come from the in-memory FS; sdk files come from local `public/ch32fun/sdk/`.

- [ ] **Step 1: Wire the loader into the worker**

- [ ] Import `getToolchainFS`, `getToolchainText` from `./toolchain-loader.mjs`.
- [ ] Remove the toolchain-file `WASM_BASE` usages. Keep a `SDK_BASE` for the local board SDK:
  - Browser: `new URL("../public/ch32fun/sdk/", location.href).href`
  - Node: `./public/ch32fun/sdk/`
- [ ] `loadToolFactory(jsName, exportName, wasmName)`:
  - Read the `.js` text via `getToolchainText(jsName)` (Node + browser unified; no more `fs.readFileSync` of the local toolchain dir).
  - Strip the shebang, build the factory via `new Function` (as today).
  - Return a bound factory: `(opts) => factory({ wasmBinary: (await getToolchainFS()).get(wasmName), ...opts })`. (Make `loadToolFactory` `async` returning the bound async-wrapped factory; the call sites already `await` it.)
- [ ] `fetchSysrootBinary(relPath)`: read `(await getToolchainFS()).get("sysroot/" + relPath)`; throw a clear error naming `relPath` if absent. Keep the existing `cachedSysrootBinary` memo.
- [ ] `ensureSysrootManifest()`: `JSON.parse((await getToolchainText("manifest.json"))).sysrootFiles`.
- [ ] `preloadEnvironment`: read `headers.json`/`gcc-headers.json` from the LOCAL board/include bundle (`public/ch32fun/`, re-homed in Task 3), NOT from the release and NOT from `WASM_BASE`. Keep the existing try/catch → `{}` fallback. These files are the consumer's include bundle (newlib + gcc + ch32fun board headers) and intentionally are NOT part of the generic release.
- [ ] `fetchSdkFile`/`fetchSdkBinary`: point to `SDK_BASE` (browser) / `./public/ch32fun/sdk/` (Node). No change to the ch32fun board logic.
- [ ] Update the 6 factory load sites (cc1, as, ld, objdump, size, objcopy) to the 3-arg `loadToolFactory(name, export, wasmName)`, e.g. `cc1Factory = await loadToolFactory("cc1.js", "createCc1", "cc1.wasm")`.
- [ ] Remove the now-redundant `locateFile: (p) => \`...\`` lines from every `factory({ ... })` instantiation (the bound `wasmBinary` supplies the wasm).

- [ ] **Step 2: Run the E2E harness to verify it passes**

Run: `node tests/compile-harness.mjs` (from the repo root)
Expected: PASS — all catalogue examples compile and the selected multilib matches the native GCC driver. (First run downloads the release ~62 MB.)

- [ ] **Step 3: Commit**

```bash
git add src/compiler-worker.js
git commit -m "feat: load toolchain modules/sysroot from the release in-memory FS"
```

---

### Task 3: Re-home the board SDK and free the bundled toolchain

**Files:**
- Move: `public/wasm-toolchain/sdk/` → `public/ch32fun/sdk/`; `public/wasm-toolchain/headers.json` + `gcc-headers.json` → `public/ch32fun/`
- Delete: `build/` (7.1 GB), `public/wasm-toolchain/` (remaining ~273 MB)
- Modify: `.gitignore`
- Test: `tests/compile-harness.mjs` (must pass with NO local toolchain dir)

**Interfaces:**
- Consumes: Task 1 + Task 2 (runtime fetch already in use).
- Produces: a working tree with `public/ch32fun/{sdk/,headers.json,gcc-headers.json}`, no `build/`, no `public/wasm-toolchain/`.

- [ ] **Step 1: Re-home the board SDK and include bundle**

```bash
mkdir -p public/ch32fun/sdk
git mv public/wasm-toolchain/sdk/ch32fun.c public/ch32fun/sdk/ch32fun.c
git mv public/wasm-toolchain/sdk/ch32fun.ld public/ch32fun/sdk/ch32fun.ld
git mv public/wasm-toolchain/sdk/rv003usb.c  public/ch32fun/sdk/rv003usb.c
git mv public/wasm-toolchain/sdk/rv003usb.S  public/ch32fun/sdk/rv003usb.S
git mv public/wasm-toolchain/headers.json    public/ch32fun/headers.json
git mv public/wasm-toolchain/gcc-headers.json public/ch32fun/gcc-headers.json
```

Confirm `public/ch32fun/` now holds `sdk/` (4 files), `headers.json`, `gcc-headers.json`.

- [ ] **Step 2: Delete the bundled toolchain and build cruft**

```bash
rm -rf public/wasm-toolchain build
```

- [ ] **Step 3: Update `.gitignore`**

Add (if not present):
```
build/
public/wasm-toolchain/
```
Keep `public/ch32fun/` tracked (do NOT ignore it).

- [ ] **Step 4: Run the E2E harness to prove no local toolchain is needed**

Run: `node tests/compile-harness.mjs`
Expected: PASS with `public/wasm-toolchain/` absent (fetches the release) and `public/ch32fun/sdk/` present (board files).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: consume toolchain from release; keep only board SDK locally"
```

---

### Task 4: Document the runtime-fetch architecture

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing (docs only).
- Produces: README sections explaining the toolchain is fetched from the release at runtime and the board SDK is local.

- [ ] **Step 1: Update the README**

Add/replace the toolchain section to state: the compiler is the `riscv-wasm-toolchain` release fetched from GitHub at runtime (pinned in `src/toolchain-loader.mjs`), cached in IndexedDB; the ch32fun board SDK is local in `public/ch32fun/sdk/`; there is no local toolchain build. Update any "build the toolchain" / local-path references.

- [ ] **Step 2: Verify**

Run: `node tests/compile-harness.mjs` (final full pass) — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document runtime-fetch toolchain + local board SDK"
```
