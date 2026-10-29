#!/usr/bin/env bash
# ==============================================================================
# RISC-V GCC & GNU Binutils WebAssembly Builder
# ==============================================================================
# Compiles GCC 15.2.0 (or target GCC) and GNU Binutils for RISC-V (rv32imc) to WebAssembly.
# Output artifacts:
#   - cc1.js / cc1.wasm (C compiler)
#   - cc1plus.js / cc1plus.wasm (C++ compiler)
#   - riscv-as.js / riscv-as.wasm (GNU Assembler)
#   - riscv-ld.js / riscv-ld.wasm (GNU Linker)
#   - riscv-objcopy.js / riscv-objcopy.wasm (Objcopy: ELF to HEX/BIN)
#   - sysroot/ (Headers, libc.a, libm.a, libgcc.a, crt0.o, link.ld)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${BUILD_DIR:-$SCRIPT_DIR/build}"
DIST_DIR="${DIST_DIR:-$SCRIPT_DIR/public/wasm-toolchain}"
OPT_NATIVE="${OPT_NATIVE:-$BUILD_DIR/opt/native-riscv}"
OPT_WASMDEPS="${OPT_WASMDEPS:-$BUILD_DIR/opt/wasmdeps}"
JOBS="${JOBS:-$(nproc)}"

# Versions
GCC_VERSION="${GCC_VERSION:-15.2.0}"
BINUTILS_VERSION="${BINUTILS_VERSION:-2.44}"
GMP_VERSION="${GMP_VERSION:-6.3.0}"
MPFR_VERSION="${MPFR_VERSION:-4.2.1}"
MPC_VERSION="${MPC_VERSION:-1.3.1}"
NEWLIB_VERSION="${NEWLIB_VERSION:-4.5.0.20241231}"

TARGET="riscv32-unknown-elf"
ARCH="rv32imc"
ABI="ilp32"

mkdir -p "$BUILD_DIR" "$DIST_DIR" "$OPT_NATIVE" "$OPT_WASMDEPS" "$DIST_DIR/sysroot"
cd "$BUILD_DIR"

echo "=== RISC-V GCC WASM Build Pipeline ==="
echo "Target: $TARGET ($ARCH / $ABI)"
echo "GCC: $GCC_VERSION | Binutils: $BINUTILS_VERSION"
echo "Jobs: $JOBS"

# 1. Ensure Emscripten environment
if ! command -v emcc &> /dev/null; then
  if [ -f "$HOME/emsdk/emsdk_env.sh" ]; then
    echo "Activating Emscripten from $HOME/emsdk..."
    source "$HOME/emsdk/emsdk_env.sh"
  else
    echo "Error: emcc not found and $HOME/emsdk/emsdk_env.sh does not exist!"
    exit 1
  fi
fi

# 2. Download and extract sources
download_and_extract() {
  local name="$1"
  local url="$2"
  local tarball="$3"
  local folder="$4"

  if [ ! -d "$folder" ]; then
    if [ ! -f "$tarball" ]; then
      echo "Downloading $name from $url..."
      curl -fsSL -o "$tarball" "$url"
    fi
    echo "Extracting $tarball..."
    tar -xf "$tarball"
  fi
}

download_and_extract "GMP" "https://ftp.gnu.org/gnu/gmp/gmp-$GMP_VERSION.tar.xz" "gmp-$GMP_VERSION.tar.xz" "gmp-$GMP_VERSION"
download_and_extract "MPFR" "https://ftp.gnu.org/gnu/mpfr/mpfr-$MPFR_VERSION.tar.xz" "mpfr-$MPFR_VERSION.tar.xz" "mpfr-$MPFR_VERSION"
download_and_extract "MPC" "https://ftp.gnu.org/gnu/mpc/mpc-$MPC_VERSION.tar.gz" "mpc-$MPC_VERSION.tar.gz" "mpc-$MPC_VERSION"
download_and_extract "Binutils" "https://ftp.gnu.org/gnu/binutils/binutils-$BINUTILS_VERSION.tar.xz" "binutils-$BINUTILS_VERSION.tar.xz" "binutils-$BINUTILS_VERSION"
download_and_extract "GCC" "https://ftp.gnu.org/gnu/gcc/gcc-$GCC_VERSION/gcc-$GCC_VERSION.tar.xz" "gcc-$GCC_VERSION.tar.xz" "gcc-$GCC_VERSION"
download_and_extract "Newlib" "https://sourceware.org/ftp/newlib/newlib-$NEWLIB_VERSION.tar.gz" "newlib-$NEWLIB_VERSION.tar.gz" "newlib-$NEWLIB_VERSION"

