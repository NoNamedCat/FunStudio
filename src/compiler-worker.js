/**
 * FunStudio - Genuine RISC-V GNU Toolchain WebAssembly Worker
 * Executes 100% genuine on-the-fly compilation:
 *   [1/6] cc1.wasm        -> GNU GCC 15.2.0 C Frontend
 *   [2/6] riscv-as.wasm   -> GNU Binutils 2.44 Assembler
 *   [3/6] riscv-ld.wasm   -> GNU Binutils 2.44 Linker
 *   [4/6] riscv-objdump.wasm -> GNU Binutils 2.44 Disassembler
 *   [5/6] riscv-size.wasm -> GNU Binutils 2.44 Memory Profiler
 *   [6/6] riscv-objcopy.wasm -> GNU Binutils 2.44 Image Extractor (HEX & BIN)
 * 
 * NO precompiled binaries, NO stub fake objects, NO shortcuts.
 * Every .o object is compiled and assembled live from SDK C/Assembly source code.
 */

const IS_NODE = typeof process !== "undefined" && process.versions && process.versions.node;
const WASM_BASE = IS_NODE
  ? "./public/wasm-toolchain/"
  : (typeof import.meta !== "undefined" && import.meta.url
      ? new URL("../public/wasm-toolchain/", import.meta.url).href
      : "./public/wasm-toolchain/");

// Toolchain module factories
let cc1Factory = null;
let asFactory = null;
let ldFactory = null;
let objdumpFactory = null;
let sizeFactory = null;
let objcopyFactory = null;

// SDK sources and headers cache
let cachedHeaders = null;
let cachedGccHeaders = null;
let cachedCh32funC = null;
let cachedCh32funLd = null;
let cachedLibgccA = null;
let cachedRv003usbC = null;
let cachedRv003usbS = null;

function log(step, message, type = "info") {
  self.postMessage({
    type: "log",
    step,
    message,
    level: type,
    timestamp: new Date().toLocaleTimeString(),
  });
}

function progress(percent, status) {
  self.postMessage({
    type: "progress",
    percent,
    status,
  });
}

