// Fetches the pinned riscv-wasm-toolchain GitHub release at runtime and
// exposes its files (compiler .js/.wasm, sysroot/, manifest.json) as an
// in-memory Map<relPath, Uint8Array>. The browser caches the compressed
// bytes in IndexedDB keyed by release tag; Node uses memory only.
import { gunzipSync, strFromU8 } from "./vendor/fflate.mjs";

export const TOOLCHAIN_RELEASE = "v0.1.0";
// raw.githubusercontent.com sends Access-Control-Allow-Origin: *, so the
// browser can fetch it cross-origin (GitHub release assets do not).
const RELEASE_URL =
  "https://raw.githubusercontent.com/NoNamedCat/riscv-wasm-toolchain/" +
  TOOLCHAIN_RELEASE + "/riscv-wasm-toolchain.tar.gz";

const IS_BROWSER =
  typeof indexedDB !== "undefined" && typeof indexedDB.open === "function";

const DB_NAME = "riscv-wasm-toolchain";
const DB_STORE = "toolchain";

let cachedMap = null;

// --- Minimal ustar parser (verified against the release tarball) ---

function readCString(buf, off, len) {
  let s = "";
  for (let i = off; i < off + len; i++) {
    const c = buf[i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function parseOctal(buf, off, len) {
  let s = "";
  for (let i = off; i < off + len; i++) {
    const c = buf[i];
    if (c === 0 || c === 32) break;
    s += String.fromCharCode(c);
  }
  return s ? parseInt(s, 8) : 0;
}

function parseTar(tar) {
  const map = new Map();
  let off = 0;
  while (off + 512 <= tar.length) {
    // Two zero-filled blocks mark the end of the archive.
    if (tar[off] === 0 && tar[off + 8] === 0) break;
    const name = readCString(tar, off, 100);
    const typeflag = tar[off + 156]; // '0' (48) reg file, 0 old-style reg, '5' (53) dir
    const size = parseOctal(tar, off + 124, 12);
    const dataStart = off + 512;
    if (name && size > 0 && (typeflag === 48 || typeflag === 0)) {
      map.set(name.replace(/^\.\//, "").replace(/^\//, ""), tar.slice(dataStart, dataStart + size));
    }
    off = dataStart + Math.ceil(size / 512) * 512;
  }
  return map;
}

async function fetchTarball() {
  const res = await fetch(RELEASE_URL);
  if (!res.ok) throw new Error(`toolchain release fetch failed: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// --- IndexedDB cache (browser only; degrades to memory on any error) ---

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet() {
  try {
    const db = await idbOpen();
    return await new Promise((res) => {
      const g = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get("toolchain");
      g.onsuccess = () => res(g.result || null);
      g.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

async function idbSet(bytes) {
  try {
    const db = await idbOpen();
    await new Promise((res) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put({ tag: TOOLCHAIN_RELEASE, bytes }, "toolchain");
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } catch {
    /* quota / private mode: skip caching, stay in-memory */
  }
}

export async function getToolchainFS() {
  if (cachedMap) return cachedMap;
  let bytes = null;
  if (IS_BROWSER) {
    const rec = await idbGet();
    if (rec && rec.tag === TOOLCHAIN_RELEASE) bytes = rec.bytes;
  }
  if (!bytes) {
    bytes = await fetchTarball();
    if (IS_BROWSER) await idbSet(bytes);
  }
  cachedMap = parseTar(gunzipSync(bytes));
  return cachedMap;
}

export async function getToolchainText(relPath) {
  const map = await getToolchainFS();
  const data = map.get(relPath);
  if (!data) throw new Error(`toolchain file missing: ${relPath}`);
  return strFromU8(data);
}
