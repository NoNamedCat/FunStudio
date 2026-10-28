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

El script `./build-riscv-wasm.sh` automatiza todo el proceso de construcción desde el código fuente oficial de GNU:

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
6. **Empaquetado:** Genera la carpeta `public/wasm-toolchain/` con el sysroot, las herramientas `.wasm` y el `manifest.json`.

---

## 📁 Estructura del Proyecto

```
microcontroller-web-compiler/
├── build-riscv-wasm.sh       # Script reproducible para compilar GCC 15 a WASM
├── server.js                 # Servidor HTTP con cabeceras COOP/COEP para WASM
├── index.html                # Interfaz web del compilador / IDE
├── package.json              # Configuración y scripts npm
├── src/
│   ├── app.js                # Lógica del frontend y gestión de descargas
│   └── compiler-worker.js    # Web Worker que encadena cc1 -> as -> ld -> objcopy
├── examples/
│   ├── blink.c               # Ejemplo de parpadeo de LED baremetal
│   └── uart_hello.c          # Ejemplo de UART y benchmark matemático en RISC-V
└── public/
    └── wasm-toolchain/       # Directorio de distribución de los binarios WASM
```
