#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
function load(files) {
  const context = vm.createContext({ window: {} });
  for (const f of files) vm.runInContext(fs.readFileSync(path.resolve(root, f), "utf8"), context, { filename: f });
  return context.window;
}
const baseFiles = ["js/vertex.js", "js/config.js", "js/algorithm.js", "js/config-v03.js"];
const w = load([...baseFiles, "js/engine-v03.js", "js/config-v04.js", "js/engine-v04.js", "js/config-v10.js", "js/engine-v10.js", "js/scoring.js", "js/engines.js", "js/storage.js"]);
const eye = (sphere = -2, cylinder = -1, axis = 90) => ({ sphere, cylinder, axis });
const input = age => ({ age, instrument: { vertexMm: 12 }, od: eye(), os: eye() });
const withoutTime = p => { const copy = JSON.parse(JSON.stringify(p)); delete copy.lockedAt; return copy; };

// Compare against archived d0ab3aa source in the SAME runtime: trig floating-point
// bytes can vary across Node/CPU versions. Keep exact full-output equality, not a
// platform-specific output hash or a tolerance that could hide a changed rule.
for (const [file, hash] of [
  ["tests/fixtures/v0.3-pre-rc.js", "aed15f0c06ac5ec76fbbec974515ceb0507304295ff7efaebaeacc6f39c00ef6"],
  ["js/config-v03.js", "a434f2728c51d1c0c9ed4437aade612f3467e35b7f266681a5250e2056bb52eb"]
]) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex"), hash, `Frozen reference changed: ${file}`);
const reference = load([...baseFiles, "tests/fixtures/v0.3-pre-rc.js"]);
for (let i = 0; i < 500; i++) {
  const od = eye((i % 85 - 60) / 4, -(i % 17) / 4, i % 180 + 1);
  const os = eye((i % 63 - 45) / 4, -(i % 13) / 4, (i * 7) % 180 + 1);
  const example = {
    age: i % 80 + 5,
    instrument: i % 5 ? { vertexMm: 8 + i % 8 } : {},
    near: i % 3 ? { workingDistanceCm: 33 + i % 12, nearPointCm: 15 + i % 40 } : {},
    od: { ...od, va: "20/40", pinhole: i % 2 ? "20/40" : "20/20", readings: i % 4 ? [od, { ...od, sphere: od.sphere - .25 }, { ...od, axis: od.axis % 180 + 1 }] : [] },
    os: { ...os, readings: [os, os, os] }
  };
  assert.deepEqual(withoutTime(w.DioptraEngineV03.predictCase(example)), withoutTime(reference.DioptraEngineV03.predictCase(example)), `Baseline parity case ${i}`);
}

const configBefore = JSON.stringify(w.DIOPTRA_V03_CONFIG);
assert.equal(w.DIOPTRA_V04_CONFIG.sphereOffsets.myopiaEmmetropia.under40, -.50);
assert.equal(w.DIOPTRA_V04_CONFIG.sphereOffsets.myopiaEmmetropia["40plus"], -.30);
// 0.4.0-rc.1 is retired from new runs (v1.0 "Beryl" carries its calibration); the frozen
// source stays testable so historical records and the v1.0 parity test have a reference.
const runRc = inp => ({ primary: { id: "v0.4", prediction: w.DioptraEngineV04.predictCase(inp) }, shadow: { id: "v0.3", prediction: w.DioptraEngineV03.predictCase(inp) } });
assert.equal(w.DioptraEngines.primaryId(), "v1.0", "the RC is no longer the primary engine");
for (const age of [9, 17, 17.9, 18, 39, 39.9, 40, 75]) {
  const run = runRc(input(age));
  assert.equal(run.primary.prediction.version, "0.4.0-rc.1");
  assert.equal(run.primary.prediction.od.stratum.offset, age < 18 ? -.25 : age < 40 ? -.50 : -.30);
  assert.equal(run.shadow.prediction.od.stratum.offset, -.25);
  assert.equal(run.primary.prediction.status, "review");
  assert.ok(run.primary.prediction.flags.some(f => f.code === "EXPERIMENTAL_RC"));
  assert.equal(run.primary.prediction.flags.some(f => f.code === "PEDIATRIC_PRIOR"), age < 18);
}
assert.equal(JSON.stringify(w.DIOPTRA_V03_CONFIG), configBefore, "no global config mutation");
for (const sphere of [1.25, 3.5]) {
  const p = w.DioptraEngineV04.predictCase({ ...input(35), od: eye(sphere, 0), os: eye(sphere, 0) });
  assert.equal(p.od.stratum.offset, -.25);
  assert.ok(p.flags.some(f => f.code === "SPARSE_CALIBRATION"));
}
const unchanged = withoutTime(w.DioptraEngineV04.predictCase(input(35)));
for (const wornMonths of [null, 0, 12, 24, 120]) {
  assert.deepEqual(withoutTime(w.DioptraEngineV04.predictCase({ ...input(35), previousRxKnown: "yes", previousRx: { od: eye(-5), os: eye(-5), wornMonths } })), unchanged);
}

