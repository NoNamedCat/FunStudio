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
assert.strictEqual(pages[2][0], 0xAB); assert.strictEqual(pages[2][1], 0xAB); assert.strictEqual(pages[2][2], 0xFF);

// Report builders: exact 8-byte layouts (address big-endian)
assert.deepStrictEqual(cmdPing(), [1, 1, 0, 0, 0, 0, 0, 0]);
assert.deepStrictEqual(cmdInfo(), [2, 0, 0, 0, 0, 0, 0, 0]);
assert.deepStrictEqual(cmdErase(0x001900), [0x10, 0, 0x00, 0x19, 0x00, 0, 0, 0]);
assert.deepStrictEqual(cmdLoadLo(0x001900, 0, 0xDE, 0xAD), [0x11, 0x00, 0x00, 0x19, 0x00, 0x00, 0xDE, 0xAD]);
assert.deepStrictEqual(cmdLoadHi(0x001900, 5, 0xBE, 0xEF), [0x11, 0x85, 0x00, 0x19, 0x00, 0x05, 0xBE, 0xEF]);
assert.deepStrictEqual(cmdProg(0x001900), [0x12, 0, 0x00, 0x19, 0x00, 0, 0, 0]);
assert.deepStrictEqual(cmdBoot(), [0x20, 0, 0, 0, 0, 0, 0, 0]);

// 64-byte page boundary math
assert.deepStrictEqual(cmdErase(64), [0x10, 0, 0x00, 0x00, 0x40, 0, 0, 0]);
assert.deepStrictEqual(cmdLoadLo(128, 15, 1, 2), [0x11, 0x0F, 0x00, 0x00, 0x80, 0x0F, 1, 2]);
console.log("webhid: all tests passed");

// Module is importable in Node (pure core) and exposes the browser API surface
import * as M from "../src/flasher/webhid.js";
for (const name of ["pairDevice", "flashToBoard", "bootBoard", "closeBoard"]) {
  assert.strictEqual(typeof M[name], "function", `missing export ${name}`);
}

// recv timeout bookkeeping: a timed-out waiter must not eat the next report
import { createReportQueue } from "../src/flasher/webhid.js";
const q = createReportQueue();
await q.recv(50).catch((e) => assert.strictEqual(e.message, "timeout"));
const pending = q.recv(500);
q.push(new Uint8Array([7, 8, 9]));
const got = await Promise.race([
  pending,
  new Promise((r) => setTimeout(() => r(undefined), 200)),
]);
assert.deepStrictEqual([...got], [7, 8, 9]);
console.log("webhid: queue tests passed");
// B003Fun op builder (pure): 128B feature-report op with blob + LE u32 args
import { createOp, opWriteU32, opWriteArb } from "../src/flasher/webhid.js";
const op = createOp();
assert.strictEqual(op.buffer[0], 0xaa, "op starts with report id 0xaa");
assert.strictEqual(op.commandplace, 4, "commandplace starts at 4");
opWriteArb(op, new Uint8Array([1, 2, 3, 4, 5]));
opWriteU32(op, 0x40022010);
assert.deepStrictEqual([...op.buffer.slice(4, 9)], [1, 2, 3, 4, 5], "blob at commandplace");
assert.deepStrictEqual([...op.buffer.slice(9, 13)], [0x10, 0x20, 0x02, 0x40], "u32 LE at commandplace");
assert.strictEqual(op.commandplace, 13, "commandplace advanced by 9");
console.log("webhid: op builder tests passed");
// A failed flash must release the bootloader handle (retry without page reload)
import { flashToBoard } from "../src/flasher/webhid.js";
{
  const boardStub = {
    opened: false,
    vendorId: VENDOR_ID,
    productId: 0xB005,
    open: async () => { boardStub.opened = true; },
    close: async () => { boardStub.opened = false; },
    addEventListener: () => {},
    removeEventListener: () => {},
    sendReport: async () => { throw new Error("usb down"); },
  };
  const appDev = { opened: false, vendorId: VENDOR_ID, productId: 0xC003, close: async () => {} };
  Object.defineProperty(globalThis, "navigator", {
    value: { hid: { getDevices: async () => [boardStub] } },
    configurable: true,
  });
  let caught = null;
  await flashToBoard(appDev, new Uint8Array([1]), {
    onStatus: () => {}, onLog: () => {}, onProgress: () => {},
  }).catch((e) => { caught = e; });
  assert.ok(caught && /not responding/i.test(caught.message), "flash must fail (PONG/INFO unreachable)");
  assert.strictEqual(boardStub.opened, false, "bootloader handle must be closed after a failed flash");
  console.log("webhid: close-on-failure test passed");
}
// Board already in bootloader mode (permitted + connected): skip the disconnect phase
{
  const boardStub = {
    opened: false,
    vendorId: VENDOR_ID,
    productId: 0xB003,
    open: async () => { boardStub.opened = true; },
    close: async () => { boardStub.opened = false; },
    addEventListener: () => {},
    removeEventListener: () => {},
    sendFeatureReport: async () => { throw new Error("no b003 in node"); },
  };
  Object.defineProperty(globalThis, "navigator", {
    value: { hid: { getDevices: async () => [boardStub] } },
    configurable: true,
  });
  const statuses = [];
  const t0 = Date.now();
  let caught = null;
  await flashToBoard(boardStub, new Uint8Array([1]), {
    onStatus: (s) => statuses.push(s),
    onLog: () => {},
    onProgress: () => {},
  }).catch((e) => { caught = e; });
  const elapsed = Date.now() - t0;
  assert.ok(caught, "flash must fail in Node (no B003 feature report)");
  assert.ok(!statuses.includes("disconnect"), "must skip the disconnect phase when the board is already in bootloader mode (got: " + statuses.join(",") + ")");
  assert.ok(elapsed < 2000, "must not wait 20 s for a disconnect (took " + elapsed + " ms)");
  console.log("webhid: skip-disconnect-when-bootloader test passed");
}

