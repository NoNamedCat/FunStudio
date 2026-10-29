# RISC-V Web GCC Compiler (WebAssembly)

Compilador C/C++ completo para microcontroladores **RISC-V** ejecutándose directamente en el navegador web mediante **WebAssembly** y la última versión de **GCC (GCC 15.2.0)** junto a **GNU Binutils**.

Inspirado en la arquitectura desacoplada de `avr-gcc-wasm` y `pcbkit-io/toolchain`, este proyecto traslada la suite completa de compilación GNU bare-metal (`riscv32-unknown-elf`) al navegador sin necesidad de servidores de compilación remotos ni emuladores tipo QEMU.

---

## 🏗️ Arquitectura del Sistema

En los navegadores WebAssembly no existen las llamadas al sistema operativo POSIX `fork()` ni `exec()`, por lo que el ejecutable tradicional `riscv-none-elf-gcc` (que es solo un coordinador de procesos) no puede ejecutarse directamente.

La solución consiste en compilar cada componente de la cadena GNU de forma independiente y coordinarlos secuencialmente a través de un **Web Worker** en JavaScript utilizando el sistema de archivos virtual en memoria (**MEMFS** de Emscripten):

```
                   Navegador / Web Worker (Aislado)
  
   [Código C/C++]
         │
         ▼
  ┌──────────────┐     Genera ensamblador
  │   cc1.wasm   │ ──────────────────────────┐
  └──────────────┘                           ▼
                                      ┌──────────────┐    Genera código objeto
                                      │ riscv-as.wasm│ ──────────────────────────┐
                                      └──────────────┘                           ▼
                                                                          ┌──────────────┐
  [Sysroot: libc.a, libgcc.a, riscv32-baremetal.ld] ─────────────────────►│ riscv-ld.wasm│
                                                                          └──────────────┘
                                                                                 │
                                                              Genera binario ELF ▼
                                                                        ┌────────────────────┐
                                                                        │ riscv-objcopy.wasm │
                                                                        └────────────────────┘
                                                                                 │
                                                                                 ▼
                                                                 [firmware.hex / firmware.bin]
```

---

## 🚀 Inicio Rápido

### 1. Iniciar la interfaz web
El proyecto incluye un servidor HTTP nativo en Node.js configurado con las cabeceras requeridas (`Cross-Origin-Opener-Policy` y `Cross-Origin-Embedder-Policy`) para soportar la memoria dinámica de WebAssembly:

```bash
npm run serve
```
Abre tu navegador en: **`http://localhost:3000`**

### 2. Compilar firmware en el navegador
1. Selecciona tu microcontrolador objetivo (ej. **ESP32-C3**, **RP2350 RISC-V**, **CH32V003** o **Genérico RV32IMC**).
2. Escoge un ejemplo (Blink LED o UART Print + Math Benchmark).
3. Haz clic en **"Compilar"**.
4. Podrás ver en tiempo real:
   - Los logs de cada paso del compilador.
   - El código ensamblador RISC-V generado (`.s`).
   - El archivo Intel HEX (`.hex`).
   - Descargar los binarios listos para flashear (`.elf`, `.hex`, `.bin`).

---

## 🛠️ Compilación de los binarios WebAssembly (Build Pipeline)

