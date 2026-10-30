# WebHID Bootloader Flasher in FunStudio — Design

Date: 2026-10-30 · Status: proposed

## Intent & Why

FunStudio compiles CH32 RISC-V firmware in the browser and outputs `.bin`, but flashing requires downloading the file and using an external tool (the standalone `webhid_flash_ch32v003.html`). Goal: flash the just-compiled `.bin` directly from the IDE via the CH32V003 WebHID bootloader (PID 0xB00x), reusing the proven standalone protocol.

## Goals

- "Flash to device" entry in the **Artifacts dropdown**, enabled only when a successful compile exists (`compiledArtifacts.bin`).
- A **modal** (existing `.modal-backdrop`/`.modal-box` pattern) hosting the full flow:
  1. **Pair** the device (WebHID picker, one-time per origin on localhost).
  2. Instructions: **disconnect** the board, then **reconnect** it → bootloader mode.
  3. Flash starts **immediately** on the bootloader `connect` event (bootloader window ≈ 7.5 s).
  4. Progress bar + log; optional **Boot** step at the end.
- Protocol extracted to `src/flasher/webhid.js` (ESM, zero new dependencies).
- i18n: all new strings in en/es/fr/de (`src/i18n.js`).

## Non-Goals

- Loading arbitrary `.bin` from disk — only the just-compiled binary.
- B003Fun bootloader (Feature Reports) — only the WebHID bootloader (0xB000–0xB00F) is supported; that half of the standalone flasher is dropped.
- Flashing other MCU families, serial monitor, auto-reconnect loops.

## Constraints

- WebHID needs a secure context → `localhost:3000` (server.js) is fine; COOP/COEP do not block it.
- **Bootloader timeout ≈ 7.5 s** from reconnect: no user steps between the connect event and the first HID command; 300 ms per-transaction timeout; if the bootloader expires mid-flash (device disconnects or PID reverts), report a clear error and the user re-runs the flow (safe: each page erases before programming).
- Pairing persists per origin; the flow must handle "already paired" (skip picker, go straight to disconnect/reconnect).
- The studio is 100% client-side; no new npm dependencies, no build changes beyond the existing Vite setup.

## Approaches (considered)

1. **Artifacts dropdown entry → modal** (chosen): minimal new UI, lives next to the outputs, the modal forces the attention the unplug/replug sequence requires.
2. Persistent "Flash" tab in the IDE: more discoverable, more layout/tab code, no functional gain.
3. "Compile & Flash" button: one-click UX but hides the physical disconnect step; the user may miss the bootloader window.

**Decision: 1.**

## How (decisions)

- `src/flasher/webhid.js`: ESM module. Exposes `pairDevice()`, `flashToBoard(bin, { onProgress, onStatus, onLog })`, `bootBoard()`. Internal: `txrx` with retries, 64-byte page protocol (ERASE64 → 16× LOAD64 → PROG64), report-length auto-adjust from the first input report. No B003Fun code.
- `index.html`: dropdown item `#dlOptionFlash` (same style as the other `dlOption*` rows) + `#flashModal` following the `newProjectModal` pattern (header/body/footer, open with `display:flex`).
- `src/app.js`: wires the item → opens modal; modal buttons drive `pairDevice()`/`flashToBoard(compiledArtifacts.bin, …)`; item disabled until `compiledArtifacts` is set, re-checked on every compile result.
- `src/i18n.js`: new keys (flash title, pair, flash, boot, close, status lines, errors) in en/es/fr/de.

## Left to the builder

- Exact log formatting and progress granularity (per-page is fine).
- Edge case: modal closed mid-flash → cancel by closing the HID device and warn that a retry is needed.
