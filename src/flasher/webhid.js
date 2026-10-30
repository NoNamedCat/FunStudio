// WebHID bootloader flasher for CH32V003 (bootloader PID 0xB000–0xB00F).
// Protocol extracted from the proven standalone webhid_flash_ch32v003.html.
// The pure core (page split + report builders) is Node-importable and unit-tested.

export const VENDOR_ID = 0x1209;     // pid.codes community VID
export const PAGE_SIZE = 64;
const REPORT_ID = 0x00;               // No Report IDs -> 0
const BOOTLOADER_PID_MIN = 0xB000;    // WebHID bootloader PID range
const BOOTLOADER_PID_MAX = 0xB00F;
const CMD = { PING: 0x01, INFO: 0x02, ERASE64: 0x10, LOAD64: 0x11, PROG64: 0x12, BOOT: 0x20 };
const DEFAULT_REPORT_LEN = 64;
const RECV_TIMEOUT_MS = 300;
const PRESENCE_TIMEOUT_MS = 20000;

// ===== Pure protocol core (Node-testable) =====

export function splitPages(bin) {
  const pages = [];
  for (let offset = 0; offset < bin.length; offset += PAGE_SIZE) {
    const page = new Uint8Array(PAGE_SIZE).fill(0xFF);
    const len = Math.min(PAGE_SIZE, bin.length - offset);
    page.set(bin.subarray(offset, offset + len));
    pages.push(page);
  }
  return pages;
}

function addrBytes(addr) {
  return [(addr >>> 16) & 0xFF, (addr >>> 8) & 0xFF, addr & 0xFF];
}

export function cmdPing() {
  return [CMD.PING, 0x01, 0, 0, 0, 0, 0, 0];
}
export function cmdInfo() {
  return [CMD.INFO, 0, 0, 0, 0, 0, 0, 0];
}
export function cmdErase(addr) {
  const [a2, a1, a0] = addrBytes(addr);
  return [CMD.ERASE64, 0, a2, a1, a0, 0, 0, 0];
}
export function cmdLoadLo(addr, idx, b0, b1) {
  const [a2, a1, a0] = addrBytes(addr);
  return [CMD.LOAD64, idx & 0x7F, a2, a1, a0, idx & 0x7F, b0, b1];
}
export function cmdLoadHi(addr, idx, b2, b3) {
  const [a2, a1, a0] = addrBytes(addr);
  return [CMD.LOAD64, (idx | 0x80) & 0xFF, a2, a1, a0, idx & 0x7F, b2, b3];
}
export function cmdProg(addr) {
  const [a2, a1, a0] = addrBytes(addr);
  return [CMD.PROG64, 0, a2, a1, a0, 0, 0, 0];
}
export function cmdBoot() {
  return [CMD.BOOT, 0, 0, 0, 0, 0, 0, 0];
}

// ===== Browser layer (WebHID) =====

let activeDevice = null;
let inputReportDevice = null;
let inQueue = [];
let waiters = [];
let outReportLen = DEFAULT_REPORT_LEN;
let flashing = false;

function isBootloaderDevice(hidDevice) {
  if (!hidDevice) return false;
  return hidDevice.vendorId === VENDOR_ID &&
    hidDevice.productId >= BOOTLOADER_PID_MIN &&
    hidDevice.productId <= BOOTLOADER_PID_MAX;
}

async function findDeviceByProfile(predicate) {
  if (!("hid" in navigator)) return null;
  const devices = await navigator.hid.getDevices();
  return devices.find(predicate) || null;
}

export async function pairDevice() {
  const permitted = await findDeviceByProfile(isBootloaderDevice);
  if (permitted) return permitted;
  if (!("hid" in navigator)) return null;
  const devices = await navigator.hid.requestDevice({ filters: [{ vendorId: VENDOR_ID }] });
  return devices && devices.length ? devices[0] : null;
}

function onInputReport(e) {
  const u8 = new Uint8Array(e.data.buffer);
  if (outReportLen === DEFAULT_REPORT_LEN && u8 && u8.length >= 8 && u8.length !== outReportLen) {
    outReportLen = u8.length;
  }
  if (waiters.length) {
    const { resolve } = waiters.shift();
    resolve(u8);
  } else {
    inQueue.push(u8);
  }
}

function detachInputReportListener() {
  if (inputReportDevice) {
    try {
      inputReportDevice.removeEventListener("inputreport", onInputReport);
    } catch (err) {
      console.warn("Failed to remove inputreport listener:", err);
    }
    inputReportDevice = null;
  }
}