El script `build-riscv-wasm.sh` (en el repo [`riscv-wasm-toolchain`](https://github.com/NoNamedCat/riscv-wasm-toolchain)) automatiza todo el proceso de construcción desde el código fuente oficial de GNU:

### Requisitos:
- **Linux** (x86_64 o ARM64)
- **Emscripten SDK (emsdk)** instalado (se autodetecta en `$HOME/emsdk`)
- Herramientas base: `gcc`, `g++`, `make`, `curl`, `tar`, `xz-utils`

### Ejecutar la construcción:
```bash
./build-riscv-wasm.sh
```

### ¿Qué hace el script?
1. **Descarga oficial:** Descarga GCC 15.2.0, GNU Binutils 2.44, GMP 6.3.0, MPFR 4.2.1, MPC 1.3.1 y Newlib 4.5.0.
2. **Build nativo:** Compila una versión bootstrap nativa de Binutils y GCC para generar las librerías del microcontrolador (`libc.a`, `libm.a`, `libgcc.a`, `crt0.o`).
3. **Dependencias a WASM:** Compila GMP, MPFR y MPC a WebAssembly (`--host=wasm32`) con `emconfigure` y `emmake`.
4. **Compilador a WASM:** Compila `cc1` y `cc1plus` (GCC 15.2.0) a WebAssembly exportando el sistema de archivos (`FS`) y la función `callMain`.
5. **Binutils a WASM:** Compila `gas` (`as`), `ld` y `objcopy` a WebAssembly.
6. **Empaquetado:** Empaqueta las herramientas `.wasm`, el sysroot y el `manifest.json` en un `riscv-wasm-toolchain.tar.gz` y publica un **release** en GitHub (`NoNamedCat/riscv-wasm-toolchain`).

> **El toolchain NO vive en este repo.** En runtime, `src/toolchain-loader.mjs` descarga el release pinado (`TOOLCHAIN_RELEASE`, ver. actual **v0.3.0**), lo descomprime en memoria y el worker lo consume desde ese mapa (nada de `public/wasm-toolchain/` local).
>
> El script de build anterior vive en el repo separado [`riscv-wasm-toolchain`](https://github.com/NoNamedCat/riscv-wasm-toolchain).

---

## 📦 Sysroot y selección multilib

El enlazado es **idéntico al de un `riscv32-unknown-elf-gcc` real**: el worker no elige librerías a mano, sino que resuelve la multilib correcta desde el sysroot y enlaza contra su `libgcc.a` + `libc.a` (newlib).

### Cómo se construye el sysroot

1. Una toolchain cruzada nativa (`riscv32-unknown-elf-gcc` 15.2.0 + Newlib 4.5.0) se configura con un *multilib generator*:
   ```
   --with-multilib-generator="rv32ec-ilp32e--;rv32imac-ilp32--;rv32imafc-ilp32f--"
   ```
2. `make all-target-libgcc` + `make install-target-libgcc` genera un `libgcc.a` por multilib.
3. Newlib genera un `libc.a` por multilib.
4. `build-riscv-wasm.sh` copia el árbol `lib/` preservando el layout multilib y emite `manifest.json` con la lista de ficheros.

### Multilibs disponibles

| Multilib | ISA base | libc.a | libgcc.a |
|---|---|---|---|
| `.` (base, rv32imc/ilp32) | rv32imc | `lib/libc.a` | `lib/gcc/riscv32-unknown-elf/15.2.0/libgcc.a` |
| `rv32ec/ilp32e` | rv32ec | `lib/rv32ec/ilp32e/libc.a` | `lib/gcc/riscv32-unknown-elf/15.2.0/rv32ec/ilp32e/libgcc.a` |
| `rv32imac_zaamo_zalrsc/ilp32` | rv32imac | `lib/rv32imac_zaamo_zalrsc/ilp32/libc.a` | `lib/gcc/riscv32-unknown-elf/15.2.0/rv32imac_zaamo_zalrsc/ilp32/libgcc.a` |
| `rv32imafc_zicsr_zaamo_zalrsc/ilp32f` | rv32imafc | `lib/rv32imafc_zicsr_zaamo_zalrsc/ilp32f/libc.a` | `lib/gcc/riscv32-unknown-elf/15.2.0/rv32imafc_zicsr_zaamo_zalrsc/ilp32f/libgcc.a` |

### Cómo se selecciona

El worker recibe `march`/`mabi` (p. ej. `rv32imac` / `ilp32`) y aplica el **algoritmo de matching de GCC**:

1. La **ABI debe ser exacta** (p. ej. `ilp32`).
2. El **xlen debe ser exacto** (32).
3. El **ISA de la multilib debe ser subconjunto** del ISA pedido.
4. Se elige la candidata con **más extensiones** (score); los empates se rompen lexicográficamente.
5. Si **ninguna** multilib coincide, el compilador **falla** (no hay fallback silencioso).

La librería exacta resultante se carga del sysroot y se pasa a `riscv-ld.wasm`, de modo que los símbolos (p. ej. `__udivdi3` de `libgcc.a` o `qsort` de `libc.a`) se resuelven de la multilib seleccionada, tal como en una máquina PC.

---

## 📁 Estructura del Proyecto

```
microcontroller-web-compiler/
├── server.js                 # Servidor HTTP con cabeceras COOP/COEP para WASM
├── index.html                # Interfaz web del compilador / IDE
├── package.json              # Configuración y scripts npm
├── src/
│   ├── app.js                # Lógica del frontend y gestión de descargas
│   ├── toolchain-loader.mjs  # Descarga y descomprime el release del toolchain en memoria
│   └── compiler-worker.js    # Web Worker que encadena cc1 -> as -> ld -> objcopy
├── examples/
│   ├── blink.c               # Ejemplo de parpadeo de LED baremetal
│   └── uart_hello.c          # Ejemplo de UART y benchmark matemático en RISC-V
└── public/
    └── ch32fun/              # Bundle local del consumidor: board/SDK (ch32fun.*, rv003usb.*)
                              #   + include bundles (headers.json, gcc-headers.json)
```
