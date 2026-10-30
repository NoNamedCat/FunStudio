# FunStudio — Web IDE for WCH CH32 RISC-V and the ch32fun SDK

A **100% client-side** IDE that compiles bare-metal **RISC-V** firmware directly in the browser using the real GNU toolchain (**GCC 15.2.0** + **GNU Binutils 2.44**) compiled to **WebAssembly**. Specialized for the **WCH CH32** family and the **ch32fun SDK** (ch32fun + extralibs + rv003usb). No compilation servers: everything runs in a Web Worker.

> Based on the decoupled architecture of `avr-gcc-wasm` and `pcbkit-io/toolchain`: each component of the GNU chain is compiled to WASM separately and orchestrated sequentially in JS, because the browser has no `fork()`/`exec()` and the `riscv-none-elf-gcc` driver (which only coordinates processes) cannot run.

---

## 🏗️ System Architecture

The **worker** (`src/compiler-worker.js`) is the conductor. For each tool it instantiates a fresh Emscripten module (with its own virtual **MEMFS** filesystem) and feeds it the "world" it needs (SDK headers + sources + sysroot). The same `.wasm` binary is reused across every compilation, with no state leakage.

```
                    Browser / Web Worker (isolated from the UI thread)

  [Board bundle: public/ch32fun/]              [toolchain release v0.1.0 (WASM)]
   ├── headers.json   (real SDK tree)           ├── cc1.wasm         (C frontend, GCC 15.2.0)
   ├── gcc-headers.json                         ├── riscv-as.wasm    (assembler)
   └── sdk/  (ch32fun.c, ch32fun.ld, rv003usb.*)├── riscv-ld.wasm    (linker)
        │                                       ├── riscv-objdump.wasm
        ▼                                       ├── riscv-size.wasm
   MEMFS:  /include/ch32fun/...  /include/extralibs/├── riscv-objcopy.wasm
           /include/{sys,machine,ssp}/...           └── sysroot/ (libc.a, libgcc.a per multilib)
        │
        ▼
   [project: /main.c  /funconfig.h  /ch32fun.ld  /usb_config.h]
        │
        ▼
   ┌──────────────┐  .s  ┌──────────────┐  .o  ┌──────────────┐
   │   cc1.wasm   │─────►│ riscv-as.wasm│─────►│ (object .o)  │
   └──────────────┘       └──────────────┘       └──────────────┘  [main.o, ch32fun.o, rv003usb.o]
                                                     │
   [ch32fun.ld preprocessed with cc1 -E -P] ────────►│ riscv-ld.wasm  (+libc.a, +libgcc.a) ──► main.elf
                                                     │
        ┌────────────────────────────────────────────┤
        ▼                ▼                ▼          ▼
   riscv-objdump   riscv-size     riscv-objcopy   riscv-objcopy
   (disassembly)    (Flash/SRAM)  → main.hex     → main.bin
```

Every tool runs **live**: no precompiled binaries, no fake objects. Every `.o` is generated from the SDK and user source code.

---

## 🔩 The Compilation Pipeline (how it connects to the compiler)

### 1. The toolchain (what "the compiler" actually is)