SRC_GCC="$BUILD_DIR/gcc-$GCC_VERSION"
SRC_BINUTILS="$BUILD_DIR/binutils-$BINUTILS_VERSION"
SRC_NEWLIB="$BUILD_DIR/newlib-$NEWLIB_VERSION"
BUILD_GUESS=$("$SRC_GCC/config.guess")

# Link GMP, MPFR, MPC into GCC source tree for native build
for d in "gmp-$GMP_VERSION" "mpfr-$MPFR_VERSION" "mpc-$MPC_VERSION"; do
  ln -sfn "$BUILD_DIR/$d" "$SRC_GCC/${d%%-*}"
done
for s in "$SRC_BINUTILS" "$SRC_GCC"; do
  sed -i '/^development=/s/true/false/' "$s/bfd/development.sh" 2>/dev/null || true
done

# 3. Native build for Target runtime libraries (libgcc, newlib, linker scripts)
export PATH="$OPT_NATIVE/bin:$PATH"

if [ ! -f "$OPT_NATIVE/bin/$TARGET-ld" ]; then
  echo "--- Building native $TARGET-binutils ---"
  mkdir -p native-binutils && cd native-binutils
  "$SRC_BINUTILS/configure" --target="$TARGET" --prefix="$OPT_NATIVE" \
    --disable-nls --disable-werror --disable-gdb --disable-gdbserver --disable-sim --disable-gprofng --disable-doc
  make -j"$JOBS" && make install
  cd "$BUILD_DIR"
fi

if [ ! -f "$OPT_NATIVE/bin/$TARGET-gcc" ]; then
  echo "--- Building native $TARGET-gcc (bootstrap) ---"
  mkdir -p native-gcc && cd native-gcc
  "$SRC_GCC/configure" --build="$BUILD_GUESS" --host="$BUILD_GUESS" --target="$TARGET" --prefix="$OPT_NATIVE" \
    --enable-languages=c,c++ --disable-bootstrap --disable-nls --disable-shared --disable-threads \
    --disable-libssp --disable-libada --disable-libquadmath --disable-libgomp --disable-libvtv \
    --disable-libstdcxx --disable-lto --with-arch="$ARCH" --with-abi="$ABI" \
    --with-multilib-generator="rv32ec-ilp32e--;rv32imac-ilp32--;rv32imafc-ilp32f--" MAKEINFO=missing
  make -j"$JOBS" all-gcc && make install-gcc
  cd "$BUILD_DIR"
fi

if [ ! -f "$OPT_NATIVE/$TARGET/lib/libc.a" ]; then
  echo "--- Building native Newlib for $TARGET ---"
  mkdir -p native-newlib && cd native-newlib
  "$SRC_NEWLIB/configure" --target="$TARGET" --prefix="$OPT_NATIVE" \
    --disable-newlib-supplied-syscalls --enable-newlib-reent-small --disable-newlib-fvwrite-in-streamio \
    --disable-newlib-fseek-optimization --disable-newlib-wide-orient --enable-newlib-nano-malloc \
    --disable-newlib-unbuf-stream-opt --enable-lite-exit --enable-newlib-global-atexit --enable-newlib-nano-formatted-io
  make -j"$JOBS" && make install
  cd "$BUILD_DIR"

  # Now finish building libgcc with target headers present
  echo "--- Finishing native libgcc for $TARGET ---"
  cd native-gcc
  make -j"$JOBS" all-target-libgcc && make install-target-libgcc
  cd "$BUILD_DIR"
fi

# 4. Cross-compile GMP, MPFR, MPC to WebAssembly
echo "--- Compiling math libraries to WebAssembly ---"
printf 'am_cv_ar_has_plugin=no\nam_cv_ranlib_has_plugin=no\n' > "$BUILD_DIR/emsc-site"
export CONFIG_SITE="$BUILD_DIR/emsc-site" CC_FOR_BUILD=gcc CXX_FOR_BUILD=g++ HOST_CC=gcc BUILD_CC=gcc
HOST_FLAGS="-DHAVE_PSIGNAL=1 -DCODY_NETWORKING=0 -DELIDE_CODE -Os"

