// End-to-end compilation harness (Node): runs compiler-worker.js for each
// catalogue architecture against the real sysroot and asserts that the
// multilib selected, linked and reported is the one the native GCC driver
// would pick.
//
// Usage: node tests/compile-harness.mjs  (run from the repo root)

import { MCU_PROFILES, EXAMPLES_CATALOGUE, FUNCONFIG_H, CH32FUN_LD } from "../src/catalogue.js";

const messages = [];
let pendingResolve = null;

function deliver(msg) {
  messages.push(msg);
  if (msg.type === "success" || msg.type === "error") {
    const r = pendingResolve;
    pendingResolve = null;
    r(msg);
  }
}

globalThis.self = {
  postMessage: deliver,
  onmessage: null,
};

await import("../src/compiler-worker.js");

const blink = EXAMPLES_CATALOGUE.find((x) => x.id === "blink.c");
if (!blink) throw new Error("blink.c example missing from catalogue");

const SIXTYFOUR_BIT = `
#include "ch32fun.h"
#include <stdint.h>

volatile uint64_t in[2];

static uint64_t mul64(uint64_t a, uint64_t b) { return a * b; }
static uint64_t div64(uint64_t a, uint64_t b) { return a / b; }
static uint64_t mod64(uint64_t a, uint64_t b) { return a % b; }

int main()
{
    in[0] = 0x1234567890ABCDEFULL;
    in[1] = 0x000000000000000F123ULL;
    uint64_t m = mul64(in[0], in[1]);
    uint64_t d = div64(in[0], 1000000000ULL);
    uint64_t r = mod64(m, 7ULL);
    volatile uint64_t out = m + d + r;
    while (1) { if (out == 0) {} }
}
`;

// qsort is provided ONLY by newlib libc (the SDK defines its own memset,
// so memset cannot be used to prove libc.a is pulled in).
const LIBC_QSORT = `
#include "ch32fun.h"
#include <stdlib.h>
#include <stdint.h>

static int cmp32(const void *a, const void *b)
{
    return (int32_t)*(const uint32_t *)a - (int32_t)*(const uint32_t *)b;
}

uint32_t data[256];

int main()
{
    SystemInit();
    for (int i = 0; i < 256; i++) data[i] = (uint32_t)(255 - i) * 31u;
    qsort(data, 256, sizeof(uint32_t), cmp32);
    uint32_t acc = data[0] + data[255];
    while (1) { if (acc == 0xDEADBEEF) {} }
}
`;

// USB example: its main.c pulls in ch32v003_GPIO_branchless.h, which does a
// relative `#include "../ch32fun/ch32fun.h"` — exercises the sibling-layout fix.
const usbEx = EXAMPLES_CATALOGUE.find((x) => x.id === "rv003usb_cdc.c");
if (!usbEx) throw new Error("rv003usb_cdc.c example missing from catalogue");
const usbFiles = {
  "main.c": usbEx.code,
  "funconfig.h": usbEx.funconfig || FUNCONFIG_H,
  "ch32fun.ld": CH32FUN_LD,
};
if (usbEx.extraFiles) Object.assign(usbFiles, usbEx.extraFiles);

