# FunStudio — Web IDE para WCH CH32 RISC-V y el SDK ch32fun

IDE **100% client-side** que compila firmware baremetal **RISC-V** directamente en el navegador con la suite GNU real (**GCC 15.2.0** + **GNU Binutils 2.44**) compilada a **WebAssembly**. Especializado para la familia **WCH CH32** y el **SDK ch32fun** (ch32fun + extralibs + rv003usb). Sin servidores de compilación: todo ocurre en un Web Worker.

> Basado en la arquitectura desacoplada de `avr-gcc-wasm` y `pcbkit-io/toolchain`: cada componente de la cadena GNU se compila a WASM por separado y se orquesta secuencialmente en JS, porque en el navegador no existen `fork()`/`exec()` y el driver `riscv-none-elf-gcc` (que solo coordina procesos) no puede ejecutarse.

---

## 🏗️ Arquitectura del Sistema

El **worker** (`src/compiler-worker.js`) es el conductor. Para cada herramienta instancia un módulo de Emscripten fresco (con su propio filesystem virtual **MEMFS**) y lo alimenta con el "mundo" necesario (cabeceras del SDK + fuentes + sysroot). Así, el mismo binario `.wasm` se reutiliza en cada compilación sin fugas de estado.

```
                    Navegador / Web Worker (aislado del hilo de UI)

  [Bundle de board: public/ch32fun/]              [toolchain release v0.1.0 (WASM)]
   ├── headers.json   (árbol real del SDK)          ├── cc1.wasm         (front-end C, GCC 15.2.0)
   ├── gcc-headers.json                             ├── riscv-as.wasm    (assembler)
   └── sdk/  (ch32fun.c, ch32fun.ld, rv003usb.*)    ├── riscv-ld.wasm    (linker)
        │                                           ├── riscv-objdump.wasm
        ▼                                           ├── riscv-size.wasm
   MEMFS:  /include/ch32fun/...  /include/extralibs/├── riscv-objcopy.wasm
           /include/{sys,machine,ssp}/...           └── sysroot/ (libc.a, libgcc.a por multilib)
        │
        ▼
   [proyecto: /main.c  /funconfig.h  /ch32fun.ld  /usb_config.h]
        │
        ▼
   ┌──────────────┐  .s  ┌──────────────┐  .o  ┌──────────────┐
   │   cc1.wasm   │─────►│ riscv-as.wasm│─────►│ (obj .o)     │
   └──────────────┘       └──────────────┘       └──────────────┘  [main.o, ch32fun.o, rv003usb.o]
                                                     │
   [ch32fun.ld preprocesado con cc1 -E -P] ────────►│ riscv-ld.wasm  (+libc.a, +libgcc.a) ──► main.elf
                                                     │
        ┌────────────────────────────────────────────┤
        ▼                ▼                ▼          ▼
   riscv-objdump   riscv-size     riscv-objcopy   riscv-objcopy
   (desensamblado)  (Flash/SRAM)   → main.hex     → main.bin
```

Cada herramienta corre **en vivo**: no hay binarios precompilados ni objetos falsos. Todo `.o` se genera desde el código fuente del SDK y del usuario.

---

## 🔩 El pipeline de compilación (cómo se conecta con el compilador)

### 1. El toolchain (qué es "el compilador")