The toolchain **does not live in this repo**. It is the pinned **`v0.1.0`** release of [`riscv-wasm-toolchain`](https://github.com/NoNamedCat/riscv-wasm-toolchain) (see `TOOLCHAIN_RELEASE` in `src/toolchain-loader.mjs`). `toolchain-loader.mjs`:

1. Fetches it from `raw.githubusercontent.com` (which sends `Access-Control-Allow-Origin: *`; GitHub release assets do not).
2. Decompresses it and **parses the `tar` (ustar) into an in-memory `Map<relPath, Uint8Array>`**.
3. In the browser it **caches the compressed bytes in IndexedDB** keyed by release tag: subsequent compilations never re-download it.

The tar contains: `cc1`/`riscv-as`/`riscv-ld`/`riscv-objdump`/`riscv-size`/`riscv-objcopy` (`.js`+`.wasm`), the `sysroot/` (newlib `libc.a` and `libgcc.a` per multilib), and `manifest.json`.

### 2. The worker (the conductor)

`compiler-worker.js` runs in a **Web Worker** (isolating compilation from the UI thread). `loadToolFactory()` runs each tool's Emscripten JS and returns a factory; every stage instantiates a fresh module (`noInitialRun`). Messages between the worker and UI go through `postMessage` (logs, progress, and the final result).

### 3. The virtual filesystem (the real bridge)

Before invoking each tool, the worker "mounts the world" into its MEMFS:

- **`populateFSHeaders`** writes `headers.json` into `/include/...` **preserving the real tree** of the SDK → `/include/ch32fun/ch32fun.h`, `/include/extralibs/ch32v003_GPIO_branchless.h`, `/include/sys/stdio.h`, etc. It writes `gcc-headers.json` into `/opt/riscv-wasm/lib/gcc/riscv32-unknown-elf/15.2.0/include` (the exact `--prefix` `cc1` was built with), so it finds its own `stddef.h`/`stdarg.h`.
- **`populateProjectFiles`** writes the project files (`main.c`, `funconfig.h`, `ch32fun.ld`, `usb_config.h`) at the MEMFS root.
- The sysroot libraries (`libc.a`, `libgcc.a`) are written to `/sysroot/...` **only** in the linking stage.

### 4. The stages

1. **`cc1`** compiles **`ch32fun.c`** (the SDK: interrupt vectors, `SystemInit`, `printf` over UART) → `.s`
2. **`as`** assembles it → `ch32fun.o`
   *(if the project uses USB: `rv003usb.c` via cc1+as, and `rv003usb.S` via `cc1 -E` preprocessing then `as`)*
3. **`cc1`** compiles **`main.c`** (your code) → `.s`
4. **`as`** assembles it → `main.o`
5. **`cc1 -E -P`** preprocesses **`ch32fun.ld`** (the linker script uses `#if` on the `TARGET_MCU*` macros) → final `.ld`; **`ld`** links all objects + `libc.a`/`libgcc.a` (the selected multilib) → `main.elf`
6. **`objdump`** (disassembly), **`size`** (Flash/SRAM), **`objcopy`** (`.hex` + `.bin`)

### 5. The include roots

`CH32FUN_INCLUDE_DIRS` (`src/compiler-worker.js`) is the wasm translation of the upstream `ch32fun.mk` `-I` flags (`-I$(CH32FUN) -I$(CH32FUN)/../extralibs -I.`):

```
-I.  -I/  -I/include/ch32fun  -I/include/extralibs  -I/include
```

Order matters: the project directory first (a project's own `funconfig.h` wins), then the library roots, then the flat newlib bundle. Because the real tree is preserved, a relative include like `#include "../ch32fun/ch32fun.h"` (from `extralibs/`) resolves to `/include/ch32fun/ch32fun.h` — just as it would on disk.

### 6. Multilib = identical to the native gcc

`matchMultilib` (`src/multilib.js`) replicates the `riscv32-unknown-elf-gcc` driver algorithm: **exact ABI**, **exact xlen**, **multilib ISA ⊆ requested ISA**, and among the candidates the one with the **most extensions** wins (lexicographic tie-break). **If none match, it fails** (no silent fallback). `libc.a` and `libgcc.a` are taken from that multilib's sysroot.

---

## 📦 The board package (public/ch32fun/)

This is what makes FunStudio "the ch32fun one". None of it is in the generic toolchain; it is loaded separately:

| File | Contents |
|---|---|
| `headers.json` | **181 headers with their real tree**: `ch32fun/` (9), `extralibs/` (28), and newlib `sys/` (43), `machine/` (18), `ssp/` (7), `rpc/` (2) + flat top-level (`stdio.h`, `stdint.h`, `funconfig.h`, `rv003usb.h`, `cdc.h`, `tusb_types.h`, `tinyusb_hid.h`, …). |
| `gcc-headers.json` | GCC's internal headers (`stddef.h`, `stdarg.h`, …) that `cc1` needs in its `--prefix`. |
| `sdk/ch32fun.c` | The SDK source: interrupt vectors, `SystemInit`, `printf` over UART. |
| `sdk/ch32fun.ld` | Linker script with `#if` on `TARGET_MCU_LD`/`MCU_PACKAGE`/`MEMORY_SPLIT` (preprocessed with cc1). |
| `sdk/rv003usb.c` + `rv003usb.S` | Software USB (TinyUSB-style), compiled only if the project uses it. |

**Project files** (the ones you see in the editor): `main.c` (your code), `funconfig.h` (SDK config — there is a *default* in the bundle that a project can override), `ch32fun.ld` (linker script), and `usb_config.h` (only with rv003usb).

---

## 🎛️ Hardware (MCU) and configuration

`getHardwareMcuConfig` resolves, per MCU, a set of `-D` defines (`TARGET_MCU`, `TARGET_MCU_LD`, `MCU_PACKAGE`, `TARGET_MCU_MEMORY_SPLIT`, …). Those defines **preprocess `ch32fun.ld`** and select the memory block (FLASH/RAM) of the script. The worker recognizes a superset of MCUs (CH32V002/003/004/005/006/007, CH32V103/V203/V307, CH32L103, CH32X03x, CH57x/58x/59x, CH32H41x); the UI catalogue exposes ready profiles: **CH32V003, CH32V006, CH32X035, CH32V103, CH32V203, CH32V307, CH32L103, CH582**, each with its `arch`/`abi` (e.g. `rv32ec`/`ilp32e` for V003, `rv32imafc`/`ilp32f` for V307).

---

## 📚 Example catalogue

`src/catalogue.js` defines the hardware database and **73 examples** across **11 categories** (GPIO, ADC/DMA, Timers/PWM, I2C/Displays, UART, SPI/Radios, Software USB, USB/PD, Interrupts, System/Clocks/Power). Each example is `{ id, title, category, description, mcus[], code, funconfig }` and loads as an editable project (it opens `main.c` + its `funconfig.h`). The `examples/` folder also contains some standalone `.c`/`.ld` files (`blink.c`, `gpio_interrupt.c`, `uart_hello.c`, `riscv32-baremetal.ld`).

---

## 🖥️ UI

- **i18n** (`src/i18n.js`): English, Spanish, French, German.
- **Themes** (`src/themes.js`): 15 (VS Code Dark+, One Dark Pro, Dracula, Tokyo Night, Synthwave '84, Nord, Catppuccin Mocha/Latte, Gruvbox, Monokai Pro, Solarized Dark/Warm, VS Code Light+, GitHub Light, Nord Snow).
- Multi-file editor with tabs (`src/projects.js`); every project file opens as a tab and `main.c` is active.
- Live output: per-stage logs, assembly, disassembly, map, Flash/SRAM, and download of `.elf`/`.hex`/`.bin`.

---

## 📁 Project Structure

```
Fun_Studio/
├── server.js                 # HTTP server with COOP/COEP headers for WASM (port 3000)
├── index.html                # Web UI (the IDE)
├── package.json              # npm scripts (dev/build/preview/serve)
├── src/
│   ├── app.js                # Frontend controller, worker, tabs, downloads
│   ├── compiler-worker.js    # Web Worker chaining cc1 → as → ld → objdump/size/objcopy
│   ├── toolchain-loader.mjs  # Downloads the toolchain release and caches it (IndexedDB)
│   ├── multilib.js           # Multilib selection (the gcc driver algorithm)
│   ├── catalogue.js          # Hardware database + example catalogue + funconfig/usb/ld
│   ├── projects.js           # Multi-file project management
│   ├── i18n.js               # Translations (en/es/fr/de)
│   ├── themes.js             # Editor themes
│   └── vendor/fflate.mjs     # gunzip of the toolchain (vendored)
├── examples/                 # standalone .c/.ld (blink, gpio_interrupt, uart_hello, baremetal.ld)
├── public/
│   └── ch32fun/              # Board package: headers.json (real tree), gcc-headers.json, sdk/
├── tests/                    # compile-harness.mjs (E2E), multilib.test.mjs, toolchain-loader.test.mjs
└── docs/                     # Toolchain design and plans
```

---

## 🚀 Quick start

```bash
npm install
npm run serve        # Node server with COOP/COEP headers → http://localhost:3000
```

> `COOP`/`COEP` (`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`) are required for dynamic WebAssembly memory and cross-origin isolation.

1. Pick your MCU (e.g. **CH32V003**).
2. Pick an example from the catalogue.
3. Press **Compile** (`Ctrl+Enter`).
4. Review the per-stage logs, the assembly/disassembly, and download `.elf`/`.hex`/`.bin`.

---

## ✅ Tests

```bash
node tests/compile-harness.mjs   # E2E in Node: imports compiler-worker.js and uses the same sysroot/worker
node tests/multilib.test.mjs
node tests/toolchain-loader.test.mjs
```

The harness compiles the representative cases (blink, GPIO branchless, USB CDC, …) in Node, validating that the `.o` objects are generated and the binary is correct — the same path the browser uses.

---

## 🛠️ Toolchain Build Pipeline (separate repo)

The toolchain is **not built here**. The `build-riscv-wasm.sh` script in [`riscv-wasm-toolchain`](https://github.com/NoNamedCat/riscv-wasm-toolchain) automates: downloading GCC 15.2.0 + Binutils 2.44 + GMP/MPFR/MPC + Newlib, compiling a native cross toolchain (to generate `libc.a`/`libm.a`/`libgcc.a`/`crt0.o` with its *multilib generator*), compiling each tool to WASM (`--host=wasm32` with emsdk), and publishing a **release** (`riscv-wasm-toolchain.tar.gz`). This repo only **consumes** it at runtime.