const CASES = [
  {
    name: "CH32V003 blink (rv32ec/ilp32e)",
    mcu: "ch32v003",
    arch: "rv32ec",
    abi: "ilp32e",
    code: blink.code,
    expectMultilib: "rv32ec/ilp32e",
    expectMapContains: null,
  },
  {
    name: "CH32V203 blink (rv32imac/ilp32)",
    mcu: "ch32v203",
    arch: "rv32imac",
    abi: "ilp32",
    code: blink.code,
    expectMultilib: "rv32imac_zaamo_zalrsc/ilp32",
    expectMapContains: null,
  },
  {
    name: "CH32V307 blink (rv32imafc/ilp32f)",
    mcu: "ch32v307",
    arch: "rv32imafc",
    abi: "ilp32f",
    code: blink.code,
    expectMultilib: "rv32imafc_zicsr_zaamo_zalrsc/ilp32f",
    expectMapContains: null,
  },
  {
    name: "CH32V203 64-bit arithmetic (libgcc __mulodi4/__divdi3)",
    mcu: "ch32v203",
    arch: "rv32imac",
    abi: "ilp32",
    code: SIXTYFOUR_BIT,
    expectMultilib: "rv32imac_zaamo_zalrsc/ilp32",
    expectMapContains: "/sysroot/lib/gcc/riscv32-unknown-elf/15.2.0/rv32imac_zaamo_zalrsc/ilp32/libgcc.a",
  },
  {
    name: "CH32V203 qsort (libc stdlib)",
    mcu: "ch32v203",
    arch: "rv32imac",
    abi: "ilp32",
    code: LIBC_QSORT,
    expectMultilib: "rv32imac_zaamo_zalrsc/ilp32",
    expectMapContains: "/sysroot/lib/rv32imac_zaamo_zalrsc/ilp32/libc.a",
  },
  {
    name: "CH32V003 rv003usb CDC (branchless header ../ch32fun/ch32fun.h)",
    mcu: "ch32v003",
    arch: "rv32ec",
    abi: "ilp32e",
    code: usbEx.code,
    files: usbFiles,
    expectMultilib: "rv32ec/ilp32e",
    expectMapContains: null,
  },
];

function assertElf(name, elf) {
  const b = elf instanceof Uint8Array ? elf : new Uint8Array(elf);
  if (b[0] !== 0x7f || b[1] !== 0x45 || b[2] !== 0x4c || b[3] !== 0x46)
    throw new Error(`${name}: ELF magic missing`);
  if (b[4] !== 1) throw new Error(`${name}: not ELF32`);
  const e_machine = b[18] | (b[19] << 8);
  if (e_machine !== 0xf3) {
    const hex = Array.from(b.slice(0, 40)).map((x) => x.toString(16).padStart(2, "0")).join(" ");
    throw new Error(`${name}: e_machine is not RISC-V (0x${e_machine.toString(16)}) header=${hex}`);
  }
  // Entry may legitimately be 0x0 (reset vector at flash origin on CH32); a
  // non-zero entry must stay inside the MCU's 32-bit memory map.
  const e_entry = b[24] | (b[25] << 8) | (b[26] << 16) | ((b[27] << 24) >>> 0);
  if (e_entry !== 0 && e_entry >= 0x80000000) throw new Error(`${name}: e_entry 0x${e_entry.toString(16)} out of memory map`);
}

let failures = 0;

for (const c of CASES) {
  messages.length = 0;
  const replyPromise = new Promise((resolve) => {
    pendingResolve = resolve;
  });
  self.onmessage({
    data: {
    code: c.code,
    files: c.files || { "main.c": c.code },
    mcu: c.mcu,
    arch: c.arch,
    abi: c.abi,
    optLevel: "-Os",
    target: "riscv32-unknown-elf",
    linkerScript: c.files ? c.files["ch32fun.ld"] || null : null,
    },
  });
  const result = await replyPromise;

  try {
    if (result.type !== "success") {
      const lastLogs = messages.filter((m) => m.type === "log").slice(-5).map((m) => m.message).join(" | ");
      throw new Error(`expected success, got: ${result.type === "error" ? result.error : "none"} :: last logs: ${lastLogs}`);
    }
    assertElf(c.name, result.elf);

    const logs = messages.filter((m) => m.type === "log").map((m) => m.message).join("\n");
    if (!logs.includes(`Multilib ${c.expectMultilib} selected`)) {
      throw new Error(`log missing "Multilib ${c.expectMultilib} selected"`);
    }

    if (c.expectMapContains && !result.map.includes(c.expectMapContains)) {
      throw new Error(`.map does not reference ${c.expectMapContains}`);
    }

    const profile = MCU_PROFILES[c.mcu];
    if (profile && profile.flashBytes && result.stats.flashBytes > profile.flashBytes) {
      throw new Error(`flash overflow: ${result.stats.flashBytes} > ${profile.flashBytes}`);
    }

    console.log(`PASS  ${c.name}  (flash=${result.stats.flashBytes}B, multilib=${c.expectMultilib})`);
  } catch (err) {
    failures++;
    console.error(`FAIL  ${c.name}: ${err.message}`);
  }
}

if (failures) {
  console.error(`\n${failures} case(s) failed`);
  process.exit(1);
}
console.log("\nAll end-to-end compilation cases passed.");
