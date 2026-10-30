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
