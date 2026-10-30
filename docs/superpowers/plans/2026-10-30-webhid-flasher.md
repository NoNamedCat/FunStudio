# WebHID Flasher for FunStudio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flash the just-compiled `.bin` from FunStudio to a CH32V003 via its WebHID bootloader (PID 0xB00x), from an "Artifacts → Flash to device" entry that opens a modal.

**Architecture:** The standalone `webhid_flash_ch32v003.html` protocol (B003Fun parts dropped) is extracted into one ESM module `src/flasher/webhid.js` with a pure, Node-testable core (page split + report builders) and a thin browser layer (WebHID pairing + txrx + flash loop). `index.html` gains a dropdown row and a `#flashModal` following the existing modal pattern; `src/app.js` wires it to `compiledArtifacts.bin`.

**Tech Stack:** Vanilla ESM, WebHID, no new dependencies. Tests: plain Node with `node:assert` (existing `tests/*.test.mjs` style).

**Spec:** `docs/superpowers/specs/2026-10-30-webhid-flasher-design.md`

## Global Constraints

- **Zero new dependencies**; ESM only; tests are plain `node:assert` run with `node tests/<file>.test.mjs` (no framework).
- **i18n:** every new user-visible string gets a key in **all four** languages (en/es/fr/de) in `src/i18n.js`; UI uses `data-i18n` attributes + `t()`.
- **Bootloader timeout ≈ 7.5 s** from the bootloader `connect` event: the flash starts immediately (no user steps in between); per-transaction timeout 300 ms; no artificial sleeps.
- **Protocol constants (verbatim from the working standalone flasher):** `VENDOR_ID 0x1209`, bootloader PID range `0xB000–0xB00F`, `REPORT_ID 0x00`, 64-byte pages, commands PING `0x01`, INFO `0x02`, ERASE64 `0x10`, LOAD64 `0x11`, PROG64 `0x12`, BOOT `0x20`; address bytes big-endian `[a2,a1,a0]`.
- Last flash page is padded with `0xFF` (not zero).
- WebHID only (secure context, `localhost:3000`); no B003Fun / Feature Report code.
- **No git commits** — the user commits manually.

## Review Focus

1. **No successful compile yet** (page fresh, or after Clean) → the Flash entry must not open a flashing flow; it shows the "compile first" message, same guard style as the other `dlOption*` handlers (`app.js:1471` pattern). → pinned by Task 3 Step 4 (manual check).
2. **Board exits bootloader mid-flash** (timeout) → a per-transaction timeout fires, the device likely disconnects → the flash must fail with a clear "re-run the flash" error, not hang; re-running is safe (each page erases before programming). → pinned by Task 1 Step 4 (error propagation test).
3. **Board already paired** (permission persisted for the origin) → `pairDevice()` returns the permitted device without opening the picker. → pinned by Task 1 Step 3 (test).
4. **Modal closed mid-flash** → `closeBoard()` detaches the inputreport listener, clears queues/waiters, closes the HID device; a later "Connect" in the same session must not reuse stale state. → pinned by Task 1 Step 4 (test).
5. **App-mode device selected by mistake** (PID `0xC003` gamepad) → PING/INFO round-trips time out → clear "not in bootloader mode" error instead of a hang. → pinned by Task 3 Step 5 (manual check).

---

### Task 1: Flasher module `src/flasher/webhid.js` + Node tests

**Files:**
- Create: `src/flasher/webhid.js`
- Create: `tests/webhid.test.mjs`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces (exact names, used by Task 3):
  - `VENDOR_ID: number` (= 0x1209), `PAGE_SIZE: number` (= 64)
  - `splitPages(bin: Uint8Array): Uint8Array[]`
  - `cmdPing(): number[]`, `cmdInfo(): number[]`, `cmdErase(addr: number): number[]`, `cmdLoadLo(addr: number, idx: number, b0: number, b1: number): number[]`, `cmdLoadHi(addr: number, idx: number, b2: number, b3: number): number[]`, `cmdProg(addr: number): number[]`, `cmdBoot(): number[]`
  - `pairDevice(): Promise<HIDDevice | null>` — returns an already-permitted bootloader device if one exists, else `navigator.hid.requestDevice({filters:[{vendorId}]})` result; `null` if nothing.
  - `flashToBoard(device: HIDDevice, bin: Uint8Array, cb: { onProgress(pct: number): void; onStatus(msg: string): void; onLog(msg: string): void }): Promise<void>` — full flow: close current state → wait user disconnect → wait bootloader reconnect (20 s each) → open → PING/INFO (best-effort) → per page ERASE64 → 16×(LOAD64 lo+hi) → PROG64, 300 ms/tx, progress per page. Throws `Error` on any failure.
  - `bootBoard(device: HIDDevice): Promise<void>`
  - `closeBoard(device: HIDDevice): Promise<void>` — detach listener, clear queue/waiters, `device.close()` best-effort.
  - Module must be **importable in Node** (no top-level `navigator`/`document` access).

