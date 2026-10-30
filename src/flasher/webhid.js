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

// ===== B003Fun (PID 0xB003) Feature-Report op builder (pure) =====
// 128-byte feature report: [0]=0xaa report id, args from byte 4, data at 60.

export function createOp() {
  const buffer = new Uint8Array(128);
  buffer.fill(0);
  buffer[0] = 0xaa;
  return { buffer, commandplace: 4 };
}
export function opWriteU32(op, v) {
  new DataView(op.buffer.buffer).setUint32(op.commandplace, v, true);
  op.commandplace += 4;
}
export function opWriteArb(op, data) {
  op.buffer.set(data, op.commandplace);
  op.commandplace += data.length;
}

// ===== Browser layer (WebHID) =====

// Report queue: push() delivers to the oldest live waiter; a waiter that
// times out is removed by identity so it can never consume a later report.
export function createReportQueue() {
  let inQueue = [];
  let waiters = [];
  return {
    push(data) {
      if (waiters.length) {
        waiters.shift().resolve(data);
      } else {
        inQueue.push(data);
      }
    },
    recv(timeoutMs = RECV_TIMEOUT_MS) {
      return new Promise((resolve, reject) => {
        if (inQueue.length) return resolve(inQueue.shift());
        let entry;
        const timer = setTimeout(() => {
          const i = waiters.indexOf(entry);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error("timeout"));
        }, timeoutMs);
        entry = {
          resolve: (val) => { clearTimeout(timer); resolve(val); },
          reject,
        };
        waiters.push(entry);
      });
    },
    reset() {
      inQueue = [];
      waiters = [];
    },
  };
}

const PID_B003FUN = 0xB003;

// B003Fun bootloader blobs (from the proven standalone flasher).
const B003_BLOBS = {
  word_wise_write: new Uint8Array([
    0x23,0xa0,0x05,0x00,0x13,0x07,0x45,0x03,0x0c,0x43,0x50,0x43,0x2e,0x96,0x21,0x07,
    0x14,0x43,0x94,0xc1,0x91,0x05,0x11,0x07,0xe3,0xcc,0xc5,0xfe,0x93,0x06,0xf0,0xff,
    0x14,0xc1,0x82,0x80,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]),
  byte_wise_write: new Uint8Array([
    0x23,0xa0,0x05,0x00,0x13,0x07,0x45,0x03,0x0c,0x43,0x50,0x43,0x2e,0x96,0x21,0x07,
    0x14,0x23,0x94,0xa1,0x94,0x21,0x14,0xa3,0x85,0x05,0x05,0x07,0xe3,0xca,0xc5,0xfe,
    0x93,0x06,0xf0,0xff,0x14,0xc1,0x82,0x80,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]),
  half_wise_write: new Uint8Array([
    0x23,0xa0,0x05,0x00,0x13,0x07,0x45,0x03,0x0c,0x43,0x50,0x43,0x2e,0x96,0x21,0x07,
    0x16,0x23,0x96,0xa1,0x96,0x21,0x16,0xa3,0x89,0x05,0x09,0x07,0xe3,0xca,0xc5,0xfe,
    0x93,0x06,0xf0,0xff,0x14,0xc1,0x82,0x80,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]),
  word_wise_read: new Uint8Array([
    0x23,0xa0,0x05,0x00,0x13,0x07,0x45,0x03,0x0c,0x43,0x50,0x43,0x2e,0x96,0x21,0x07,
    0x94,0x41,0x14,0xc3,0x91,0x05,0x11,0x07,0xe3,0xcc,0xc5,0xfe,0x93,0x06,0xf0,0xff,
    0x14,0xc1,0x82,0x80,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]),
  half_wise_read: new Uint8Array([
    0x23,0xa0,0x05,0x00,0x13,0x07,0x45,0x03,0x0c,0x43,0x50,0x43,0x2e,0x96,0x21,0x07,
    0x96,0x21,0x16,0xa3,0x89,0x05,0x09,0x07,0xe3,0xca,0xc5,0xfe,0x93,0x06,0xf0,0xff,
    0x14,0xc1,0x82,0x80,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]),
  byte_wise_read: new Uint8Array([
    0x23,0xa0,0x05,0x00,0x13,0x07,0x45,0x03,0x0c,0x43,0x50,0x43,0x2e,0x96,0x21,0x07,
    0x94,0x21,0x14,0xa3,0x85,0x05,0x05,0x07,0xe3,0xcc,0xc5,0xfe,0x93,0x06,0xf0,0xff,
    0x14,0xc1,0x82,0x80,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]),
  write64_flash: new Uint8Array([
    0x13,0x07,0x45,0x03,0x0c,0x43,0x13,0x86,0x05,0x04,0x5c,0x43,0x8c,0xc7,0x14,0x47,
    0x94,0xc1,0xb7,0x06,0x05,0x00,0xd4,0xc3,0x94,0x41,0x91,0x05,0x11,0x07,0xe3,0xc8,
    0xc5,0xfe,0xc1,0x66,0x93,0x86,0x06,0x04,0xd4,0xc3,0xfd,0x56,0x14,0xc1,0x82,0x80]),
};

