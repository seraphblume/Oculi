#!/usr/bin/env node
// v1.0 "Beryl": the 0.4.0-rc.1 calibration under a release identifier and a new cohort.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
function load(files) {
  const context = vm.createContext({ window: {} });
  for (const f of files) vm.runInContext(fs.readFileSync(path.resolve(root, f), "utf8"), context, { filename: f });
  return context.window;
}
const w = load(["js/vertex.js", "js/config.js", "js/algorithm.js", "js/config-v03.js", "js/engine-v03.js",
  "js/config-v04.js", "js/engine-v04.js", "js/config-v10.js", "js/engine-v10.js", "js/scoring.js", "js/engines.js", "js/storage.js"]);
const eye = (sphere = -2, cylinder = -1, axis = 90) => ({ sphere, cylinder, axis });
const input = age => ({ age, instrument: { vertexMm: 12 }, od: eye(), os: eye() });
const optics = p => ({
  od: [p.od.sphere, p.od.cylinder, p.od.axis, p.od.stratum, p.od.candidates, p.od.seShiftFromAR],
  os: [p.os.sphere, p.os.cylinder, p.os.axis, p.os.stratum, p.os.candidates, p.os.seShiftFromAR],
  add: p.add
});

// Identity: new name, version and cohort; identical calibration.
const v10 = w.DIOPTRA_V10_CONFIG, v04 = w.DIOPTRA_V04_CONFIG;
assert.equal(v10.engine, "v1.0");
assert.equal(v10.name, "Beryl");
assert.equal(v10.version, "1.0.0");
assert.equal(v10.cohort, "v1.0-beryl-1");
assert.notEqual(v10.cohort, v04.cohort, "a new release identifier opens a new cohort");
assert.deepEqual(v10.sphereOffsets, v04.sphereOffsets);
assert.deepEqual(v10.ageBands, v04.ageBands);
assert.equal(v10.offsetsProvenance.carriedFrom, "0.4.0-rc.1");
for (const key of ["estimator", "powerStep", "maxOffset", "seReviewShift", "add", "axis", "lowCylinder", "repeatability", "keratometry", "vertex", "refractiveBins"]) {
  assert.deepEqual(v10[key], v04[key], `unchanged rule: ${key}`);
}

// Dioptric parity with the RC over a broad synthetic sweep.
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
  assert.deepEqual(optics(w.DioptraEngineV10.predictCase(example)), optics(w.DioptraEngineV04.predictCase(example)), `RC parity case ${i}`);
}

// Registry: Beryl primary, v0.3 shadow, retired engines never run.
const configBefore = JSON.stringify(w.DIOPTRA_V03_CONFIG);
for (const age of [9, 17, 17.9, 18, 39, 39.9, 40, 75]) {
  const run = w.DioptraEngines.run(input(age));
  assert.equal(run.primary.id, "v1.0");
  assert.equal(run.primary.prediction.engine, "v1.0");
  assert.equal(run.primary.prediction.name, "Beryl");
  assert.equal(run.primary.prediction.version, "1.0.0");
  assert.equal(run.shadow.id, "v0.3");
  assert.equal(run.primary.prediction.od.stratum.offset, age < 18 ? -.25 : age < 40 ? -.50 : -.30);
  assert.equal(run.primary.prediction.status, "review");
  assert.ok(run.primary.prediction.flags.some(f => f.code === "UNVALIDATED"));
  assert.ok(!run.primary.prediction.flags.some(f => f.code === "EXPERIMENTAL_RC"));
  assert.equal(run.primary.prediction.flags.some(f => f.code === "PEDIATRIC_PRIOR"), age < 18);
  assert.deepEqual(optics(run.shadow.prediction), optics(w.DioptraEngineV03.predictCase(input(age))));
}
assert.equal(JSON.stringify(w.DIOPTRA_V03_CONFIG), configBefore, "no global config mutation");
w.DioptraAlgorithm.predictCase = () => { throw new Error("Retired v0.2 must not run"); };
w.DioptraEngineV04.predictCase = () => { throw new Error("Retired RC must not run"); };
w.DioptraEngines.run(input(30));

// A capped ADD is a review flag, never a silent value.
const capped = w.DioptraEngineV10.predictCase({ ...input(46), od: eye(0.25, -0.25, 20), os: eye(0.5, -0.25, 155), near: { workingDistanceCm: 15 } });
assert.equal(capped.tentativeAdd, 3.5);
assert.ok(capped.flags.some(f => f.code === "ADD_AT_CAP"));
const normal = w.DioptraEngineV10.predictCase({ ...input(46), od: eye(0.25, -0.25, 20), os: eye(0.5, -0.25, 155), near: { workingDistanceCm: 40 } });
assert.ok(!normal.flags.some(f => f.code === "ADD_AT_CAP"));

