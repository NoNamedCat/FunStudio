# Kit de build del toolchain RISC-V → WASM (autocontenido)

Fecha: 2026-10-28

## Contexto

El proyecto `microcontroller-web-compiler` ya tiene construido un toolchain RISC-V
→ WASM (GCC 15.2.0 + Binutils 2.44 + newlib 4.5.0) con el script
`build-riscv-wasm.sh`. El build real vive en `build/` (7.1 GB, regenerable) y los
artefactos en `public/wasm-toolchain/`. El problema: `build/` no es autocontenido
y el script descarga los tarballs por la red. No hay una carpeta independiente con
"todo lo necesario para reconstruir el toolchain desde cero".

## Objetivo

Crear una carpeta independiente en el escritorio, **autocontenida**, con todo lo
necesario para reconstruir desde cero el toolchain RISC-V → WASM, con un `README.md`
que documenta **cómo compilarlo y cómo usar el resultado**, y una **prueba de
reproductibilidad**: un rebuild completo y limpio que demuestre que el kit funciona.

## Alcance

**Dentro:**
- Carpeta `~/Desktop/riscv-wasm-toolchain-kit/` con:
  - `tarballs/` — los 6 tarballs de fuente **vendeados** (sin red).
  - `build-riscv-wasm.sh` — el script de build (adaptado para usar los tarballs
    vendeados y no requerir red).
  - `README.md` — cómo compilar y cómo usar el resultado.
- Prueba: rebuild limpio completo en la carpeta (36 hilos), validando artefactos.

**Fuera (decisión del usuario):**
- El SDK de ch32fun **NO** es necesario para compilar el toolchain → no se incluye.
  (Solo lo usa el worker del IDE y el harness e2e para enlazar programas.)
- El web IDE (`src/`, `tests/`, `catalogue.js`) → no es parte del build del toolchain.
- El `build/` de 7.1 GB → no se copia (es build intermedio, se regenera).

## Arquitectura / contenido del kit

```
~/Desktop/riscv-wasm-toolchain-kit/
├── README.md                  # cómo compilar + cómo usar el resultado
├── build-riscv-wasm.sh        # script de build (adaptado, autocontenido)
└── tarballs/                  # fuente vendada (~142 MB)
    ├── gcc-15.2.0.tar.xz
    ├── binutils-2.44.tar.xz
    ├── gmp-6.3.0.tar.xz
    ├── mpfr-4.2.1.tar.xz
    ├── mpc-1.3.1.tar.gz
    └── newlib-4.5.0.20241231.tar.gz
```

Al compilar, el script crea dentro de la carpeta:
- `build/` (intermedio, regenerable) y
- `public/wasm-toolchain/` (dist): `cc1.{js,wasm}`, `cc1plus.{js,wasm}`,
  `riscv-as.{js,wasm}`, `riscv-ld.{js,wasm}`, `riscv-objcopy.{js,wasm}`,
  `riscv-objdump.{js,wasm}`, `riscv-size.{js,wasm}`, `sysroot/` (914 archivos) y
  `manifest.json`.

### Adaptaciones al script (para que sea autocontenido/offline)
1. **Vendear tarballs:** al iniciar, si existe `tarballs/` junto al script, copiarlos a
   `build/` (`cp -n`).
2. **No re-descargar:** en `download_and_extract`, si el tarball ya existe en
   `build/`, saltarse la descarga (`[ -f "$file" ] && return 0`).

Resultado: `./build-riscv-wasm.sh` usa los tarballs locales, sin red.

### Dependencias externas (documentadas en README)
- **Emscripten 6.0.13** (el script lo activa de `~/emsdk/emsdk_env.sh`). No se
  empaqueta en el kit; es una dependencia del host.
- GCC host, make, curl, `nproc` (host estándar).

## Cómo usar el resultado (documentado en README)
- El dist `public/wasm-toolchain/` lo consume el web IDE
  (`src/compiler-worker.js`), que en el navegador obtiene `cc1.wasm`,
  `riscv-as/ld/objcopy.wasm`, `sysroot/...` y `manifest.json` en tiempo de
  compilación/enlace.
- "Usar" = copiar el `public/wasm-toolchain/` generado a `public/wasm-toolchain/`
  del proyecto del IDE, y servir el IDE.

## Criterios de éxito (prueba de reproductibilidad)
1. Build limpio desde la carpeta (sin `build/` previo) **termina sin errores**.
2. Se generan los **7 binarios wasm** + `cc1plus` con tamaños sanos
   (cc1.wasm ~36 MB, cc1plus.wasm ~37 MB, as/ld/objcopy/objdump/size varios MB).
3. Se genera `sysroot/` con **914 archivos** y `manifest.json` con los 3 multilibs
   (`rv32ec`, `rv32imac_...`, `rv32imafc_zicsr_...`).
4. Todo sin acceso a red (tarballs vendados).

## Restricciones
- Emscripten 6.0.13 presente en el host (versión fijada por el script).
- Espacio en disco: ~7 GB de build intermedio + artefactos.
- Hardware: Xeon 36 hilos (build paralelo; no demora).

## Riesgos
- **Versión de Emscripten:** el script fija 6.0.13. Si el host la cambia, el
  emcc-glue puede diferir → documentado en README.
- **Tarball de newlib:** el script usa `newlib-4.5.0.20241231.tar.gz` (hay un 4.4.0
  viejo en `build/` que NO se vendea). El kit debe vendar exactamente el 4.5.0.
- **Red:** eliminada de la ecuación con tarballs vendados.

## Preguntas abiertas
- Ninguna mayor. Carpeta y alcance confirmados (enfoque A).

## Próximos pasos
- Plan de implementación (sección de writing-plans) con TDD donde aplique.
