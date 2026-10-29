# Toolchain Build Kit (autocontenido) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una carpeta independiente en el escritorio con todo para reconstruir desde cero el toolchain RISC-V → WASM (sin red) y un README que documenta cómo compilarlo y usarlo, validado con un rebuild limpio.

**Architecture:** Se vendea el código fuente (6 tarballs) junto al script de build. El script se adapta con un solo bloque que copia los tarballs vendados a `build/` antes de descargar (el guard `[ ! -f "$tarball" ]` ya existe y salta la descarga). El build limpio en la carpeta produce el dist `public/wasm-toolchain/` (7 wasm + sysroot + manifest).

**Tech Stack:** bash, Emscripten 6.0.13 (host), GCC 15.2.0 / Binutils 2.44 / newlib 4.5.0 (compilados a WASM), tarballs GNU vendados.

**Spec:** `docs/toolchain-build-kit/DESIGN.md`

## Global Constraints

- Kit autocontenido: **sin red** (tarballs vendados en `tarballs/`).
- **No** incluye el SDK de ch32fun, ni el IDE (`src/`), ni el `build/` de 7 GB.
- Dependencia externa única: **Emscripten 6.0.13** en `~/emsdk` (no se empaqueta; documentada).
- Carpeta destino: `~/Desktop/riscv-wasm-toolchain-kit/`.
- El kit vive **fuera del repo** → no hay commits git para el kit. Los docs (DESIGN.md, este plan) van en el repo pero **no se commitean salvo petición**.
- Tarball de newlib a vendar: **exactamente** `newlib-4.5.0.20241231.tar.gz` (no el 4.4.0 viejo).

## Review Focus

- **Red indisponible:** el build debe funcionar sin internet → prueba: log sin "Downloading", con "Extracting" (Task 3).
- **Versión de newlib equivocada:** vendar el 4.4.0 rompería el build → prueba: verificar el nombre exacto del tarball vendado (Task 1).
- **Dist incompleto:** faltarían ficheros del sysroot y el IDE no enlazaría → prueba: `sysroot/` = 914 archivos + `manifest.json` con 3 multilibs (Task 3).
- **Emscripten ausente/version:** el build falla → prueba: log muestra activación de emcc y el build termina (Task 3); version documentada en README (Task 2).
- **Rebuild no reproducible:** un segundo build limpio debe igualmente funcionar → prueba: el rebuild de Task 3 arranca de `build/` inexistente (Task 3).

---

### Task 1: Ensamblar el kit (carpeta + tarballs vendados + script adaptado)

**Files:**
- Create: `~/Desktop/riscv-wasm-toolchain-kit/tarballs/` (6 tarballs)
- Create: `~/Desktop/riscv-wasm-toolchain-kit/build-riscv-wasm.sh` (copia adaptada del del repo)
- Source (lectura): `microcontroller-web-compiler/build-riscv-wasm.sh`, `microcontroller-web-compiler/build/*.tar.*`

**Interfaces:**
- Consumes: el script del repo; los 6 tarballs en `build/`.
- Produces: la carpeta kit lista para Task 2 (README) y Task 3 (rebuild).

- [ ] **Step 1: Crear la estructura de la carpeta kit**

```bash
mkdir -p ~/Desktop/riscv-wasm-toolchain-kit/tarballs
```

- [ ] **Step 2: Vendar exactamente los 6 tarballs que usa el script**

```bash
cd /home/cattus/Desktop/microcontroller-web-compiler
cp build/gmp-6.3.0.tar.xz        ~/Desktop/riscv-wasm-toolchain-kit/tarballs/
cp build/mpfr-4.2.1.tar.xz       ~/Desktop/riscv-wasm-toolchain-kit/tarballs/
cp build/mpc-1.3.1.tar.gz        ~/Desktop/riscv-wasm-toolchain-kit/tarballs/
cp build/binutils-2.44.tar.xz    ~/Desktop/riscv-wasm-toolchain-kit/tarballs/
cp build/gcc-15.2.0.tar.xz       ~/Desktop/riscv-wasm-toolchain-kit/tarballs/
cp build/newlib-4.5.0.20241231.tar.gz ~/Desktop/riscv-wasm-toolchain-kit/tarballs/
```

- [ ] **Step 3: Verificar los 6 tarballs vendados (nombres y tamaños)**

Run: `ls -lh ~/Desktop/riscv-wasm-toolchain-kit/tarballs/`
Expected: los 6 ficheros, tamaños = 2.0M (gmp), 1.5M (mpfr), 756K (mpc), 27M (binutils), 97M (gcc), 8.7M (newlib). **Sin** el `newlib-4.4.0` (solo el 4.5.0.20241231).

- [ ] **Step 4: Copiar el script del build al kit**

```bash
cp /home/cattus/Desktop/microcontroller-web-compiler/build-riscv-wasm.sh \
   ~/Desktop/riscv-wasm-toolchain-kit/build-riscv-wasm.sh
```

- [ ] **Step 5: Añadir el bloque de tarballs vendidos al script del kit**

En `~/Desktop/riscv-wasm-toolchain-kit/build-riscv-wasm.sh`, insertar **después** de la línea `cd "$BUILD_DIR"` (línea 37) y **antes** del `# 2. Download and extract sources`:

```bash
# Vendored tarballs (offline reproducible build): use local tarballs/ if present
if [ -d "$SCRIPT_DIR/tarballs" ]; then
  echo "Using vendored tarballs from $SCRIPT_DIR/tarballs ..."
  cp -n "$SCRIPT_DIR/tarballs/"* "$BUILD_DIR"/ 2>/dev/null || true
fi
```

