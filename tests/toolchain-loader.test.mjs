// Loader unit test: the in-memory toolchain FS must expose the release's
// modules, manifest, and sysroot after fetching the pinned release.
// Requires network (downloads the ~62MB release from GitHub).
import assert from "node:assert";
import { getToolchainFS } from "../src/toolchain-loader.mjs";

const fs = await getToolchainFS();

const required = [
  "cc1.js", "cc1.wasm", "cc1plus.wasm",
  "riscv-as.wasm", "riscv-ld.wasm", "riscv-objcopy.wasm",
  "riscv-objdump.wasm", "riscv-size.wasm",
  "manifest.json",
];
for (const k of required) {
  assert.ok(fs.has(k), `missing toolchain file: ${k}`);
  assert.ok(fs.get(k).length > 0, `empty toolchain file: ${k}`);
}

// A known sysroot file must resolve to non-empty bytes.
const libc = [...fs.keys()].find((k) => k.startsWith("sysroot/lib/") && k.endsWith("/libc.a"));
assert.ok(libc, "no sysroot libc.a found in FS");
assert.ok(fs.get(libc).length > 0, "sysroot libc.a empty");

console.log("loader test PASS:", fs.size, "files mapped");