- [ ] **Step 1: Write the failing test** `tests/webhid.test.mjs`

```js
import assert from "node:assert";
import {
  VENDOR_ID, PAGE_SIZE, splitPages,
  cmdPing, cmdInfo, cmdErase, cmdLoadLo, cmdLoadHi, cmdProg, cmdBoot,
} from "../src/flasher/webhid.js";

assert.strictEqual(VENDOR_ID, 0x1209);
assert.strictEqual(PAGE_SIZE, 64);

// Page split: exact bytes, 0xFF padding on the last page
let pages = splitPages(new Uint8Array([1, 2, 3]));
assert.strictEqual(pages.length, 1);
assert.strictEqual(pages[0][0], 1);
assert.strictEqual(pages[0][1], 2);
assert.strictEqual(pages[0][63], 0xFF);

pages = splitPages(new Uint8Array(130).fill(0xAB));
assert.strictEqual(pages.length, 3);
assert.strictEqual(pages[2][62], 0xAB);
assert.strictEqual(pages[2][63], 0xFF);

// Report builders: exact 8-byte layouts (address big-endian)
assert.deepStrictEqual(cmdPing(), [1, 1, 0, 0, 0, 0, 0, 0]);
assert.deepStrictEqual(cmdInfo(), [2, 0, 0, 0, 0, 0, 0, 0]);
assert.deepStrictEqual(cmdErase(0x08001000), [0x10, 0, 0x08, 0x00, 0x10, 0, 0, 0]);
assert.deepStrictEqual(cmdLoadLo(0x08000000, 0, 0xDE, 0xAD), [0x11, 0x00, 0x08, 0x00, 0x00, 0x00, 0xDE, 0xAD]);
assert.deepStrictEqual(cmdLoadHi(0x08000000, 5, 0xBE, 0xEF), [0x11, 0x85, 0x08, 0x00, 0x00, 0x05, 0xBE, 0xEF]);
assert.deepStrictEqual(cmdProg(0x08001000), [0x12, 0, 0x08, 0x00, 0x10, 0, 0, 0]);
assert.deepStrictEqual(cmdBoot(), [0x20, 0, 0, 0, 0, 0, 0, 0]);

// 64-byte page boundary math
assert.deepStrictEqual(cmdErase(64), [0x10, 0, 0x00, 0x00, 0x40, 0, 0, 0]);
assert.deepStrictEqual(cmdLoadLo(128, 15, 1, 2), [0x11, 0x0F, 0x00, 0x00, 0x80, 0x0F, 1, 2]);
console.log("webhid: all tests passed");
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `node tests/webhid.test.mjs`
Expected: `ERR_MODULE_NOT_FOUND` (module does not exist yet).

- [ ] **Step 3: Implement `src/flasher/webhid.js`**

Pure core exactly as tested above. Browser layer extracted from the working standalone flasher (`/home/cattus/Desktop/Saluki-opencode/webhid_flash_ch32v003.html`), **minus all B003Fun code**:

- `pairDevice()`: `navigator.hid.getDevices()` → filter `vendorId===VENDOR_ID && pid in [0xB000,0xB00F]`; if found return it (no picker); else `requestDevice({filters:[{vendorId: VENDOR_ID}]})`, return `devices[0] ?? null`.
- `flashToBoard()`: internal state (device, inQueue, waiters, OUT_REPORT_LEN=64) reset at start; `waitForBoardPresence` with 20 s timeouts for the disconnect→reconnect sequence; on bootloader `connect`: open immediately, best-effort PING/INFO (`catch(()=>null)`), then the page loop (ERASE → 16× lo/hi LOAD → PROG, `cb.onProgress` per page); txrx: `sendReport(0x00, buf)` padded/truncated to 64, auto-adjust OUT length from first input report ≥ 8 bytes, 300 ms recv timeout, 3 tries with PING "unlock" between tries (standalone behavior).
- Errors: every failure path throws `Error` (never hangs).

- [ ] **Step 4: Re-run the test + add browser-layer smoke tests to the same file**

Append to `tests/webhid.test.mjs` (these need no real HID — they assert the module's structure and Node-importability):

```js
// Module is importable in Node (pure core) and exposes the browser API surface
import * as M from "../src/flasher/webhid.js";
for (const name of ["pairDevice", "flashToBoard", "bootBoard", "closeBoard"]) {
  assert.strictEqual(typeof M[name], "function", `missing export ${name}`);
}
```

Run: `node tests/webhid.test.mjs`
Expected: `webhid: all tests passed`

### Task 2: i18n keys (en/es/fr/de) + key-set test

**Files:**
- Modify: `src/i18n.js` (four `TRANSLATIONS` dictionaries + Node-safe init)
- Create: `tests/i18n.test.mjs`

**Interfaces:**
- Consumes: `TRANSLATIONS` from `src/i18n.js`.
- Produces: keys `dl_flash`, `flash_title`, `flash_pair`, `flash_flash`, `flash_boot`, `flash_close`, `flash_need_compile`, `flash_status_idle`, `flash_status_flashing`, `flash_status_done`, `flash_status_booted`, `flash_hint_pair`, `flash_hint_disconnect`, `flash_hint_reconnect`, `flash_error_no_device`, `flash_error_timeout`, `flash_error_not_bootloader`, `flash_error_closed` — present in **all four** languages.

- [ ] **Step 1: Write the failing test** `tests/i18n.test.mjs`

```js
import assert from "node:assert";
import { TRANSLATIONS } from "../src/i18n.js";