// ===== Fix 1: a hanging WebHID call must not leave flashToBoard pending =====
import { pairDevice, closeBoard } from "../src/flasher/webhid.js";
{
  const hangDev = {
    opened: false,
    vendorId: VENDOR_ID,
    productId: 0xB003,
    open: async () => { hangDev.opened = true; },
    close: async () => { hangDev.opened = false; },
    addEventListener: () => {},
    removeEventListener: () => {},
    sendFeatureReport: () => new Promise(() => {}), // never settles (unplug mid-call)
    receiveFeatureReport: () => new Promise(() => {}),
  };
  Object.defineProperty(globalThis, "navigator", {
    value: { hid: { getDevices: async () => [hangDev] } },
    configurable: true,
  });
  const t0 = Date.now();
  const race = await Promise.race([
    flashToBoard(hangDev, new Uint8Array([1]), {
      onStatus: () => {}, onLog: () => {}, onProgress: () => {},
    }).then(
      () => ({ settled: true, threw: false }),
      (e) => ({ settled: true, threw: true, msg: e && e.message }),
    ),
    new Promise((res) => setTimeout(() => res({ settled: false }), 8000)),
  ]);
  const elapsed = Date.now() - t0;
  assert.ok(race.settled, "flashToBoard must settle when a WebHID call hangs (took >8000 ms)");
  assert.ok(race.threw, "flashToBoard must reject when the board dies mid-flash");
  assert.ok(elapsed < 8000, "must settle in bounded time (took " + elapsed + " ms)");
  console.log("webhid: hanging-device timeout test passed (" + elapsed + " ms)");
}

// ===== Fix 2: pairDevice must open the picker so a different device can be chosen =====
{
  const bootA = { vendorId: VENDOR_ID, productId: 0xB003, opened: true };
  const otherDev = { vendorId: VENDOR_ID, productId: 0xC003, opened: false };
  let requestDeviceCalled = false;
  Object.defineProperty(globalThis, "navigator", {
    value: {
      hid: {
        getDevices: async () => [bootA], // a permitted bootloader is present
        requestDevice: async () => { requestDeviceCalled = true; return [otherDev]; },
      },
    },
    configurable: true,
  });
  const picked = await pairDevice();
  assert.ok(requestDeviceCalled, "pairDevice must open the device picker (requestDevice)");
  assert.strictEqual(picked, otherDev, "pairDevice must return the device the user picked");
  console.log("webhid: pairDevice-picker test passed");
}

// ===== Fix 4: a stale (cancelled) flash must not corrupt a new flash's state =====
import { isFlashing } from "../src/flasher/webhid.js";
{
  const hangDev = {
    opened: false,
    vendorId: VENDOR_ID,
    productId: 0xB003,
    open: async () => { hangDev.opened = true; },
    close: async () => { hangDev.opened = false; },
    addEventListener: () => {},
    removeEventListener: () => {},
    sendFeatureReport: () => new Promise(() => {}), // never settles
    receiveFeatureReport: () => new Promise(() => {}),
  };
  Object.defineProperty(globalThis, "navigator", {
    value: { hid: { getDevices: async () => [hangDev] } },
    configurable: true,
  });
  // 1) flash A starts and hangs (board dies mid-flash).
  const staleFlash = flashToBoard(hangDev, new Uint8Array([1]), {
    onStatus: () => {}, onLog: () => {}, onProgress: () => {},
  }).catch((e) => e);
  await new Promise((r) => setTimeout(r, 50));
  // 2) user closes the modal mid-flash -> state reset (generation bump).
  await closeBoard(hangDev);
  // 3) a NEW flash starts on the same dead device.
  const newFlash = flashToBoard(hangDev, new Uint8Array([1]), {
    onStatus: () => {}, onLog: () => {}, onProgress: () => {},
  }).catch((e) => e);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(isFlashing(), "new flash must be in progress");
  // 4) the stale flash settles (its hung call times out); it must NOT
  //    reset the state of the new, still-pending flash.
  await staleFlash;
  assert.ok(isFlashing(), "stale flash must not clear the new flash's state (flashing flag)");
  const newResult = await newFlash;
  assert.ok(newResult, "new flash must have rejected on its own (board dead)");
  console.log("webhid: stale-flash isolation test passed");
}
