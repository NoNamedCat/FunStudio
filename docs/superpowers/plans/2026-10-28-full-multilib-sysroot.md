# Full Multilib Sysroot (PC-grade linking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the web IDE link exactly like a real `riscv32-unknown-elf-gcc` driver: a genuine multilib sysroot (per-multilib `libgcc.a`, newlib `libc.a`) built from the same GCC 15.2.0 source, selected by a real multilib-matching algorithm — no manual picking, no silent fallbacks.

**Architecture:** Run the native (x86_64 host) toolchain build that `build-riscv-wasm.sh` already defines but never ran: native binutils + gcc with `--with-multilib-list` covering every WCH arch/abi pair + newlib. Package the resulting `lib/gcc/riscv32-unknown-elf/15.2.0/<multilib>/` tree verbatim into `public/wasm-toolchain/sysroot/`. The worker populates that layout into the linker MEMFS and selects the multilib with a proper algorithm (exact match, else superset-subset ISA rule, ABI must match), linking `libc.a` + the chosen `libgcc.a` like the driver's `-lc -lgcc`.

**Tech Stack:** GCC 15.2.0 (source `build/gcc-15.2.0/`), Newlib, Node.js test harness, existing WASM tools (cc1/as/ld/objcopy).

**Spec:** user request — "el entorno completo para que esto funcione como en un PC, sin atajos" + prior diagnosis (single rv32e libgcc.a forced for all targets).

## Global Constraints

- Multilib pairs required (from `src/catalogue.js`): `rv32ec/ilp32e`, `rv32imac/ilp32`, `rv32imafc/ilp32f`. Base set kept: `rv32i,rv32im,rv32imc,rv32imac` (ilp32).
- Native build prefix: `build/opt/native-riscv` (`$OPT_NATIVE`). No change to WASM cc1/as/ld builds.
- Sysroot layout in web assets must mirror the real one: `sysroot/lib/gcc/riscv32-unknown-elf/15.2.0/<multilib-dir>/libgcc.a` where multilib-dir is nested (`rv32imac/ilp32`), plus `sysroot/lib/libc.a`.
- Link order (driver-like): object files, then `libc.a`, then the selected `libgcc.a` (GCC puts -lgcc last).
- If no multilib matches the requested `-march/-mabi` → hard error, same as a real gcc driver. No silent fallback to a wrong libgcc.
- `riscv32-unknown-elf-readelf` from `$OPT_NATIVE/bin` is used by tests to verify ELF arch/abi of linked output.

## Review Focus

- User code with 64-bit arithmetic (`uint64_t` mul/div) on an `ilp32` target — must pull `__muldi3`/`__divdi3` from the correct ilp32 libgcc (Task 4 test).
- Target `rv32imafc/ilp32f` — selected libgcc must be the ilp32f one, not ilp32e (Task 4 test).
- Target `rv32ec/ilp32e` — must select the ilp32e multilib, never an ilp32 one (Task 4 test).
- Unknown/unbuilt `-march/-mabi` combo — must fail with a clear error, not link with a random libgcc (Task 4 test).
- `libc`-dependent code (e.g. `memset` of a large buffer) — must link via `sysroot/lib/libc.a` (Task 4 test).

---

### Task 1: Native multilib toolchain build (gcc + newlib)

**Files:**
- Modify: `build-riscv-wasm.sh` (multilib list, ~line 111)
- Produces: `build/opt/native-riscv/lib/gcc/riscv32-unknown-elf/15.2.0/<multilib>/libgcc.a` for all pairs, `build/opt/native-riscv/riscv32-unknown-elf/lib/libc.a`, `build/opt/native-riscv/bin/riscv32-unknown-elf-readelf`

**Interfaces:**
- Consumes: nothing (source already extracted).
- Produces: the native multilib tree that Tasks 2-3 package and select from.

- [ ] Step 1: Extend `--with-multilib-list` in `build-riscv-wasm.sh` to `rv32i,rv32im,rv32imc,rv32imac,rv32e/ilp32e,rv32ec/ilp32e,rv32em/ilp32e,rv32imafc/ilp32f`
- [ ] Step 2: Run the native build portion of the script (native binutils, native gcc all-gcc + all-target-libgcc, newlib). This is the long step (~30-60 min, -j36).
- [ ] Step 3: Verify every required pair exists: for each dir in `rv32e/ilp32e rv32ec/ilp32e rv32em/ilp32e rv32i/ilp32 rv32im/ilp32 rv32imc/ilp32 rv32imac/ilp32 rv32imafc/ilp32f` check `lib/gcc/riscv32-unknown-elf/15.2.0/<dir>/libgcc.a` exists and `riscv32-unknown-elf-readelf -A` shows the matching arch (`rv32e`-class for e, `rv32i`+`m`+`a`+`c` as expected).
- [ ] Step 4: Commit script change + build state is on disk (no binary commit).

### Task 2: Package multilib sysroot into web assets (preserving structure)