El toolchain **no vive en este repo**. Es el release pinado **`v0.1.0`** de [`riscv-wasm-toolchain`](https://github.com/NoNamedCat/riscv-wasm-toolchain) (ver `TOOLCHAIN_RELEASE` en `src/toolchain-loader.mjs`). `toolchain-loader.mjs`:

1. Lo trae de `raw.githubusercontent.com` (que envía `Access-Control-Allow-Origin: *`; los assets de release de GitHub no).
2. Lo descomprime y **parsea el `tar` (ustar) en un `Map<relPath, Uint8Array>`** en memoria.
3. En el navegador, **cachea los bytes comprimidos en IndexedDB** por tag de release: las compilaciones siguientes no vuelven a descargarlo.

El tar contiene: `cc1`/`riscv-as`/`riscv-ld`/`riscv-objdump`/`riscv-size`/`riscv-objcopy` (`.js`+`.wasm`), el `sysroot/` (newlib `libc.a` y `libgcc.a` por multilib) y `manifest.json`.

### 2. El worker (el conductor)

`compiler-worker.js` corre en un **Web Worker** (aisla la compilación del hilo de UI). `loadToolFactory()` ejecuta el JS de emscripten de cada herramienta y devuelve una factory; cada etapa instancia un módulo fresco (`noInitialRun`). Los mensajes entre worker y UI van por `postMessage` (logs, progress y resultado final).

### 3. El filesystem virtual (el puente real)

Antes de invocar cada herramienta, el worker "monta el mundo" en su MEMFS:

- **`populateFSHeaders`** escribe `headers.json` en `/include/...` **conservando el árbol real** del SDK → `/include/ch32fun/ch32fun.h`, `/include/extralibs/ch32v003_GPIO_branchless.h`, `/include/sys/stdio.h`, etc. Escribe `gcc-headers.json` en `/opt/riscv-wasm/lib/gcc/riscv32-unknown-elf/15.2.0/include` (el `--prefix` exacto con que se compiló `cc1`), para que encuentre sus propios `stddef.h`/`stdarg.h`.
- **`populateProjectFiles`** escribe los archivos del proyecto (`main.c`, `funconfig.h`, `ch32fun.ld`, `usb_config.h`) en la raíz de la MEMFS.
- Las librerías del sysroot (`libc.a`, `libgcc.a`) se escriben en `/sysroot/...` **solo** en la etapa de enlazado.

### 4. Las etapas

1. **`cc1`** compila **`ch32fun.c`** (SDK: vectores de interrupción, `SystemInit`, `printf` por UART) → `.s`
2. **`as`** lo ensambla → `ch32fun.o`
   *(si el proyecto usa USB: `rv003usb.c` con cc1+as, y `rv003usb.S` con `cc1 -E` preprocesando y luego `as`)*
3. **`cc1`** compila **`main.c`** (tu código) → `.s`
4. **`as`** lo ensambla → `main.o`
5. **`cc1 -E -P`** preprocesa **`ch32fun.ld`** (el script de enlazado usa `#if` sobre macros `TARGET_MCU*`) → `.ld` final; **`ld`** enlaza todos los objetos + `libc.a`/`libgcc.a` (el multilib elegido) → `main.elf`
6. **`objdump`** (desensamblado), **`size`** (Flash/SRAM), **`objcopy`** (`.hex` + `.bin`)

### 5. Las raíces de include

`CH32FUN_INCLUDE_DIRS` (`src/compiler-worker.js`) es la traducción a wasm de los `-I` de `ch32fun.mk` upstream (`-I$(CH32FUN) -I$(CH32FUN)/../extralibs -I.`):

```
-I.  -I/  -I/include/ch32fun  -I/include/extralibs  -I/include
```

El orden importa: primero la carpeta del proyecto (un `funconfig.h` del proyecto gana), luego las raíces de librería, y por último el bundle plano/newlib. Al conservar el árbol real, un include relativo como `#include "../ch32fun/ch32fun.h"` (desde `extralibs/`) resuelve a `/include/ch32fun/ch32fun.h` — igual que en disco.

### 6. Multilib = idéntico al gcc nativo

`matchMultilib` (`src/multilib.js`) replica el algoritmo del driver `riscv32-unknown-elf-gcc`: **ABI exacta**, **xlen exacto**, **ISA de la multilib ⊆ ISA pedido**, y entre las candidatas gana la de **más extensiones** (empate lexicográfico). **Si ninguna encaja, falla** (sin fallback silencioso). De ese multilib se toman `libc.a` y `libgcc.a` del sysroot.

---

## 📦 El paquete de board (public/ch32fun/)

Es lo que hace a FunStudio "de ch32fun". Nada de esto está en el toolchain genérico; se carga por separado:

| Archivo | Contenido |
|---|---|
| `headers.json` | **181 cabeceras con su árbol real**: `ch32fun/` (9), `extralibs/` (28), y newlib `sys/` (43), `machine/` (18), `ssp/` (7), `rpc/` (2) + top-level plano (`stdio.h`, `stdint.h`, `funconfig.h`, `rv003usb.h`, `cdc.h`, `tusb_types.h`, `tinyusb_hid.h`, …). |
| `gcc-headers.json` | Cabeceras internas de GCC (`stddef.h`, `stdarg.h`, …) que `cc1` necesita en su `--prefix`. |
| `sdk/ch32fun.c` | Fuente del SDK: vectores de interrupción, `SystemInit`, `printf` por UART. |
| `sdk/ch32fun.ld` | Script de enlazado con `#if` sobre `TARGET_MCU_LD`/`MCU_PACKAGE`/`MEMORY_SPLIT` (se preprocesa con cc1). |
| `sdk/rv003usb.c` + `rv003usb.S` | USB por software (TinyUSB-style), compilado solo si el proyecto lo usa. |

**Archivos del proyecto** (los que ves en el editor): `main.c` (tu código), `funconfig.h` (config del SDK — hay un *default* en el bundle que el proyecto puede sobreescribir), `ch32fun.ld` (script de enlazado) y `usb_config.h` (solo con rv003usb).

---

## 🎛️ Hardware (MCU) y config

`getHardwareMcuConfig` resuelve, por MCU, un conjunto de `-D` (`TARGET_MCU`, `TARGET_MCU_LD`, `MCU_PACKAGE`, `TARGET_MCU_MEMORY_SPLIT`, …). Esos defines son los que **preprocesan `ch32fun.ld`** y eligen el bloque de memoria (FLASH/RAM) del script. El worker reconoce un superset de MCUs (CH32V002/003/004/005/006/007, CH32V103/V203/V307, CH32L103, CH32X03x, CH57x/58x/59x, CH32H41x); el catálogo de la UI expone perfiles listos: **CH32V003, CH32V006, CH32X035, CH32V103, CH32V203, CH32V307, CH32L103, CH582**, cada uno con su `arch`/`abi` (p. ej. `rv32ec`/`ilp32e` para V003, `rv32imafc`/`ilp32f` para V307).

---

## 📚 Catálogo de ejemplos

`src/catalogue.js` define la base de datos de hardware y **73 ejemplos** en **11 categorías** (GPIO, ADC/DMA, Timers/PWM, I2C/Displays, UART, SPI/Radios, USB por software, USB/PD, Interrupts, System/Clocks/Power). Cada ejemplo es `{ id, title, category, description, mcus[], code, funconfig }` y se carga como proyecto editable (abre `main.c` + su `funconfig.h`). La carpeta `examples/` contiene además algunos `.c`/`.ld` standalone (`blink.c`, `gpio_interrupt.c`, `uart_hello.c`, `riscv32-baremetal.ld`).

---

## 🖥️ UI

- **i18n** (`src/i18n.js`): inglés, español, francés, alemán.
- **Temas** (`src/themes.js`): 15 (VS Code Dark+, One Dark Pro, Dracula, Tokyo Night, Synthwave '84, Nord, Catppuccin Mocha/Latte, Gruvbox, Monokai Pro, Solarized Dark/Warm, VS Code Light+, GitHub Light, Nord Snow).
- Editor multi-archivo con pestañas (`src/projects.js`); todos los archivos del proyecto se abren como tabs y `main.c` queda activo.
- Salida en vivo: logs por etapa, ensamblado, desensamblado, mapa, Flash/SRAM y descarga de `.elf`/`.hex`/`.bin`.

---

## 📁 Estructura del Proyecto

```
Fun_Studio/
├── server.js                 # Servidor HTTP con cabeceras COOP/COEP para WASM (puerto 3000)
├── index.html                # Interfaz web (IDE)
├── package.json              # Scripts npm (dev/build/preview/serve)
├── src/
│   ├── app.js                # Controlador del frontend, worker, pestañas, descargas
│   ├── compiler-worker.js    # Web Worker que encadena cc1 → as → ld → objdump/size/objcopy
│   ├── toolchain-loader.mjs  # Descarga el release del toolchain y lo cachea (IndexedDB)
│   ├── multilib.js           # Selección de multilib (algoritmo del driver gcc)
│   ├── catalogue.js          # Base de hardware + catálogo de ejemplos + funconfig/usb/ld
│   ├── projects.js           # Gestión de proyectos multi-archivo
│   ├── i18n.js               # Traducciones (en/es/fr/de)
│   ├── themes.js             # Temas de editor
│   └── vendor/fflate.mjs     # gunzip del toolchain (vendorizado)
├── examples/                 # .c/.ld standalone (blink, gpio_interrupt, uart_hello, baremetal.ld)
├── public/
│   └── ch32fun/              # Paquete de board: headers.json (árbol real), gcc-headers.json, sdk/
├── tests/                    # compile-harness.mjs (E2E), multilib.test.mjs, toolchain-loader.test.mjs
└── docs/                     # Diseño y planes del toolchain
```

---

## 🚀 Inicio rápido

```bash
npm install
npm run serve        # servidor Node con cabeceras COOP/COEP → http://localhost:3000
```

> `COOP`/`COEP` (`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`) son obligatorias para la memoria dinámica de WebAssembly y el cross-origin isolation.

1. Elige el MCU (p. ej. **CH32V003**).
2. Elige un ejemplo del catálogo.
3. Pulsa **Compilar** (`Ctrl+Enter`).
4. Revisa los logs por etapa, el ensamblado/desensamblado y descarga `.elf`/`.hex`/`.bin`.

---

## ✅ Tests

```bash
node tests/compile-harness.mjs   # E2E en Node: importa compiler-worker.js y usa el mismo sysroot/worker
node tests/multilib.test.mjs
node tests/toolchain-loader.test.mjs
```

El harness compila en Node los casos representativos (blink, GPIO branchless, USB CDC, …) validando que los `.o` se generen y el binario quede correcto — la misma vía que el navegador.

---

## 🛠️ Build Pipeline del toolchain (repo separado)

El toolchain **no se construye aquí**. El script `build-riscv-wasm.sh` en [`riscv-wasm-toolchain`](https://github.com/NoNamedCat/riscv-wasm-toolchain) automatiza: descarga GCC 15.2.0 + Binutils 2.44 + GMP/MPFR/MPC + Newlib, compila una toolchain cruzada nativa (para generar `libc.a`/`libm.a`/`libgcc.a`/`crt0.o` con su *multilib generator*), compila cada herramienta a WASM (`--host=wasm32` con emsdk), y publica un **release** (`riscv-wasm-toolchain.tar.gz`). Este repo solo lo **consume** en runtime.