const langs = Object.keys(TRANSLATIONS).sort();
assert.deepStrictEqual(langs, ["de", "en", "es", "fr"]);

const enKeys = Object.keys(TRANSLATIONS.en).sort();
const required = ["dl_flash","flash_title","flash_pair","flash_flash","flash_boot",
  "flash_close","flash_need_compile","flash_status_idle","flash_status_flashing",
  "flash_status_done","flash_status_booted","flash_hint_pair","flash_hint_disconnect",
  "flash_hint_reconnect","flash_error_no_device","flash_error_timeout",
  "flash_error_not_bootloader","flash_error_closed"];
for (const key of required) {
  assert(enKeys.includes(key), `en missing key ${key}`);
}
for (const lang of langs) {
  assert.deepStrictEqual(Object.keys(TRANSLATIONS[lang]).sort(), enKeys,
    `lang ${lang} key-set differs from en`);
}
console.log("i18n: all tests passed");
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `node tests/i18n.test.mjs`
Expected: `ReferenceError: localStorage is not defined` (module-level init breaks Node import) — then, after the Step 3 guard, it fails on missing keys.

- [ ] **Step 3: Add keys to all four languages in `src/i18n.js`**

Also make the module Node-importable (needed by this test): replace the module-level
`let currentLang = localStorage.getItem("funstudio_lang") || "es";`
with
`let currentLang = (typeof localStorage !== "undefined" ? localStorage.getItem("funstudio_lang") : null) || "es";`

Translations (en values; write es/fr/de equivalents in the same style as existing keys):
- `dl_flash`: "Flash to device"
- `flash_title`: "Flash CH32V003 (WebHID)"
- `flash_pair`: "Connect device"
- `flash_flash`: "Flash .bin"
- `flash_boot`: "Boot application"
- `flash_close`: "Close"
- `flash_need_compile`: "Compile first, then flash."
- `flash_status_idle`: "Idle"
- `flash_status_flashing`: "Flashing…"
- `flash_status_done`: "Flash completed"
- `flash_status_booted`: "Booting application"
- `flash_hint_pair`: "Select the CH32V003 in the list (only the first time asks)."
- `flash_hint_disconnect`: "Disconnect your board now, then reconnect it to enter bootloader mode."
- `flash_hint_reconnect`: "Connect your board in bootloader mode…"
- `flash_error_no_device`: "No device selected. Connect the device first."
- `flash_error_timeout`: "Bootloader timeout: the board left bootloader mode. Run the flash again."
- `flash_error_not_bootloader`: "The device did not answer in bootloader mode. Re-run after disconnecting/reconnecting."
- `flash_error_closed`: "Flash cancelled (modal closed)."

- [ ] **Step 4: Run the test, confirm it passes**

Run: `node tests/i18n.test.mjs`
Expected: `i18n: all tests passed`

### Task 3: UI — dropdown row + flash modal + app.js wiring

**Files:**
- Modify: `index.html` (dropdown at ~line 1638, new modal after `newFileModal` ~line 1709)
- Modify: `src/app.js`