if [ ! -f "$OPT_WASMDEPS/lib/libmpc.a" ]; then
  (cd "gmp-$GMP_VERSION" && emconfigure ./configure --build="$BUILD_GUESS" --host=wasm32 --prefix="$OPT_WASMDEPS" --disable-shared --enable-static --disable-assembly CC_FOR_BUILD=gcc && emmake make -j"$JOBS" && emmake make install && make distclean)
  (cd "mpfr-$MPFR_VERSION" && emconfigure ./configure --build="$BUILD_GUESS" --host=wasm32 --prefix="$OPT_WASMDEPS" --disable-shared --enable-static --with-gmp="$OPT_WASMDEPS" && emmake make -j"$JOBS" && emmake make install && make distclean)
  (cd "mpc-$MPC_VERSION" && emconfigure ./configure --build="$BUILD_GUESS" --host=wasm32 --prefix="$OPT_WASMDEPS" --disable-shared --enable-static --with-gmp="$OPT_WASMDEPS" --with-mpfr="$OPT_WASMDEPS" && emmake make -j"$JOBS" && emmake make install && make distclean)
fi

# Remove in-tree math links so GCC wasm build uses $OPT_WASMDEPS
for d in gmp mpfr mpc; do rm -f "$SRC_GCC/$d"; done

# 5. Cross-compile cc1 and cc1plus to WebAssembly
echo "--- Compiling GCC (cc1, cc1plus) to WebAssembly ---"
mkdir -p wasm-gcc && cd wasm-gcc
if [ ! -f Makefile ]; then
  emconfigure "$SRC_GCC/configure" --build="$BUILD_GUESS" --host=wasm32 --target="$TARGET" --prefix="$BUILD_DIR/opt/riscv-wasm" \
    --enable-languages=c,c++ --with-gmp="$OPT_WASMDEPS" --with-mpfr="$OPT_WASMDEPS" --with-mpc="$OPT_WASMDEPS" \
    --disable-bootstrap --disable-shared --disable-threads --disable-nls --disable-libssp --disable-libada \
    --disable-libquadmath --disable-libgomp --disable-libvtv --disable-libstdcxx --disable-lto \
    --with-arch="$ARCH" --with-abi="$ABI" --without-headers --disable-werror MAKEINFO=missing
fi

emmake make -O -j"$JOBS" all-gcc "CFLAGS=$HOST_FLAGS" "CXXFLAGS=$HOST_FLAGS" || true

rm -f gcc/cc1 gcc/cc1plus
emmake make -O -j"$JOBS" -C gcc cc1 cc1plus "CFLAGS=$HOST_FLAGS" "CXXFLAGS=$HOST_FLAGS" \
  "LDFLAGS=-sMODULARIZE=1 -sEXPORT_NAME=createModule -sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=FS,callMain -sALLOW_MEMORY_GROWTH=1 -sUSE_ZLIB=1 -sINITIAL_MEMORY=64MB -sMAXIMUM_MEMORY=2GB -sSTACK_SIZE=8MB"

install -D gcc/cc1 "$DIST_DIR/cc1.js"
install -D gcc/cc1.wasm "$DIST_DIR/cc1.wasm"
install -D gcc/cc1plus "$DIST_DIR/cc1plus.js"
install -D gcc/cc1plus.wasm "$DIST_DIR/cc1plus.wasm"
cd "$BUILD_DIR"

# 6. Cross-compile Binutils (as, ld, objcopy) to WebAssembly
echo "--- Compiling Binutils (as, ld, objcopy) to WebAssembly ---"
mkdir -p wasm-binutils && cd wasm-binutils
if [ ! -f Makefile ]; then
  emconfigure "$SRC_BINUTILS/configure" --target="$TARGET" --host=wasm32 --enable-ld=default \
    --enable-default-execstack=no --enable-deterministic-archives --disable-doc --disable-gprof \
    --disable-gprofng --disable-nls --disable-gdb --disable-gdbserver --disable-libdecnumber \
    --disable-readline --disable-sim --disable-werror
fi

