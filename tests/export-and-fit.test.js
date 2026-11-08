#!/usr/bin/env node
// End-to-end: synthetic cases -> engines -> study/shadow CSV -> offset fitting tool.
// The synthetic clinician is 0.50 D more minus in young myopes and 0.25 D more plus in
// higher hyperopes; the fitting tool should recover that pattern.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ["js/vertex.js", "js/config.js", "js/algorithm.js", "js/config-v03.js", "js/engine-v03.js", "js/config-v10.js", "js/engine-v10.js", "js/scoring.js", "js/engines.js", "js/storage.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
}
const w = sandbox.window;

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const q = x => Math.round(x * 4) / 4;

function buildCases(mode) {
  w.DIOPTRA_V03_CONFIG.mode = mode;
  const cases = [];
  for (let i = 0; i < 60; i++) {
    const age = 18 + Math.floor(rnd() * 55);
    const hyper = rnd() < 0.25;
    const make = () => ({ sphere: hyper ? q(0.75 + rnd() * 3) : q(-0.5 - rnd() * 5), cylinder: -q(rnd() * 2), axis: 1 + Math.floor(rnd() * 180) });
    const od = make();
    const os = make();
    const clinician = e => {
      const m = e.sphere + e.cylinder / 2;
      return m <= 0.5 && age < 40 ? -0.5 : m > 2 ? 0.25 : 0;
    };
    const input = { caseId: `S${i}`, age, od: { ...od, va: "", pinhole: "" }, os: { ...os, va: "", pinhole: "" } };
    const rich = {
      ...input,
      instrument: { vertexMm: 12 },
      od: { ...input.od, readings: [od, { ...od, sphere: od.sphere - 0.25 }, od] },
      os: { ...input.os, readings: [os, os, os] }
    };
    const run = mode === "shadow" ? {
      primary: { prediction: w.DioptraAlgorithm.predictCase(rich) },
      shadow: { prediction: w.DioptraEngineV03.predictCase(rich) }
    } : w.DioptraEngines.run(rich);
    const final = e => ({ sphere: q(e.sphere + clinician(e)), cylinder: e.cylinder, axis: Math.round(e.axis / 5) * 5 || 180 });
    const actual = { od: final(od), os: final(os), add: null, note: "" };
    const prediction = run.primary.prediction;
    cases.push({
      caseId: `S${i}`,
      savedAt: "2026-01-01T00:00:00.000Z",
      input,
      prediction,
      actual,
      comparison: { od: w.DioptraAlgorithm.compareEye(prediction.od, actual.od), os: w.DioptraAlgorithm.compareEye(prediction.os, actual.os) },
      shadow: { shadowOnly: true, observations: { instrument: { vertexMm: 12 }, near: {} }, prediction: run.shadow.prediction }
    });
  }
  return cases;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dioptra-"));

// Study CSV columns are unchanged from the v0.2 Cohort B export.
const STUDY_HEADER = "case_id,age,created_at,algorithm_version,ar_od_sph,ar_od_cyl,ar_od_axis,va_od,ph_od,ar_os_sph,ar_os_cyl,ar_os_axis,va_os,ph_os,pred_od_sph,pred_od_cyl,pred_od_axis,pred_os_sph,pred_os_cyl,pred_os_axis,pred_add,final_od_sph,final_od_cyl,final_od_axis,final_os_sph,final_os_cyl,final_os_axis,final_add,od_sph_error,od_cyl_error,od_axis_error,os_sph_error,os_cyl_error,os_axis_error,ar_od_se,pred_od_se,final_od_se,pred_od_se_shift,od_se_error,od_se_guardrail_status,od_se_guardrail_applied,ar_os_se,pred_os_se,final_os_se,pred_os_se_shift,os_se_error,os_se_guardrail_status,os_se_guardrail_applied,od_exact,os_exact,od_within_025_sph,od_within_025_cyl,od_within_5_axis,od_within_025_se,os_within_025_sph,os_within_025_cyl,os_within_5_axis,os_within_025_se,symptoms_text,symptom_tearing,symptom_blurred_vision,symptom_burning_irritation,symptom_itching,symptom_discharge,symptom_infection,symptom_headache,symptom_flashes,symptom_dry_eye,symptom_other,symptom_other_text,diabetes,hypertension,pregnancy,previous_rx_known,final_note";
const cases = buildCases("active");
assert.equal(w.DioptraStorage.toCSV(cases).split("\n")[0], STUDY_HEADER);

// Shadow CSV: case x eye x variant.
const shadowCsv = w.DioptraStorage.toShadowCSV(cases);
const lines = shadowCsv.trim().split("\n");
assert.equal(lines.length - 1, 60 * 2 * 8, "primary + shadow + three estimators for each engine per eye");
assert.ok(lines[0].includes("axis_within_tolerance"));
assert.ok(lines[0].includes("ar_centre_m"));
const shadowFile = path.join(tmp, "shadow.csv");
fs.writeFileSync(shadowFile, shadowCsv);

// Guard: the Beryl cohort is open, so fitting needs an explicit --cohort-closed.
const berylGuard = spawnSync(process.execPath, [path.join(root, "tools/fit-offsets.js"), shadowFile], { encoding: "utf8" });
assert.equal(berylGuard.status, 2);
assert.match(berylGuard.stderr, /v1\.0 Beryl/);
const fit = spawnSync(process.execPath, [path.join(root, "tools/fit-offsets.js"), shadowFile, "--cohort-closed"], { encoding: "utf8" });
assert.equal(fit.status, 0, fit.stderr);
const snippet = JSON.parse(fit.stdout.slice(fit.stdout.indexOf("{")));
assert.ok(snippet.sphereOffsets.myopiaEmmetropia.under40 < -0.2, "young myopes need more minus (shrunk toward global)");
assert.ok(Math.abs(snippet.sphereOffsets.myopiaEmmetropia["40plus"]) < 0.1, "older myopes near zero");
assert.ok(snippet.sphereOffsets.higherHyperopia["40plus"] > 0, "hyperopes need more plus");
const cv = Object.fromEntries([...fit.stdout.matchAll(/^\s+(none|global|stratified)\s+([\d.]+) D/gm)].map(m => [m[1], Number(m[2])]));
assert.ok(cv.stratified < cv.global, "stratified beats global in cross-validation");

// Guard: refuses to fit while Cohort B (v0.2) data is open.
const openFile = path.join(tmp, "open.csv");
fs.writeFileSync(openFile, w.DioptraStorage.toShadowCSV(buildCases("shadow")));
const guarded = spawnSync(process.execPath, [path.join(root, "tools/fit-offsets.js"), openFile], { encoding: "utf8" });
assert.equal(guarded.status, 2);
const closed = spawnSync(process.execPath, [path.join(root, "tools/fit-offsets.js"), openFile, "--cohort-closed"], { encoding: "utf8" });
assert.equal(closed.status, 0, closed.stderr);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("PASS: export and offset fitting");