**Interfaces:**
- Consumes: `pairDevice`, `flashToBoard`, `bootBoard`, `closeBoard` from `src/flasher/webhid.js` (Task 1); i18n keys from Task 2; `compiledArtifacts` (app.js:19).
- Produces: none (leaf UI task).

- [ ] **Step 1: Add the dropdown row in `#downloadModal`** (after the `#dlOptionAsm` row, index.html:1643), same `.tree-item` style:

```html
<div class="tree-item" id="dlOptionFlash"><i class="fa-solid fa-bolt" style="color: #4ec9b0;"></i> <span data-i18n="dl_flash">Flash to device</span></div>
```

- [ ] **Step 2: Add `#flashModal`** after the `newFileModal` block (index.html ~1709), following the `newProjectModal` pattern (`.modal-backdrop`/`.modal-box`/`.modal-header`/`.modal-body`/`.modal-footer`, `display: none` initially):

- header: bolt icon + `data-i18n="flash_title"` + close button `#closeFlashModalBtn`
- body: status line `#flashStatus` (muted), hint line `#flashHint`, `<progress id="flashProg" value="0" max="100">`, `<pre id="flashLog">` styled like the compiler log
- footer: `#flashPairBtn` (`flash_pair`), `#flashFlashBtn` (`flash_flash`, disabled initially), `#flashBootBtn` (`flash_boot`, disabled initially), `#cancelFlashModalBtn` (`flash_close`, `.btn-secondary`)

- [ ] **Step 3: Wire in `src/app.js`** (module import at top; state + handlers near the downloads section, `app.js:1421`):

- `import { pairDevice, flashToBoard, bootBoard, closeBoard } from "./flasher/webhid.js";`
- Click `#dlOptionFlash`: if `!compiledArtifacts || !compiledArtifacts.bin` → show `t("flash_need_compile")` in `#flashHint`, open modal, no pairing (same guard style as `dlOptionBin`, app.js:1471). Else open modal, close dropdown.
- `#flashPairBtn`: `const dev = await pairDevice()`; null → `flash_error_no_device`; else log VID/PID, enable `#flashFlashBtn`.
- `#flashFlashBtn`: disable all footer buttons during the flow; `flashToBoard(dev, compiledArtifacts.bin, { onProgress: p → flashProg, onStatus: s → t()-mapped status line, onLog: l → #flashLog })`; on success enable `#flashBootBtn` + `flash_status_done`; on error → `flash_error_timeout` if the message contains "timeout", `flash_error_not_bootloader` if PING/INFO failed with a non-paired board, re-enable buttons.
- `#flashBootBtn`: `await bootBoard(dev)` → `flash_status_booted`.
- `#closeFlashModalBtn` / `#cancelFlashModalBtn`: if a flash is in flight call `closeBoard(dev)` + log `flash_error_closed`; always hide the modal, reset progress.
- Close dropdown on row click (existing `downloadModal` click behavior already hides it — keep consistent with sibling rows).

- [ ] **Step 4: Manual check — guard + modal render**

Run: `npm run serve` (port 3000) → open http://localhost:3000 → without compiling, Artifacts → "Flash to device": modal opens with the "compile first" hint and Flash disabled. Then load the blink example, compile, reopen: Flash enabled.

Expected: both behaviors as above; console free of errors.

- [ ] **Step 5: Manual check — wrong-device path (Review Focus #5)**

With the board in **application mode** (PID `0xC003`), pair it and click Flash → expect a clean `flash_error_not_bootloader`/timeout-style error within seconds, no hang, buttons re-enabled.

### Task 4: End-to-end flash with real hardware

**Files:** none (verification only).

- [ ] **Step 1: Full flow**

With CH32V003 plugged: Artifacts → Flash to device → Connect device → Flash → follow the hint (disconnect board, reconnect) → bootloader appears → flash runs to 100 % immediately → status "Flash completed" → Boot application → board runs the firmware.

Expected: flash completes inside the ≈7.5 s bootloader window (starts on connect event, no user steps in between); progress bar and log update per page; board boots the new firmware.

- [ ] **Step 2: Timeout/retry path**

Unplug the board during a flash (or let the bootloader expire) → expect `flash_error_timeout`, then a successful immediate re-run (erase-before-program makes the retry safe).

- [ ] **Step 3: Close-mid-flash path**

Start a flash, immediately close the modal → expect `flash_error_closed`, no console errors, and a subsequent pair+flash working (no stale listeners/state).

- [ ] **Step 4: Regression**

Run: `node tests/webhid.test.mjs && node tests/i18n.test.mjs && node tests/multilib.test.mjs`
Expected: all three print their `passed` lines.