const score = w.DioptraScoring.agreementCase;
const p = { od: eye(), os: eye() };
assert.equal(score(p, p).percent, 100);
assert.equal(score(p, p).total, 6);
const changed = { od: eye(-2.5), os: eye(-2) };
assert.equal(score(p, changed).passed, 5);
assert.equal(score(p, changed).percent, 83);
assert.equal(score(p, { od: eye(-2.25), os: eye(-2.25) }).percent, 100, "within tolerance is not exactness");
const sphereOnly = { od: eye(-2, 0, 0), os: eye(-2, 0, 0) };
assert.equal(score(sphereOnly, sphereOnly).total, 4);
assert.equal(score(p, sphereOnly).total, 4, "axis excluded if either cylinder is zero");
assert.equal(score(p, null), null);
assert.equal(score(p, { od: eye(NaN), os: eye() }), null);
assert.equal(score(p, { ...p, add: 3 }).percent, 100, "ADD is separate");

const run = runRc(input(30));
const record = { schema: "dioptra-case-3", cohort: w.DIOPTRA_V04_CONFIG.cohort, caseId: "S1", savedAt: "2026-10-23T12:00:00Z", input: { ...input(30), previousRxKnown: "yes", previousRx: { od: eye(), os: eye(), add: null, wornMonths: 24 } }, prediction: run.primary.prediction, actual: { ...p, add: null }, shadow: { prediction: run.shadow.prediction } };
const csv = w.DioptraStorage.toShadowCSV([record]);
const [header, ...rows] = csv.split("\n").map(r => r.split(","));
assert.equal(rows.length, 16);
for (const r of rows) {
  const get = key => r[header.indexOf(key)];
  assert.equal(get("previous_rx_worn_months"), "24");
  assert.equal(get("agreement_version"), "rx-agreement-1");
  assert.equal(get("offset"), get("variant").startsWith("v0.4") ? "-0.5" : "-0.25", "each variant uses its own evidence");
}
record.input.previousRxKnown = "no";
const noPrior = w.DioptraStorage.toShadowCSV([record]).split("\n")[1].split(",");
assert.equal(noPrior[header.indexOf("previous_rx_worn_months")], "", "hidden previous duration never exports");
record.input.previousRxKnown = "yes";
for (const months of [null, 0]) {
  record.input.previousRx.wornMonths = months;
  const row = w.DioptraStorage.toShadowCSV([record]).split("\n")[1].split(",");
  assert.equal(row[header.indexOf("previous_rx_worn_months")], months == null ? "" : "0");
}
const oldRecord = { ...record, schema: "dioptra-case-2", cohort: "v0.3-candidate-1", prediction: run.shadow.prediction, shadow: null };
const oldBefore = JSON.stringify(oldRecord);
const oldCsv = w.DioptraStorage.toShadowCSV([oldRecord]).split("\n").map(r => r.split(","));
assert.equal(oldCsv.length - 1, 8, "old v0.3 primary and its three estimators remain exportable");
assert.equal(oldCsv[1][oldCsv[0].indexOf("agreement_percent")], "", "do not fabricate a historical score");
assert.equal(JSON.stringify(oldRecord), oldBefore);
console.log("PASS: frozen 0.4.0-rc.1 offsets, prior fallbacks, baseline parity, engine retirement, history isolation, agreement and exports");
