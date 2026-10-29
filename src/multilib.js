// Pure multilib selection — mirrors the real riscv32-unknown-elf-gcc driver:
// a multilib variant is compatible iff it has the same xlen, the same ABI,
// and its ISA is a subset of the requested ISA. Among compatible variants
// the one with the most ISA extensions wins (most specific); ties break
// lexicographically. No match → throw (no silent fallback).

const ISA_LETTERS = "imacdefq";

export function parseIsa(march) {
  if (typeof march !== "string") return null;
  const m = march.match(/^rv(32|64)([a-z]*)(?:_.*)?$/i);
  if (!m) return null;
  const xlen = Number(m[1]);
  const base = (m[2] || "").toLowerCase();
  const exts = new Set();
  for (const ch of base) if (ISA_LETTERS.includes(ch)) exts.add(ch);
  return { xlen, exts };
}

export function matchMultilib(march, abi, availableMultilibs) {
  const req = parseIsa(march);
  if (!req) throw new Error(`Invalid -march: ${march}`);

  let best = null;
  let bestScore = -1;

  for (const dir of availableMultilibs) {
    const parts = dir.split("/");
    if (parts.length !== 2) continue;
    const [mArch, mAbi] = parts;
    if (mAbi !== abi) continue;

    const cand = parseIsa(mArch);
    if (!cand) continue;
    if (cand.xlen !== req.xlen) continue;

    // Candidate ISA must be a subset of the requested ISA.
    let subset = true;
    for (const ext of cand.exts) {
      if (!req.exts.has(ext)) {
        subset = false;
        break;
      }
    }
    if (!subset) continue;

    const score = cand.exts.size;
    if (score > bestScore || (score === bestScore && dir < best)) {
      best = dir;
      bestScore = score;
    }
  }

  if (!best) {
    throw new Error(
      `No libgcc for requested -march=${march}/-mabi=${abi}: no multilib variant is a subset of the requested ISA (available: ${availableMultilibs.join(", ")})`
    );
  }
  return best;
}