emmake make -O -j"$JOBS" "CFLAGS=$HOST_FLAGS"
rm -f gas/as-new ld/ld-new binutils/objcopy
SINGLE_FLAGS="-sMODULARIZE=1 -sEXPORT_NAME=createModule -sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=FS,callMain -sALLOW_MEMORY_GROWTH=1 -sUSE_ZLIB=1"
emmake make -O -j"$JOBS" -C gas "CFLAGS=$HOST_FLAGS" "LDFLAGS=$SINGLE_FLAGS" as-new
emmake make -O -j"$JOBS" -C ld "CFLAGS=$HOST_FLAGS" "LDFLAGS=$SINGLE_FLAGS" ld-new
emmake make -O -j"$JOBS" -C binutils "CFLAGS=$HOST_FLAGS" "LDFLAGS=$SINGLE_FLAGS" objcopy

install -D gas/as-new "$DIST_DIR/riscv-as.js"
install -D gas/as-new.wasm "$DIST_DIR/riscv-as.wasm" 2>/dev/null || true
install -D ld/ld-new "$DIST_DIR/riscv-ld.js"
install -D ld/ld-new.wasm "$DIST_DIR/riscv-ld.wasm" 2>/dev/null || true
install -D binutils/objcopy "$DIST_DIR/riscv-objcopy.js"
install -D binutils/objcopy.wasm "$DIST_DIR/riscv-objcopy.wasm" 2>/dev/null || true
cd "$BUILD_DIR"

# 7. Package the Sysroot (Headers, Libraries, Linker Scripts)
echo "--- Packaging Sysroot ---"
SYSROOT="$DIST_DIR/sysroot"
mkdir -p "$SYSROOT/include" "$SYSROOT/lib" "$SYSROOT/ldscripts"

# Copy target headers
cp -r "$OPT_NATIVE/$TARGET/include/"* "$SYSROOT/include/"
cp -r "$OPT_NATIVE/lib/gcc/$TARGET/$GCC_VERSION/include" "$SYSROOT/include/gcc" 2>/dev/null || true

# Copy target libraries, preserving the multilib layout
cp -r "$OPT_NATIVE/$TARGET/lib/"* "$SYSROOT/lib/"
rm -f "$SYSROOT/lib/libgcc.a"
rm -rf "$SYSROOT/lib/gcc"
mkdir -p "$SYSROOT/lib/gcc/$TARGET"
cp -r "$OPT_NATIVE/lib/gcc/$TARGET/$GCC_VERSION" "$SYSROOT/lib/gcc/$TARGET/"

# Copy default linker script
if [ -d "$OPT_NATIVE/$TARGET/lib/ldscripts" ]; then
  cp "$OPT_NATIVE/$TARGET/lib/ldscripts/"* "$SYSROOT/ldscripts/"
fi

# Create a clean baremetal RISC-V linker script
cat << 'EOF' > "$SYSROOT/ldscripts/riscv32-baremetal.ld"
OUTPUT_ARCH("riscv")
ENTRY(_start)

MEMORY
{
  FLASH (rx)  : ORIGIN = 0x00000000, LENGTH = 4M
  RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 512K
}

SECTIONS
{
  .text : {
    . = ALIGN(4);
    KEEP(*(.init))
    KEEP(*(.init.*))
    *(.text)
    *(.text.*)
    *(.rodata)
    *(.rodata.*)
    . = ALIGN(4);
    _etext = .;
  } > FLASH

  .data : AT(_etext) {
    . = ALIGN(4);
    _sdata = .;
    *(.data)
    *(.data.*)
    *(.sdata)
    *(.sdata.*)
    . = ALIGN(4);
    _edata = .;
  } > RAM

  .bss : {
    . = ALIGN(4);
    _sbss = .;
    *(.bss)
    *(.bss.*)
    *(.sbss)
    *(.sbss.*)
    *(COMMON)
    . = ALIGN(4);
    _ebss = .;
  } > RAM

  .stack (NOLOAD) : {
    . = ALIGN(16);
    . += 0x2000; /* 8 KB stack */
    _stack_top = .;
  } > RAM
}
EOF

# Generate manifest.json of sysroot files for the web worker
node -e "
const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) results = results.concat(walk(full));
    else results.push(path.relative('$SYSROOT', full));
  });
  return results;
}
const files = walk('$SYSROOT');
fs.writeFileSync('$DIST_DIR/manifest.json', JSON.stringify({ sysrootFiles: files }, null, 2));
console.log('Manifest written with ' + files.length + ' files.');
"

echo "=== Build Complete! Artifacts written to $DIST_DIR ==="
ls -lh "$DIST_DIR"