- [ ] **Step 6: Verificar el edit (el guard ya existe en el script original)**

Run: `grep -n 'Using vendored tarballs' ~/Desktop/riscv-wasm-toolchain-kit/build-riscv-wasm.sh` → 1 coincidencia.
Run: `grep -n 'if \[ ! -f "$tarball" \]' ~/Desktop/riscv-wasm-toolchain-kit/build-riscv-wasm.sh` → presente (el guard original que salta la descarga).

- [ ] **Step 7: Verificar el kit ensamblado**

Run: `ls -R ~/Desktop/riscv-wasm-toolchain-kit` (o `ls -lh`)
Expected: `tarballs/` con 6 ficheros + `build-riscv-wasm.sh`.

### Task 2: Escribir el README.md del kit

**Files:**
- Create: `~/Desktop/riscv-wasm-toolchain-kit/README.md`

**Interfaces:**
- Consumes: la carpeta kit de Task 1; el comportamiento del build (artefactos).
- Produces: documentación de "cómo compilar y cómo usar el resultado".

- [ ] **Step 1: Escribir el README con secciones obligatorias**

Secciones (en español):
1. **Qué es** — toolchain RISC-V → WASM (GCC 15.2.0, Binutils 2.44, newlib 4.5.0), autocontenido.
2. **Contenido** — `tarballs/` (6), `build-riscv-wasm.sh`, lo que genera (`build/`, `public/wasm-toolchain/`).
3. **Dependencias** — Emscripten **6.0.13** (activado de `~/emsdk/emsdk_env.sh`); make/gcc/curl del host; `nproc`.
4. **Cómo compilar** — `./build-riscv-wasm.sh` (usa `tarballs/`, sin red). Mencionar: crea `build/` (~7 GB) y el dist.
5. **Qué produce** — tabla de artefactos: `cc1.{js,wasm}`, `cc1plus.{js,wasm}`, `riscv-as/ld/objcopy/objdump/size.{js,wasm}`, `sysroot/` (914), `manifest.json`; multilibs `rv32ec` / `rv32imac_...` / `rv32imafc_zicsr_...`.
6. **Cómo usar el resultado** — copiar `public/wasm-toolchain/` a `public/wasm-toolchain/` del proyecto del IDE; el worker lo consume en el navegador.
7. **Solución de problemas** — emcc ausente (activar `~/emsdk`), versión de Emscripten, red no requerida.

- [ ] **Step 2: Verificar el README**

Run: `test -s ~/Desktop/riscv-wasm-toolchain-kit/README.md && echo OK`
Run: `grep -qE 'Emscripten.*6\.0\.13' ~/Desktop/riscv-wasm-toolchain-kit/README.md && echo version-ok`
Expected: `OK` y `version-ok`.

### Task 3: Prueba de reproductibilidad (rebuild limpio completo)

**Files:**
- Create (por el build): `~/Desktop/riscv-wasm-toolchain-kit/build/`, `~/Desktop/riscv-wasm-toolchain-kit/public/wasm-toolchain/`

**Interfaces:**
- Consumes: el kit de Task 1 (script + tarballs).
- Produces: evidencia de que el kit reconstruye el toolchain desde cero, sin red.

- [ ] **Step 1: Garantizar estado limpio (sin `build/` previo)**

```bash
rm -rf ~/Desktop/riscv-wasm-toolchain-kit/build ~/Desktop/riscv-wasm-toolchain-kit/public
```

Run: `ls ~/Desktop/riscv-wasm-toolchain-kit` → solo `tarballs/`, `build-riscv-wasm.sh`, `README.md`.

- [ ] **Step 2: Lanzo el build limpio (usa los tarballs vendados)**

Run: `cd ~/Desktop/riscv-wasm-toolchain-kit && ./build-riscv-wasm.sh 2>&1 | tee build.log`
Expected: termina con el resumen final (sin errores). Tarda según el build de cc1 (36 hilos).

- [ ] **Step 3: Verificar que se usaron los tarballs vendados (sin red)**

Run: `grep -c "Downloading" ~/Desktop/riscv-wasm-toolchain-kit/build.log`
Expected: `0` (ninguna descarga: tarballs vendados).
Run: `grep -c "Extracting" ~/Desktop/riscv-wasm-toolchain-kit/build.log`
Expected: ≥ 6 (extrajo los 6 tarballs locales).

- [ ] **Step 4: Verificar los artefactos generados**

Run: `ls -lh ~/Desktop/riscv-wasm-toolchain-kit/public/wasm-toolchain/*.wasm`
Expected: 7 wasm (`cc1` ~36M, `cc1plus` ~37M, `riscv-as` ~6.8M, `riscv-ld` ~8.2M, `riscv-objcopy` ~5.7M, `riscv-objdump` ~7.7M, `riscv-size` ~4.8M) + sus `.js`.
Run: `find ~/Desktop/riscv-wasm-toolchain-kit/public/wasm-toolchain/sysroot -type f | wc -l`
Expected: `914`.
Run: `grep -o '"[^"]*ilp32[^"]*"' ~/Desktop/riscv-wasm-toolchain-kit/public/wasm-toolchain/manifest.json | sort -u`
Expected: lista los 3 multilibs (rv32ec, rv32imac_…, rv32imafc_zicsr_…).

- [ ] **Step 5: Reportar resultado (reproductibilidad confirmada)**

Resumen: build limpio OK, sin red, artefactos + sysroot (914) + manifest correctos. Si falla, capturar la sección de error del `build.log` para diagnóstico.
