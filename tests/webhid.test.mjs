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