**Files:**
- Modify: `build-riscv-wasm.sh` step 7 (sysroot packaging, ~lines 196-213)
- Produces: `public/wasm-toolchain/sysroot/lib/gcc/riscv32-unknown-elf/15.2.0/<multilib>/libgcc.a` (+ crt objects), `public/wasm-toolchain/sysroot/lib/libc.a`, updated `manifest.json`

**Interfaces:**
- Consumes: Task 1 native tree.
- Produces: files the worker fetches by exact sysroot-relative path.

- [ ] Step 1: Replace the flattening `find ... -exec cp` with a structure-preserving copy: `cp -r "$OPT_NATIVE/lib/gcc/$TARGET/$GCC_VERSION" "$SYSROOT/lib/gcc/$TARGET/"` and `cp "$OPT_NATIVE/$TARGET/lib/libc.a" "$SYSROOT/lib/"` (keep existing header handling).
- [ ] Step 2: Regenerate `manifest.json` (existing node snippet) and confirm the multilib `libgcc.a` files appear in it.
- [ ] Step 3: Remove the now-wrong flat files (`sysroot/lib/libgcc.a` copies) so only the multilib tree exists; keep `sdk/libgcc.a` (old fallback) until Task 3 removes its use.
- [ ] Step 4: Commit.

### Task 3: Worker — sysroot-aware link with real multilib matching

**Files:**
- Create: `src/multilib.js` — pure function `matchMultilib(march, abi, availableMultilibs)` + `ISA` helpers, zero deps (testable in node).
- Modify: `src/compiler-worker.js` — load sysroot manifest, populate ld MEMFS, replace the ad-hoc libgcc picking block (~lines 737-764) with multilib selection + `libc.a` + selected `libgcc.a`; hard error on no match.

**Interfaces:**
- Consumes: `manifest.json` sysroot paths.
- Produces: correct link args; a single source of truth for selection.

- [ ] Step 1 (TDD): Write `tests/multilib.test.mjs` (node:assert, no framework) cases:
  - `matchMultilib("rv32ec_zicsr","ilp32e", list)` → `rv32ec/ilp32e`
  - `matchMultilib("rv32imac_zicsr","ilp32", list)` → `rv32imac/ilp32`
  - `matchMultilib("rv32imafc_zicsr","ilp32f", list)` → `rv32imafc/ilp32f`
  - `matchMultilib("rv32imac","ilp32e", list)` → throws (ABI mismatch)
  - `matchMultilib("rv32imac_zicsr","ilp32", listWithoutImac)` → superset fallback to `rv32im/ilp32` (variant ISA ⊆ requested)
  - `matchMultilib("rv32i","ilp32", list)` with only rv32im variants → throws (requested ISA smaller than any variant)
- [ ] Step 2: Run test → FAIL (module missing).
- [ ] Step 3: Implement `src/multilib.js`: parse ISA letters from march string (i/m/a/c/e/f), multilib dirs `arch/abi`; candidate = same abi (e-ness must match; f only when requested) AND candidate ISA ⊆ requested ISA; pick largest candidate ISA (most specific), tie → lexicographic.
- [ ] Step 4: Run test → PASS.
- [ ] Step 5: Wire into worker: fetch sysroot files (manifest-driven) into ld MEMFS at `/sysroot/...`; link args after objects: `/sysroot/lib/libc.a`, `/sysroot/lib/gcc/riscv32-unknown-elf/15.2.0/<selected>/libgcc.a`; log the selected multilib; throw on no match (message like a real driver: "No libgcc for requested -march/-mabi"). Remove old `cachedLibgccByKey` best-guess block.
- [ ] Step 6: Commit.

### Task 4: End-to-end compile tests per architecture

**Files:**
- Create: `tests/compile-harness.mjs` — loads `src/compiler-worker.js` in Node (shim `self`), runs builds for: CH32V003 blink (rv32ec/ilp32e), CH32V203 blink (rv32imac/ilp32), CH32V307 blink (rv32imafc/ilp32f), CH32V203 64-bit math (`uint64_t` mul+div), CH32V203 `memset`-heavy (libc). Asserts: success, selected multilib logged, ELF valid (native readelf: RISC-V, entry present), `.map` references the correct multilib `libgcc.a` path, `--print-memory-usage` sane.

**Interfaces:**
- Consumes: worker + sysroot from Tasks 2-3.
- Produces: green/red evidence for the whole pipeline.

- [ ] Step 1: Write harness with all 5 cases (failing run first: wrong/missing multilib selection → non-zero exit).
- [ ] Step 2: Run harness → fix issues found.
- [ ] Step 3: All 5 pass; commit.

### Task 5: Docs + cleanup

**Files:**
- Modify: `README.md` (sysroot/multilib section: how the sysroot is built, which multilibs, how selection works).
- Remove: obsolete `public/wasm-toolchain/sdk/libgcc/` variants dir and `sdk/libgcc.a` if nothing references them; remove `cachedLibgccA` leftover code.

- [ ] Step 1: Verify nothing references the old flat libgcc paths (`grep -rn "sdk/libgcc" src public` → none).
- [ ] Step 2: Update README.
- [ ] Step 3: Final full test run (Task 4 harness) + commit.
