# Fun_Studio: consume the RISC-V WASM toolchain release at runtime

Date: 2026-10-29
Status: proposed

## Intent / why

Fun_Studio should not build or carry its own RISC-V toolchain. The toolchain is a
standalone module (`NoNamedCat/riscv-wasm-toolchain`) published as a GitHub Release.
Fun_Studio downloads it from that release at runtime and caches it locally, so the two
projects stay separate and Fun_Studio's repo/working tree stop holding ~273 MB of
bundled binaries and 7.1 GB of build cruft.

## Goals
- Free disk: delete `build/` (7.1 GB) and the bundled `public/wasm-toolchain/` toolchain
  copy (~273 MB).
- Single source of truth: toolchain comes from the release, version-pinned.
- Offline after first load: the release tarball is cached in the browser (IndexedDB).
- Disassembler (`objdump`) and profiler (`size`) keep working.

## Non-goals
- Not building the toolchain inside Fun_Studio.
- Not putting the ch32fun board SDK into the release (it stays board-specific, in Fun_Studio).
- No change to the compile pipeline itself (cc1 → as → ld → objcopy → HEX).

## Constraints
- GitHub Releases serve one asset (the tarball); individual files are not addressable
  over HTTP. So the tarball is fetched once and extracted in-browser.
- The ch32fun `sdk/` (headers, startup, `ch32fun.ld`, `libgcc.a`) is board-specific and
  must keep being served by Fun_Studio, not the release.

## Approaches (considered)
- **A — Runtime fetch from the release (chosen).** Worker fetches the release `.tar.gz`,
  gunzips + untars in-browser (`fflate`), serves modules/sysroot from an in-memory map,
  caches the tarball bytes in IndexedDB. Pro: repo fully clean, always tracks the
  release. Con: needs network to GitHub on first load; ~61 MB compressed fetch.
- **B — Local download of the release (rejected).** A script pulls the tarball once into
  `public/wasm-toolchain/` (gitignored). Pro: offline, simpler loading. Con: working tree
  still holds ~273 MB; diverges from "separate projects."

## The release (v0.2.0)
- Rebuilt to **7 generic tools**: `cc1`, `cc1plus`, `riscv-as`, `riscv-ld`,
  `riscv-objcopy`, `riscv-objdump`, `riscv-size` (objdump + size added; all generic
  GNU binutils, no ch32fun).
- Ships `sysroot/` (headers + `libc.a`/`libm.a`/`libgcc.a` per multilib) + `manifest.json`.
- No `sdk/`.

## How (Fun_Studio changes)
1. Pin the release: `TOOLCHAIN_RELEASE = "v0.2.0"`, asset
   `riscv-wasm-toolchain.tar.gz` from the GitHub release download URL.
2. On worker start: if not in IndexedDB, `fetch()` the tarball → `fflate.gunzip` →
   `fflate.untar` → in-memory `Map<relPath, Uint8Array>`. Persist the compressed bytes in
   IndexedDB.
3. `loadToolFactory` reads the `.js` text from the map and passes the matching `.wasm`
   bytes to the factory via `{ wasmBinary }` (no HTTP for wasm).
4. `fetchSysrootBinary` + `manifest.json` read from the map.
5. `fetchSdkFile`/`fetchSdkBinary` stay on Fun_Studio's local SDK path (re-homed, e.g.
   `public/ch32fun/sdk/`), decoupled from the toolchain base.
6. Node/test path: fetch + extract the same way (no local toolchain dir needed).

## Space freed
- `build/` removed: 7.1 GB.
- `public/wasm-toolchain/` removed except the small ch32fun `sdk/` (144 KB), re-homed.

## Left to the builder
- Exact caching key + version-mismatch handling (force refetch if the cached version tag
  differs from the pin).
- Progress UI for the first-load download (percentage on the 61 MB fetch).
- Where the ch32fun `sdk/` physically lives in Fun_Studio and how it's served.
