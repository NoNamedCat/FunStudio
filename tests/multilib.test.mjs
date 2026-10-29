import assert from "node:assert";
import { matchMultilib } from "../src/multilib.js";

const LIST = ["rv32ec/ilp32e", "rv32imac/ilp32", "rv32imafc/ilp32f"];

// Exact catalog targets
assert.strictEqual(matchMultilib("rv32ec_zicsr", "ilp32e", LIST), "rv32ec/ilp32e");
assert.strictEqual(matchMultilib("rv32imac_zicsr", "ilp32", LIST), "rv32imac/ilp32");
assert.strictEqual(matchMultilib("rv32imafc_zicsr", "ilp32f", LIST), "rv32imafc/ilp32f");

// ABI mismatch must throw
assert.throws(() => matchMultilib("rv32imac", "ilp32e", LIST));

// Superset fallback: requested ISA larger than any exact match → smallest containing variant
const listWithoutImac = ["rv32ec/ilp32e", "rv32im/ilp32", "rv32imafc/ilp32f"];
assert.strictEqual(matchMultilib("rv32imac_zicsr", "ilp32", listWithoutImac), "rv32im/ilp32");

// Requested ISA smaller than any variant → throw
const listImOnly = ["rv32im/ilp32", "rv32imafc/ilp32f"];
assert.throws(() => matchMultilib("rv32i", "ilp32", listImOnly));

// Multilib dirs with driver-normalized _z extensions are equivalent to their base ISA
const normalized = ["rv32imac_zaamo_zalrsc/ilp32"];
assert.strictEqual(matchMultilib("rv32imac", "ilp32", normalized), "rv32imac_zaamo_zalrsc/ilp32");

// xlen mismatch → throw
assert.throws(() => matchMultilib("rv64imac", "ilp32", LIST));

console.log("multilib: all tests passed");