let reportQueue = createReportQueue();
let activeDevice = null;
let inputReportDevice = null;
let outReportLen = DEFAULT_REPORT_LEN;
let flashing = false;
let b003Unlocked = false;

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
  reportQueue.push(u8);
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
  reportQueue.reset();
  outReportLen = DEFAULT_REPORT_LEN;
  activeDevice = null;
  flashing = false;
  b003Unlocked = false;
}

function recv(timeoutMs = RECV_TIMEOUT_MS) {
  return reportQueue.recv(timeoutMs);
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

// ===== B003Fun device layer (Feature Report 0xaa, 128B) =====

async function commitOpFeature(op, onLog, { noGetReport = false } = {}) {
  const dv = new DataView(op.buffer.buffer);
  dv.setUint32(124, 0x1234abcd, true);
  op.buffer[0] = 0xaa;
  await activeDevice.sendFeatureReport(0xaa, op.buffer.subarray(1));
  if (noGetReport) return null;
  for (let t = 0; t < 60; t++) {
    await new Promise((r) => setTimeout(r, t ? 10 : 20));
    try {
      const view = await activeDevice.receiveFeatureReport(0xaa);
      const raw = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      const statusByte = raw.length ? raw[0] : 0;
      if (t === 0) {
        onLog("feature report received (len=" + raw.length + ")");
      }
      if (statusByte === 0xff) {
        // Normalize to the 128-byte layout (report id at [0]).
        const normalized = new Uint8Array(128);
        normalized.fill(0);
        normalized[0] = 0xaa;
        const copyLen = Math.min(127, raw.length);
        if (copyLen > 0) normalized.set(raw.subarray(0, copyLen), 1);
        return normalized;
      }
    } catch (err) {
      if (t === 0) onLog("Failed to read feature report: " + (err && err.message));
    }
  }
  throw new Error("Timeout waiting for bootloader response (feature report)");
}

async function b003ReadWord(addr, onLog) {
  const op = createOp();
  opWriteArb(op, B003_BLOBS.word_wise_read);
  opWriteU32(op, addr);
  opWriteU32(op, 4);
  const resp = await commitOpFeature(op, onLog);
  if (!resp || resp.length < 64) return 0;
  const dv = new DataView(resp.buffer, (resp.byteOffset || 0) + 60, 4);
  return dv.getUint32(0, true);
}

async function b003WriteWord(addr, val, onLog) {
  const op = createOp();
  opWriteArb(op, B003_BLOBS.word_wise_write);
  opWriteU32(op, addr);
  opWriteU32(op, 4);
  new DataView(op.buffer.buffer).setUint32(60, val, true);
  await commitOpFeature(op, onLog);
}

async function b003UnlockFlash(onLog) {
  if (b003Unlocked) return true;
  const ctlr = await b003ReadWord(0x40022010, onLog);
  if (ctlr & 0x8080) {
    for (const addr of [0x40022004, 0x40022008, 0x40022024]) {
      await b003WriteWord(addr, 0x45670123, onLog);
      await b003WriteWord(addr, 0xCDEF89AB, onLog);
    }
    const ctlrAfter = await b003ReadWord(0x40022010, onLog);
    if (ctlrAfter & 0x8080) throw new Error("Flash locked");
  }
  b003Unlocked = true;
  return true;
}

async function b003IsSectorErased(address, onLog) {
  const first = await b003ReadWord(address & ~0x3f, onLog);
  return first === 0xFFFFFFFF;
}

async function b003EraseSector(address, onLog) {
  await b003UnlockFlash(onLog);
  const CR_PAGE_ER = 0x00020000, CR_STRT_Set = 0x00000040;
  await b003WriteWord(0x40022010, CR_PAGE_ER, onLog);
  await b003WriteWord(0x40022014, address, onLog);
  await b003WriteWord(0x40022010, CR_STRT_Set | CR_PAGE_ER, onLog);
  await new Promise((r) => setTimeout(r, 50));
  await b003WriteWord(0x40022010, 0, onLog);
}

async function b003BlockWrite64(address, data, onLog) {
  if (data.length !== 64) throw new Error("block must be 64 bytes");
  await b003UnlockFlash(onLog);
  if (!(await b003IsSectorErased(address, onLog))) await b003EraseSector(address, onLog);
  const CR_PAGE_PG = 0x00010000, CR_BUF_RST = 0x00080000;
  await b003WriteWord(0x40022010, CR_PAGE_PG, onLog);
  await b003WriteWord(0x40022010, CR_PAGE_PG | CR_BUF_RST, onLog);
  const op = createOp();
  opWriteArb(op, B003_BLOBS.write64_flash);
  opWriteU32(op, address);
  opWriteU32(op, 0x4002200c);
  op.buffer.set(data, 60);
  await commitOpFeature(op, onLog);
  await new Promise((r) => setTimeout(r, 10));
}

function b003Pct(onProgress, offset, total) {
  onProgress(Math.min(100, Math.round((offset / total) * 100)));
}

async function b003WriteBinary(startAddress, dataU8, onLog, onProgress) {
  let address = startAddress;
  let offset = 0;
  const data = dataU8;
  if ((address & 0xff000000) === 0x08000000) {
    let currentAddress = address & ~0x3f;
    if (currentAddress < address) {
      const pre = address - currentAddress;
      const temp = new Uint8Array(64).fill(0xFF);
      temp.set(data.slice(0, Math.min(64 - pre, data.length)), pre);
      await b003BlockWrite64(currentAddress, temp, onLog);
      offset = 64 - pre;
      currentAddress += 64;
      b003Pct(onProgress, offset, data.length);
    }
    while (data.length - offset >= 64) {
      await b003BlockWrite64(currentAddress, data.slice(offset, offset + 64), onLog);
      offset += 64;
      currentAddress += 64;
      b003Pct(onProgress, offset, data.length);
    }
    if (offset < data.length) {
      const temp = new Uint8Array(64).fill(0xFF);
      temp.set(data.slice(offset), 0);
      await b003BlockWrite64(currentAddress, temp, onLog);
      offset = data.length;
      b003Pct(onProgress, offset, data.length);
    }
    return;
  }
  // Generic path (not used for CH32V003 flash addresses).
  while (data.length - offset > 3) {
    let toWrite = (data.length - offset) & ~3;
    if (toWrite > 64) toWrite = 64;
    const op = createOp();
    opWriteArb(op, B003_BLOBS.word_wise_write);
    opWriteU32(op, address);
    opWriteU32(op, toWrite);
    op.buffer.set(data.slice(offset, offset + toWrite), 60);
    await commitOpFeature(op, onLog);
    offset += toWrite;
    address += toWrite;
    b003Pct(onProgress, offset, data.length);
  }
  if (data.length - offset > 1) {
    const op = createOp();
    opWriteArb(op, B003_BLOBS.half_wise_write);
    opWriteU32(op, address);
    opWriteU32(op, 2);
    op.buffer.set(data.slice(offset, offset + 2), 60);
    await commitOpFeature(op, onLog);
    offset += 2;
    address += 2;
    b003Pct(onProgress, offset, data.length);
  }
  if (data.length - offset > 0) {
    const op = createOp();
    opWriteArb(op, B003_BLOBS.byte_wise_write);
    opWriteU32(op, address);
    opWriteU32(op, 1);
    op.buffer.set(data.slice(offset, offset + 1), 60);
    await commitOpFeature(op, onLog);
    offset += 1;
    address += 1;
    b003Pct(onProgress, offset, data.length);
  }
}

export async function flashToBoard(device, bin, cb = {}) {
  const onProgress = cb.onProgress || (() => {});
  const onStatus = cb.onStatus || (() => {});
  const onLog = cb.onLog || (() => {});

  if (flashing) throw new Error("flash already in progress");
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
    onLog("board connected: VID=0x" + board.vendorId.toString(16).toUpperCase() + " PID=0x" + board.productId.toString(16).toUpperCase());

    // The bootloader window is short (~7.5 s): open and flash immediately.
    activeDevice = board;
    if (!activeDevice.opened) {
      await activeDevice.open();
    }
    activeDevice.addEventListener("inputreport", onInputReport);
    inputReportDevice = activeDevice;

    if (board.productId === PID_B003FUN) {
      onLog("B003Fun bootloader detected (Feature Report 0xaa)");
      await b003WriteBinary(0x08000000, bin, onLog, onProgress);
      onStatus("done");
      return;
    }

    const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join(" ");
    const pong = await txrx(cmdPing()).catch((e) => { onLog("PING failed: " + (e && e.message)); return null; });
    if (pong) onLog("PING ok: " + hex(pong));
    const info = await txrx(cmdInfo()).catch((e) => { onLog("INFO failed: " + (e && e.message)); return null; });
    if (info) onLog("INFO: " + hex(info));
    if (pong === null && info === null) {
      throw new Error("Bootloader not responding — is the board in bootloader mode?");
    }

    const pages = splitPages(bin);
    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      if (!flashing) throw new Error("cancelled");
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
  } catch (err) {
    // Release the USB handle on failure so a retry works without reloading.
    if (activeDevice && activeDevice.opened) {
      try { await activeDevice.close(); } catch { /* already gone */ }
    }
    resetFlashState();
    throw err;
  } finally {
    flashing = false;
  }
}

export async function bootBoard(device, onLog = () => {}) {
  const target = activeDevice || device;
  activeDevice = target;
  if (target && !target.opened) {
    await target.open();
  }
  if (target && target.productId === PID_B003FUN) {
    onLog("B003Fun: unplug/replug the board to boot the application.");
    return;
  }
  await txrx(cmdBoot()).catch(() => null);
}

export async function closeBoard(device) {
  const board = activeDevice;
  resetFlashState();
  for (const d of [device, board]) {
    if (d && d.opened) {
      try { await d.close(); } catch { /* already gone */ }
    }
  }
}

export function isFlashing() {
  return flashing;
}