function resetFlashState() {
  detachInputReportListener();
  inQueue = [];
  waiters = [];
  outReportLen = DEFAULT_REPORT_LEN;
  activeDevice = null;
  flashing = false;
}

function recv(timeoutMs = RECV_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (inQueue.length) {
      return resolve(inQueue.shift());
    }
    const timer = setTimeout(() => {
      const idx = waiters.findIndex((w) => w.resolve === resolve);
      if (idx >= 0) waiters.splice(idx, 1);
      reject(new Error("timeout"));
    }, timeoutMs);
    waiters.push({
      resolve: (val) => { clearTimeout(timer); resolve(val); },
      reject,
    });
  });
}

async function sendReportRaw(bytes, { expect = true, timeout = RECV_TIMEOUT_MS } = {}) {
  const raw = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
  const buf = new Uint8Array(outReportLen);
  buf.fill(0);
  buf.set(raw.subarray(0, Math.min(raw.length, outReportLen)));
  await activeDevice.sendReport(REPORT_ID, buf);
  if (!expect) return null;
  return await recv(timeout);
}

async function txrx(bytes, tries = 3, timeout = RECV_TIMEOUT_MS) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await sendReportRaw(bytes, { expect: true, timeout });
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 50));
      try { await sendReportRaw(cmdPing(), { expect: false }); } catch { /* unlock attempt */ }
    }
  }
  throw lastErr || new Error("txrx failed");
}

async function waitForPresence({ predicate, shouldBePresent, timeoutMs = PRESENCE_TIMEOUT_MS }) {
  const current = await findDeviceByProfile(predicate);
  if (shouldBePresent ? current : !current) return current;

  return new Promise((resolve, reject) => {
    const eventName = shouldBePresent ? "connect" : "disconnect";
    const cleanup = () => {
      clearTimeout(timer);
      navigator.hid.removeEventListener(eventName, handler);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timeout"));
    }, timeoutMs);
    const handler = (event) => {
      if (!predicate(event.device)) return;
      cleanup();
      resolve(shouldBePresent ? event.device : null);
    };
    navigator.hid.addEventListener(eventName, handler);
  });
}

export async function flashToBoard(device, bin, cb = {}) {
  const onProgress = cb.onProgress || (() => {});
  const onStatus = cb.onStatus || (() => {});
  const onLog = cb.onLog || (() => {});

  resetFlashState();
  flashing = true;

  try {
    // Close any open handle so the user can unplug.
    if (device && device.opened) {
      try { await device.close(); } catch { /* already gone */ }
    }

    // Phase 1: user disconnects the board (skip if it's already gone).
    onStatus("disconnect");
    const sameProfile = (d) => d.vendorId === VENDOR_ID && d.productId === device.productId;
    await waitForPresence({ predicate: sameProfile, shouldBePresent: false });

    // Phase 2: board comes back in bootloader mode.
    onStatus("reconnect");
    const board = await waitForPresence({ predicate: isBootloaderDevice, shouldBePresent: true });

    // The bootloader window is short (~7.5 s): open and flash immediately.
    activeDevice = board;
    if (!activeDevice.opened) {
      await activeDevice.open();
    }
    activeDevice.addEventListener("inputreport", onInputReport);
    inputReportDevice = activeDevice;

    const pong = await txrx(cmdPing()).catch(() => null);
    if (pong) onLog("PING ok");
    const info = await txrx(cmdInfo()).catch(() => null);
    if (pong === null && info === null) {
      throw new Error("Bootloader not responding — is the board in bootloader mode?");
    }

    const pages = splitPages(bin);
    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const addr = pageIdx * PAGE_SIZE;
      const page = pages[pageIdx];
      await txrx(cmdErase(addr));
      for (let i = 0; i < PAGE_SIZE / 4; i++) {
        await txrx(cmdLoadLo(addr, i, page[i * 4 + 0], page[i * 4 + 1]));
        await txrx(cmdLoadHi(addr, i, page[i * 4 + 2], page[i * 4 + 3]));
      }
      await txrx(cmdProg(addr), 3, 600);
      onProgress(Math.round(((pageIdx + 1) / pages.length) * 100));
    }
    onStatus("done");
    return;
  } finally {
    flashing = false;
  }
}

export async function bootBoard(device) {
  if (activeDevice !== device && device && !device.opened) {
    await device.open();
  }
  await txrx(cmdBoot()).catch(() => null);
}

export async function closeBoard(device) {
  resetFlashState();
  if (device && device.opened) {
    try { await device.close(); } catch { /* already gone */ }
  }
}

export function isFlashing() {
  return flashing;
}