// Scoring: the lens-tolerance axis rule stays primary; a 5° recording floor is reported alongside.
const s = w.DioptraScoring;
const hi = { sphere: -2, cylinder: -2, axis: 4 }, rec = { sphere: -2, cylinder: -2, axis: 180 };
const scored = s.scoreEye(hi, rec);
assert.equal(scored.axisWithinTolerance, false, "±2° at 2.00 D cylinder");
assert.equal(scored.axisWithinFloor, true, "4° is within a 5° recording step");
assert.equal(scored.clinicalMatch, false);
assert.equal(scored.clinicalMatchFloor, true);
const summary = s.summarize([scored, s.scoreEye(hi, { ...rec, axis: 170 })]);
assert.equal(summary.clinicalMatchRate, 0);
assert.equal(summary.clinicalMatchFloorRate, 0.5);
assert.equal(summary.axisWithinFloorRate, 0.5);
const low = s.scoreEye({ sphere: -1, cylinder: -0.25, axis: 90 }, { sphere: -1, cylinder: -0.25, axis: 102 });
assert.equal(low.axisWithinTolerance, true, "the floor never tightens the ±14° rule at 0.25 D");
assert.equal(low.axisWithinFloor, true);

// Agreement stays rx-agreement-1.
const p = { od: eye(), os: eye() };
assert.equal(s.agreementCase(p, p).version, "rx-agreement-1");
assert.equal(s.agreementCase(p, p).total, 6);

// Exports: Beryl records carry the new checks; the study CSV header is unchanged.
const run = w.DioptraEngines.run(input(30));
const actual = {
  ...p, add: 1, addOs: 1.25, note: "",
  checks: { va: { od: "20/20", os: "20/25", ou: "20/20" }, plusTest: "held" },
  endpoint: { od: eye(-1.75), os: eye(-2), reasons: ["adaptation_large_change", "binocular_comfort"] }
};
const record = {
  schema: "dioptra-case-4", entryRevision: "v10-beryl-1", cohort: v10.cohort, caseId: "S1", savedAt: "2026-11-08T12:00:00Z",
  input: { ...input(30), vaCondition: "unaided", symptoms: { glareHalos: true, flashesFloaters: false }, previousRxKnown: "no", previousRx: null },
  prediction: run.primary.prediction, actual, agreement: s.agreementCase(run.primary.prediction, actual),
  comparison: { od: w.DioptraAlgorithm.compareEye(run.primary.prediction.od, p.od), os: w.DioptraAlgorithm.compareEye(run.primary.prediction.os, p.os) },
  shadow: { prediction: run.shadow.prediction }
};
const studyHeader = w.DioptraStorage.toCSV([record]).split("\n")[0];
assert.equal(studyHeader.split(",").length, 75, "study CSV keeps its 75 columns");
const csv = w.DioptraStorage.toShadowCSV([record]);
const [header, ...rows] = csv.split("\n").map(r => r.split(","));
assert.equal(rows.length, 16);
for (const r of rows) {
  const get = key => r[header.indexOf(key)];
  assert.equal(get("cohort"), "v1.0-beryl-1");
  assert.equal(get("agreement_version"), "rx-agreement-1", "agreement exported for case-4 records");
  assert.equal(get("offset"), get("variant").startsWith("v1.0") ? "-0.5" : "-0.25");
  assert.equal(get("va_condition"), "unaided");
  assert.equal(get("final_va_ou"), "20/20");
  assert.equal(get("plus_test"), "held");
  assert.equal(get("final_add_os"), "1.25");
  assert.equal(get("endpoint_differs"), "true");
  assert.equal(get("endpoint_reasons"), "adaptation_large_change binocular_comfort");
  assert.equal(get("symptom_glare_halos"), "true");
  assert.equal(get("symptom_flashes_floaters"), "false");
  assert.equal(get("axis_within_floor") === "" || ["true", "false"].includes(get("axis_within_floor")), true);
}
const eyeRow = (eyeId, variant = "v1.0") => rows.find(r => r[header.indexOf("eye")] === eyeId && r[header.indexOf("variant")] === variant);
assert.equal(eyeRow("od")[header.indexOf("endpoint_sph")], "-1.75");
assert.equal(eyeRow("os")[header.indexOf("final_va")], "20/25");
console.log("PASS: v1.0 Beryl identity, RC parity, registry, retirement, ADD cap flag, 5° axis floor, agreement and exports");