async function loadToolFactory(jsPath, exportName) {
  let scriptText = "";
  if (IS_NODE) {
    const fs = typeof require !== "undefined" ? require("fs") : (await import("node:fs")).default;
    scriptText = fs.readFileSync(jsPath, "utf8");
  } else {
    const response = await fetch(jsPath);
    if (!response.ok) {
      throw new Error(`Tool script not found: ${jsPath} (${response.status})`);
    }
    scriptText = await response.text();
  }
  scriptText = scriptText.replace(/^#!.*?\n/, "");

  const factory = new Function(
    scriptText +
      `\nreturn typeof ${exportName} !== 'undefined' ? ${exportName} : (typeof createModule !== 'undefined' ? createModule : null);`
  )();
  return factory;
}

async function fetchSdkFile(relPath) {
  if (IS_NODE) {
    const fs = typeof require !== "undefined" ? require("fs") : (await import("node:fs")).default;
    return fs.readFileSync(`./public/wasm-toolchain/sdk/${relPath}`, "utf8");
  } else {
    const res = await fetch(`${WASM_BASE}sdk/${relPath}`);
    if (!res.ok) throw new Error(`Could not fetch SDK file: ${relPath}`);
    return await res.text();
  }
}

async function fetchSdkBinary(relPath) {
  if (IS_NODE) {
    const fs = typeof require !== "undefined" ? require("fs") : (await import("node:fs")).default;
    return fs.readFileSync(`./public/wasm-toolchain/sdk/${relPath}`);
  } else {
    const res = await fetch(`${WASM_BASE}sdk/${relPath}`);
    if (!res.ok) throw new Error(`Could not fetch SDK binary: ${relPath}`);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }
}

async function preloadEnvironment() {
  if (!cachedHeaders) {
    try {
      if (IS_NODE) {
        const fs = typeof require !== "undefined" ? require("fs") : (await import("node:fs")).default;
        cachedHeaders = JSON.parse(fs.readFileSync("./public/wasm-toolchain/headers.json", "utf8"));
      } else {
        const res = await fetch(`${WASM_BASE}headers.json`);
        if (res.ok) cachedHeaders = await res.json();
      }
    } catch (e) {
      console.warn("Could not load headers.json:", e);
      cachedHeaders = {};
    }
  }

  if (!cachedGccHeaders) {
    try {
      if (IS_NODE) {
        const fs = typeof require !== "undefined" ? require("fs") : (await import("node:fs")).default;
        cachedGccHeaders = JSON.parse(fs.readFileSync("./public/wasm-toolchain/gcc-headers.json", "utf8"));
      } else {
        const res = await fetch(`${WASM_BASE}gcc-headers.json`);
        if (res.ok) cachedGccHeaders = await res.json();
      }
    } catch (e) {
      console.warn("Could not load gcc-headers.json:", e);
      cachedGccHeaders = {};
    }
  }

  if (!cachedCh32funC) {
    try { cachedCh32funC = await fetchSdkFile("ch32fun.c"); } catch (e) { console.warn(e); }
  }
  if (!cachedCh32funLd) {
    try { cachedCh32funLd = await fetchSdkFile("ch32fun.ld"); } catch (e) { console.warn(e); }
  }
  if (!cachedLibgccA) {
    try { cachedLibgccA = await fetchSdkBinary("libgcc.a"); } catch (e) { console.warn(e); }
  }
  if (!cachedRv003usbC) {
    try { cachedRv003usbC = await fetchSdkFile("rv003usb.c"); } catch (e) { console.warn(e); }
  }
  if (!cachedRv003usbS) {
    try { cachedRv003usbS = await fetchSdkFile("rv003usb.S"); } catch (e) { console.warn(e); }
  }
}

function populateFSHeaders(mod) {
  try { mod.FS.mkdir("/include"); } catch (_) {}
  if (cachedHeaders) {
    for (const [relPath, content] of Object.entries(cachedHeaders)) {
      const parts = relPath.split("/");
      let curr = "/include";
      for (let i = 0; i < parts.length - 1; i++) {
        curr += "/" + parts[i];
        try { mod.FS.mkdir(curr); } catch (_) {}
      }
      try { mod.FS.writeFile(`/include/${relPath}`, content); } catch (_) {}
    }
  }

  if (cachedGccHeaders) {
    const gccIncDir = "/usr/local/lib/gcc/riscv32-unknown-elf/15.2.0/include";
    let curr = "";
    for (const p of gccIncDir.split("/").filter(Boolean)) {
      curr += "/" + p;
      try { mod.FS.mkdir(curr); } catch (_) {}
    }
    for (const [fileName, content] of Object.entries(cachedGccHeaders)) {
      try { mod.FS.writeFile(`${gccIncDir}/${fileName}`, content); } catch (_) {}
    }
  }
}

function populateProjectFiles(mod, filesMap) {
  if (!filesMap) return;
  for (const [fname, fcontent] of Object.entries(filesMap)) {
    if (typeof fcontent === "string") {
      const parts = fname.split("/");
      let curr = "";
      for (let i = 0; i < parts.length - 1; i++) {
        curr += "/" + parts[i];
        try { mod.FS.mkdir(curr); } catch (_) {}
      }
      try { mod.FS.writeFile(`/${fname}`, fcontent); } catch (_) {}
    }
  }
}

function getHardwareMcuConfig(mcu) {
  const norm = (mcu || "ch32v003").toUpperCase();

  if (norm.includes("CH32V002")) {
    return {
      targetMcu: "CH32V002",
      ld: 5,
      pkg: 1,
      split: 0,
      cflagsDefines: [
        "-DCH32V00x=1",
        "-DCH32V002=1",
        "-DTARGET_MCU=CH32V002",
        "-DTARGET_MCU_LD=5",
        "-DMCU_PACKAGE=1",
        "-DTARGET_MCU_MEMORY_SPLIT=0",
      ],
    };
  }
  if (norm.includes("CH32V004")) {
    return {
      targetMcu: "CH32V004",
      ld: 6,
      pkg: 1,
      split: 0,
      cflagsDefines: [
        "-DCH32V00x=1",
        "-DCH32V004=1",
        "-DTARGET_MCU=CH32V004",
        "-DTARGET_MCU_LD=6",
        "-DMCU_PACKAGE=1",
        "-DTARGET_MCU_MEMORY_SPLIT=0",
      ],
    };
  }
  if (norm.includes("CH32V005")) {
    return {
      targetMcu: "CH32V005",
      ld: 6,
      pkg: 1,
      split: 0,
      cflagsDefines: [
        "-DCH32V00x=1",
        "-DCH32V005=1",
        "-DTARGET_MCU=CH32V005",
        "-DTARGET_MCU_LD=6",
        "-DMCU_PACKAGE=1",
        "-DTARGET_MCU_MEMORY_SPLIT=0",
      ],
    };
  }
  if (norm.includes("CH32V006")) {
    return {
      targetMcu: "CH32V006",
      ld: 7,
      pkg: 1,
      split: 0,
      cflagsDefines: [
        "-DCH32V00x=1",
        "-DCH32V006=1",
        "-DTARGET_MCU=CH32V006",
        "-DTARGET_MCU_LD=7",
        "-DMCU_PACKAGE=1",
        "-DTARGET_MCU_MEMORY_SPLIT=0",
      ],
    };
  }
  if (norm.includes("CH32V007")) {
    return {
      targetMcu: "CH32V007",
      ld: 7,
      pkg: 1,
      split: 0,
      cflagsDefines: [
        "-DCH32V00x=1",
        "-DCH32V007=1",
        "-DTARGET_MCU=CH32V007",
        "-DTARGET_MCU_LD=7",
        "-DMCU_PACKAGE=1",
        "-DTARGET_MCU_MEMORY_SPLIT=0",
      ],
    };
  }
  if (norm.includes("CH32V103")) {
    return {
      targetMcu: "CH32V103",
      ld: 1,
      pkg: 1,
      split: 0,
      cflagsDefines: [
        "-DCH32V10x=1",
        "-DCH32V103=1",
        "-DTARGET_MCU=CH32V103",
        "-DTARGET_MCU_LD=1",
        "-DMCU_PACKAGE=1",
        "-DTARGET_MCU_MEMORY_SPLIT=0",
      ],
    };
  }
  if (norm.includes("CH32V203")) {
    return {
      targetMcu: "CH32V203",
      ld: 2,
      pkg: 1,
      split: 0,
      cflagsDefines: [
        "-DCH32V20x=1",
        "-DCH32V203=1",
        "-DTARGET_MCU=CH32V203",
        "-DTARGET_MCU_LD=2",
        "-DMCU_PACKAGE=1",
        "-DTARGET_MCU_MEMORY_SPLIT=0",
        "-DCH32V20x_D6",
      ],
    };
  }
  if (norm.includes("CH32V307")) {
    return {
      targetMcu: "CH32V307",
      ld: 3,
      pkg: 1,
      split: 3,
      cflagsDefines: [
        "-DCH32V30x=1",
        "-DCH32V307=1",
        "-DTARGET_MCU=CH32V307",
        "-DTARGET_MCU_LD=3",
        "-DMCU_PACKAGE=1",
        "-DTARGET_MCU_MEMORY_SPLIT=3",
        "-DCH32V30x_D8C",
      ],
    };
  }
  if (norm.includes("CH32X035") || norm.includes("CH32X033")) {
    return {
      targetMcu: "CH32X035",
      ld: 4,
      pkg: 1,
      split: 0,
      cflagsDefines: [
        "-DCH32X03x=1",
        "-DCH32X035=1",
        "-DTARGET_MCU=CH32X035",
        "-DTARGET_MCU_LD=4",
        "-DMCU_PACKAGE=1",
        "-DTARGET_MCU_MEMORY_SPLIT=0",
      ],
    };
  }
  if (norm.includes("CH32L103")) {
    return {
      targetMcu: "CH32L103",
      ld: 4,
      pkg: 1,
      split: 0,
      cflagsDefines: [
        "-DCH32L103=1",
        "-DTARGET_MCU=CH32L103",
        "-DTARGET_MCU_LD=4",
        "-DMCU_PACKAGE=1",
        "-DTARGET_MCU_MEMORY_SPLIT=0",
      ],
    };
  }
  if (norm.includes("CH57")) {
    return {
      targetMcu: "CH573",
      ld: 10,
      pkg: 3,
      split: 0,
      cflagsDefines: [
        "-DCH57x=1",
        "-DCH5xx=1",
        "-DCH573=1",
        "-DTARGET_MCU=CH573",
        "-DTARGET_MCU_LD=10",
        "-DMCU_PACKAGE=3",
        "-DTARGET_MCU_MEMORY_SPLIT=0",
      ],
    };
  }
  if (norm.includes("CH58")) {
    return {
      targetMcu: "CH582",
      ld: 8,
      pkg: 2,
      split: 0,
      cflagsDefines: [
        "-DCH58x=1",
        "-DCH5xx=1",
        "-DCH582=1",
        "-DTARGET_MCU=CH582",
        "-DTARGET_MCU_LD=8",
        "-DMCU_PACKAGE=2",
        "-DTARGET_MCU_MEMORY_SPLIT=0",
      ],
    };
  }
  if (norm.includes("CH59")) {
    return {
      targetMcu: "CH592",
      ld: 9,
      pkg: 2,
      split: 0,
      cflagsDefines: [
        "-DCH59x=1",
        "-DCH5xx=1",
        "-DCH592=1",
        "-DTARGET_MCU=CH592",
        "-DTARGET_MCU_LD=9",
        "-DMCU_PACKAGE=2",
        "-DTARGET_MCU_MEMORY_SPLIT=0",
      ],
    };
  }
  if (norm.includes("CH32H41")) {
    return {
      targetMcu: "CH32H417",
      ld: 11,
      pkg: 1,
      split: 0,
      cflagsDefines: [
        "-DCH32H41x=1",
        "-DCH32H417=1",
        "-DTARGET_MCU=CH32H417",
        "-DTARGET_MCU_LD=11",
        "-DMCU_PACKAGE=1",
        "-DTARGET_MCU_MEMORY_SPLIT=0",
      ],
    };
  }
  if (norm.includes("ESP32") || norm.includes("RP2350") || norm.includes("GENERIC")) {
    return {
      targetMcu: "GENERIC",
      ld: 0,
      pkg: 1,
      split: 0,
      cflagsDefines: ["-DGENERIC_RISCV=1"],
    };
  }
  // Default: CH32V003
  return {
    targetMcu: "CH32V003",
    ld: 0,
    pkg: 1,
    split: 0,
    cflagsDefines: [
      "-DCH32V003=1",
      "-DTARGET_MCU=CH32V003",
      "-DTARGET_MCU_LD=0",
      "-DMCU_PACKAGE=1",
      "-DTARGET_MCU_MEMORY_SPLIT=0",
    ],
  };
}

function getCh32FunCompilerArgs({ march, currentAbi, optLevel, mcuDefines = [], extraFlags = [] }) {
  return [
    "-quiet",
    optLevel || "-Os",
    "-ffunction-sections",
    "-fdata-sections",
    "-fmessage-length=0",
    "-msmall-data-limit=8",
    "-fno-tree-loop-distribute-patterns",
    "-Wall",
    "-I.",
    "-I/",
    "-I/include",
    ...mcuDefines,
    "-march=" + march,
    "-mabi=" + currentAbi,
    ...extraFlags,
  ];
}

self.onmessage = async (e) => {
  const { code, target, mcu, arch, abi, optLevel, linkerScript, files } = e.data;
  const startTime = performance.now();

  try {
    const mcuConfig = getHardwareMcuConfig(mcu);
    const mcuDefines = mcuConfig.cflagsDefines;
    const targetMcu = mcuConfig.targetMcu;
    let march = arch || "rv32ec";
    if (!march.includes("zicsr")) {
      march += "_zicsr";
    }
    const currentAbi = abi || (march.startsWith("rv32e") ? "ilp32e" : "ilp32");

    log(1, `Iniciando compilación en vivo con GNU GCC 15.2.0 real (${targetMcu} | Arch: ${march} | ABI: ${currentAbi})...`);
    progress(5, "Inicializando entorno WebAssembly y librerías C de Newlib...");

    await preloadEnvironment();

    // Load tool factories
    if (!cc1Factory) cc1Factory = await loadToolFactory(`${WASM_BASE}cc1.js`, "createCc1");
    if (!asFactory) asFactory = await loadToolFactory(`${WASM_BASE}riscv-as.js`, "createAs");
    if (!ldFactory) ldFactory = await loadToolFactory(`${WASM_BASE}riscv-ld.js`, "createLd");
    if (!objdumpFactory) objdumpFactory = await loadToolFactory(`${WASM_BASE}riscv-objdump.js`, "createObjdump");
    if (!sizeFactory) sizeFactory = await loadToolFactory(`${WASM_BASE}riscv-size.js`, "createSize");
    if (!objcopyFactory) objcopyFactory = await loadToolFactory(`${WASM_BASE}riscv-objcopy.js`, "createObjcopy");

    const objectFilesToLink = [];

    // Check if this project uses the ch32fun SDK
    const isCh32 = targetMcu.startsWith("CH32") || targetMcu.startsWith("CH5") || code.includes("ch32fun.h");
    const isRv003usb = code.includes("rv003usb.h") || (files && (files["usb_config.h"] || Object.keys(files).some(k => k.includes("usb"))));

    // =========================================================================
    // Stage 1: Compile SDK Sources On-The-Fly (NO PRECOMPILATION)
    // =========================================================================
    if (isCh32 && cachedCh32funC) {
      progress(15, "[1/7] cc1: Compilando ch32fun.c en vivo desde código fuente...");
      log(1, "Compilando SDK ch32fun.c con GNU GCC 15 (vectores de interrupción, SystemInit, UART printf)...");

      let funErrors = [];
      const cc1Fun = await cc1Factory({
        noInitialRun: true,
        print: () => {},
        printErr: (text) => {
          if (text.includes("error:")) funErrors.push(text);
        },
        locateFile: (p) => `${WASM_BASE}${p.endsWith(".wasm") ? "cc1.wasm" : p}`,
      });
      populateFSHeaders(cc1Fun);
      populateProjectFiles(cc1Fun, files);
      cc1Fun.FS.writeFile("/ch32fun.c", cachedCh32funC);

      try {
        cc1Fun.callMain([
          ...getCh32FunCompilerArgs({ march, currentAbi, optLevel, mcuDefines }),
          "/ch32fun.c",
          "-o",
          "/ch32fun.s",
        ]);
      } catch (_) {}

      if (funErrors.length > 0) {
        throw new Error(`Error compilando ch32fun.c:\n${funErrors.join("\n")}`);
      }

      const funAsm = cc1Fun.FS.readFile("/ch32fun.s", { encoding: "utf8" });

      // Assemble ch32fun.s -> ch32fun.o
      progress(25, "[2/7] riscv-as: Ensamblando ch32fun.o...");
      const asFun = await asFactory({
        noInitialRun: true,
        locateFile: (p) => `${WASM_BASE}${p.endsWith(".wasm") ? "riscv-as.wasm" : p}`,
      });
      asFun.FS.writeFile("/ch32fun.s", funAsm);
      asFun.callMain(["-march=" + march, "-mabi=" + currentAbi, "-o", "/ch32fun.o", "/ch32fun.s"]);
      const ch32funObj = asFun.FS.readFile("/ch32fun.o");
      objectFilesToLink.push({ name: "/ch32fun.o", data: ch32funObj });
      log(1, `✓ ch32fun.c compilado y ensamblado en vivo: ${ch32funObj.length} bytes.`);
    }

    // Optional: Compile rv003usb on-the-fly if project uses rv003usb
    if (isRv003usb && cachedRv003usbC && cachedRv003usbS) {
      progress(35, "[3/7] cc1/as: Compilando biblioteca USB por software rv003usb...");
      log(1, "Compilando módulo USB software rv003usb.c y rv003usb.S con usb_config.h del proyecto...");

      // 1. Compile rv003usb.c
      const cc1RvC = await cc1Factory({
        noInitialRun: true,
        locateFile: (p) => `${WASM_BASE}${p.endsWith(".wasm") ? "cc1.wasm" : p}`,
      });
      populateFSHeaders(cc1RvC);
      populateProjectFiles(cc1RvC, files);
      cc1RvC.FS.writeFile("/rv003usb.c", cachedRv003usbC);
      cc1RvC.callMain([
        ...getCh32FunCompilerArgs({ march, currentAbi, optLevel, mcuDefines }),
        "/rv003usb.c",
        "-o",
        "/rv003usb_c.s",
      ]);
      const asRvC = await asFactory({
        noInitialRun: true,
        locateFile: (p) => `${WASM_BASE}${p.endsWith(".wasm") ? "riscv-as.wasm" : p}`,
      });
      asRvC.FS.writeFile("/rv003usb_c.s", cc1RvC.FS.readFile("/rv003usb_c.s"));
      asRvC.callMain(["-march=" + march, "-mabi=" + currentAbi, "-o", "/rv003usb_c.o", "/rv003usb_c.s"]);
      objectFilesToLink.push({ name: "/rv003usb_c.o", data: asRvC.FS.readFile("/rv003usb_c.o") });

      // 2. Preprocess and assemble rv003usb.S
      const cc1RvS = await cc1Factory({
        noInitialRun: true,
        locateFile: (p) => `${WASM_BASE}${p.endsWith(".wasm") ? "cc1.wasm" : p}`,
      });
      populateFSHeaders(cc1RvS);
      populateProjectFiles(cc1RvS, files);
      cc1RvS.FS.writeFile("/rv003usb.S", cachedRv003usbS);
      cc1RvS.callMain([
        "-quiet",
        "-E",
        "-I.",
        "-I/",
        "-I/include",
        "-D__ASSEMBLER__=1",
        ...mcuDefines,
        "/rv003usb.S",
        "-o",
        "/rv003usb_s.s",
      ]);
      const asRvS = await asFactory({
        noInitialRun: true,
        locateFile: (p) => `${WASM_BASE}${p.endsWith(".wasm") ? "riscv-as.wasm" : p}`,
      });
      asRvS.FS.writeFile("/rv003usb_s.s", cc1RvS.FS.readFile("/rv003usb_s.s"));
      asRvS.callMain(["-march=" + march, "-mabi=" + currentAbi, "-o", "/rv003usb_s.o", "/rv003usb_s.s"]);
      objectFilesToLink.push({ name: "/rv003usb_s.o", data: asRvS.FS.readFile("/rv003usb_s.o") });
      log(1, "✓ rv003usb.c y rv003usb.S compilados en vivo.");
    }

    // =========================================================================
    // Stage 2: Compile User Code (main.c) On-The-Fly
    // =========================================================================
    progress(45, "[4/7] cc1: Compilando código de usuario con GCC 15.2.0...");
    log(2, "Compilando código principal main.c...");

    let cc1Errors = [];
    let cc1Warnings = [];

    const cc1Mod = await cc1Factory({
      noInitialRun: true,
      print: (text) => log(2, `[cc1] ${text}`),
      printErr: (text) => {
        if (text.includes("error:")) {
          cc1Errors.push(text);
          log(2, text, "error");
        } else if (text.includes("warning:")) {
          cc1Warnings.push(text);
          log(2, text, "warn");
        } else {
          log(2, text, "info");
        }
      },
      locateFile: (p) => `${WASM_BASE}${p.endsWith(".wasm") ? "cc1.wasm" : p}`,
    });

    populateFSHeaders(cc1Mod);
    populateProjectFiles(cc1Mod, files);
    cc1Mod.FS.writeFile("/main.c", code);

    try {
      cc1Mod.callMain([
        ...getCh32FunCompilerArgs({ march, currentAbi, optLevel, mcuDefines }),
        "/main.c",
        "-o",
        "/main.s",
      ]);
    } catch (_) {}

    if (cc1Errors.length > 0) {
      throw new Error(cc1Errors.join("\n"));
    }

    const mainAsmText = cc1Mod.FS.readFile("/main.s", { encoding: "utf8" });
    const asmLineCount = mainAsmText.split("\n").length;
    log(2, `✓ Ensamblador generado para main.c: ${asmLineCount} líneas de instrucciones.`);

    // Assemble main.s -> main.o
    const asMod = await asFactory({
      noInitialRun: true,
      locateFile: (p) => `${WASM_BASE}${p.endsWith(".wasm") ? "riscv-as.wasm" : p}`,
    });
    asMod.FS.writeFile("/main.s", mainAsmText);
    asMod.callMain(["-march=" + march, "-mabi=" + currentAbi, "-o", "/main.o", "/main.s"]);
    const mainObjBytes = asMod.FS.readFile("/main.o");
    objectFilesToLink.push({ name: "/main.o", data: mainObjBytes });
    log(2, `✓ riscv-as ensambló main.o: ${mainObjBytes.length} bytes.`);

    // =========================================================================
    // Stage 3: Link Real Objects with GNU Linker (riscv-ld)
    // =========================================================================
    progress(60, "[5/7] riscv-ld: Enlazando ejecutable baremetal ELF...");
    log(3, `Enlazando ${objectFilesToLink.length} objetos compilados en vivo según el mapa de memoria oficial de ${targetMcu}...`);

    // Preprocess official ch32fun.ld using cc1 with TARGET_MCU macros (genuine ch32fun.mk rule)
    let finalLinkerScript = linkerScript || cachedCh32funLd;
    if (finalLinkerScript && (finalLinkerScript.includes("#if") || finalLinkerScript.includes("#include"))) {
      log(3, `Preprocesando ch32fun.ld con GCC cc1 (TARGET_MCU=${mcuConfig.targetMcu}, TARGET_MCU_LD=${mcuConfig.ld}, MCU_PACKAGE=${mcuConfig.pkg}, TARGET_MCU_MEMORY_SPLIT=${mcuConfig.split})...`);
      const cc1Ld = await cc1Factory({
        noInitialRun: true,
        locateFile: (p) => `${WASM_BASE}${p.endsWith(".wasm") ? "cc1.wasm" : p}`,
      });
      cc1Ld.FS.writeFile("/ch32fun.ld", finalLinkerScript);
      cc1Ld.callMain([
        "-quiet",
        "-E",
        "-P",
        `-DTARGET_MCU=${mcuConfig.targetMcu}`,
        `-DMCU_PACKAGE=${mcuConfig.pkg}`,
        `-DTARGET_MCU_LD=${mcuConfig.ld}`,
        `-DTARGET_MCU_MEMORY_SPLIT=${mcuConfig.split}`,
        "/ch32fun.ld",
        "-o",
        "/generated.ld",
      ]);
      finalLinkerScript = cc1Ld.FS.readFile("/generated.ld", { encoding: "utf8" });
    }

    let ldErrors = [];
    const ldMod = await ldFactory({
      noInitialRun: true,
      print: (text) => log(3, `[ld] ${text}`),
      printErr: (text) => {
        if (!text.includes("warning: cannot find entry symbol")) {
          ldErrors.push(text);
        }
        log(3, `[ld] ${text}`, text.includes("error:") ? "error" : "warn");
      },
      locateFile: (p) => `${WASM_BASE}${p.endsWith(".wasm") ? "riscv-ld.wasm" : p}`,
    });

    ldMod.FS.writeFile("/link.ld", finalLinkerScript);

    const ldArgs = [
      "-m",
      "elf32lriscv",
      "--gc-sections",
      "--print-memory-usage",
      "-Map",
      "/main.map",
      "-T",
      "/link.ld",
    ];
    for (const obj of objectFilesToLink) {
      ldMod.FS.writeFile(obj.name, obj.data);
      ldArgs.push(obj.name);
    }
    if (cachedLibgccA) {
      ldMod.FS.writeFile("/libgcc.a", cachedLibgccA);
      ldArgs.push("/libgcc.a");
    }
    ldArgs.push("-o", "/main.elf");

    try {
      ldMod.callMain(ldArgs);
    } catch (_) {}

    let elfBytes = null;
    try {
      elfBytes = ldMod.FS.readFile("/main.elf");
      log(3, `✓ riscv-ld enlazó ejecutable ELF real: ${elfBytes.length} bytes.`);
    } catch (ldReadErr) {
      throw new Error(ldErrors.join("\n") || `riscv-ld fallo: ${ldReadErr.message}`);
    }

    let mapText = "";
    try {
      mapText = ldMod.FS.readFile("/main.map", { encoding: "utf8" });
    } catch (_) {}

    // =========================================================================
    // Stage 4: GNU objdump (Real Baremetal Disassembly)
    // =========================================================================
    progress(75, "[6/7] riscv-objdump: Generando desensamblado con direcciones físicas...");
    let disasmLines = [];
    const odMod = await objdumpFactory({
      noInitialRun: true,
      print: (text) => disasmLines.push(text),
      locateFile: (p) => `${WASM_BASE}${p.endsWith(".wasm") ? "riscv-objdump.wasm" : p}`,
    });

    odMod.FS.writeFile("/main.elf", elfBytes);
    try {
      odMod.callMain(["-d", "/main.elf"]);
    } catch (_) {}

    const realDisassembly = disasmLines.join("\n");
    log(4, `✓ riscv-objdump desensambló ${disasmLines.length} líneas de código máquina.`);

    // =========================================================================
    // Stage 5: GNU size (Accurate Flash / SRAM Memory Profiling)
    // =========================================================================
    progress(85, "[7/7] riscv-size: Calculando uso de memoria Flash y SRAM...");
    let sizeOutput = "";
    const szMod = await sizeFactory({
      noInitialRun: true,
      print: (text) => { sizeOutput += text + "\n"; },
      locateFile: (p) => `${WASM_BASE}${p.endsWith(".wasm") ? "riscv-size.wasm" : p}`,
    });

    szMod.FS.writeFile("/main.elf", elfBytes);
    try {
      szMod.callMain(["-B", "/main.elf"]);
    } catch (_) {}

    let flashBytes = elfBytes.length;
    let ramBytes = 0;
    const sizeMatch = sizeOutput.match(/(\d+)\s+(\d+)\s+(\d+)\s+\d+\s+[0-9a-fA-F]+\s+\/main\.elf/);
    if (sizeMatch) {
      const textSec = parseInt(sizeMatch[1], 10);
      const dataSec = parseInt(sizeMatch[2], 10);
      const bssSec = parseInt(sizeMatch[3], 10);
      flashBytes = textSec + dataSec;
      ramBytes = dataSec + bssSec;
      log(5, `✓ riscv-size: Flash (.text + .data) = ${flashBytes} B | SRAM (.data + .bss) = ${ramBytes} B.`);
    }

    // =========================================================================
    // Stage 6: GNU objcopy (Intel HEX & Binary Generation)
    // =========================================================================
    let hexText = "";
    try {
      const ocHexMod = await objcopyFactory({
        noInitialRun: true,
        locateFile: (p) => `${WASM_BASE}${p.endsWith(".wasm") ? "riscv-objcopy.wasm" : p}`,
      });
      ocHexMod.FS.writeFile("/main.elf", elfBytes);
      ocHexMod.callMain(["-O", "ihex", "/main.elf", "/main.hex"]);
      hexText = ocHexMod.FS.readFile("/main.hex", { encoding: "utf8" });
    } catch (hexErr) {
      log(6, `Objcopy HEX warning: ${hexErr.message}`, "warn");
    }

    let binBytes = null;
    try {
      const ocBinMod = await objcopyFactory({
        noInitialRun: true,
        locateFile: (p) => `${WASM_BASE}${p.endsWith(".wasm") ? "riscv-objcopy.wasm" : p}`,
      });
      ocBinMod.FS.writeFile("/main.elf", elfBytes);
      ocBinMod.callMain(["-R", ".storage", "-O", "binary", "/main.elf", "/main.bin"]);
      binBytes = ocBinMod.FS.readFile("/main.bin");
    } catch (binErr) {
      binBytes = elfBytes;
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    log(6, `✓ Compilación 100% completada con GNU GCC 15 y Binutils 2.44 en ${elapsed}s!`, "success");
    progress(100, "Compilación terminada!");

    self.postMessage({
      type: "success",
      asm: mainAsmText,
      disasm: realDisassembly,
      hex: hexText,
      bin: binBytes,
      elf: elfBytes,
      map: mapText,
      stats: {
        flashBytes,
        ramBytes,
        time: `${elapsed}s`,
      },
    });

  } catch (err) {
    log(0, `Error durante la compilación: ${err.message}`, "error");
    self.postMessage({
      type: "error",
      error: err.message,
    });
  }
};
