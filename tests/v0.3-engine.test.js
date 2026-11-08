#!/usr/bin/env node
// v0.3 engine, scoring and engine-registry tests. All readings below are synthetic.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function load(overrides) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const file of ["js/vertex.js", "js/config.js", "js/algorithm.js", "js/config-v03.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  if (overrides) overrides(sandbox.window.DIOPTRA_V03_CONFIG);
  for (const file of ["js/engine-v03.js", "js/config-v10.js", "js/engine-v10.js", "js/scoring.js", "js/engines.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  return sandbox.window;
}

const EPS = 1e-9;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
let count = 0;
function test(name, fn) {
  fn();
  count++;
}

const w = load();
const e = w.DioptraEngineV03;
const s = w.DioptraScoring;
const cfg = w.DIOPTRA_V03_CONFIG;

const eye = (sphere, cylinder, axis, extra = {}) => ({ sphere, cylinder, axis, va: "", pinhole: "", ...extra });

test("default configuration is the active v0.3 candidate with unchanged prior offsets", () => {
  assert.equal(cfg.mode, "active");
  assert.equal(cfg.cohort, "v0.3-candidate-1");
  assert.equal(cfg.ui.finalAxisStep, 1);
  assert.equal(cfg.version, "0.3.0");
  for (const bands of Object.values(cfg.sphereOffsets)) {
    for (const v of Object.values(bands)) near(v, -0.25, EPS, "prior offset");
  }
  assert.equal(cfg.lowCylinder.dropAtOrBelow, null);
  assert.equal(w.DioptraEngines.primaryId(), "v1.0");
  assert.equal(w.DioptraEngines.shadowId(), "v0.3");
});

test("power vectors round-trip", () => {
  for (const rx of [
    { sphere: -2.5, cylinder: -1.25, axis: 178 },
    { sphere: 1.75, cylinder: -0.5, axis: 45 },
    { sphere: -6, cylinder: -3, axis: 90 },
    { sphere: 0.5, cylinder: -2, axis: 133 }
  ]) {
    const back = e.fromPowerVector(e.powerVector(rx));
    near(back.sphere, rx.sphere, 1e-9, "sphere");
    near(back.cylinder, rx.cylinder, 1e-9, "cylinder");
    near(e.axisDistance(back.axis, rx.axis), 0, 1e-9, "axis");
  }
});

test("plus-cylinder input is transposed to minus cylinder", () => {
  const t = e.toMinusCylinder({ sphere: -2, cylinder: 3, axis: 90 });
  assert.deepEqual({ ...t }, { sphere: 1, cylinder: -3, axis: 180 });
});

test("with only the selected line, sphere and cylinder match v0.2; axis keeps 1° precision", () => {
  const input = { age: 25, od: eye(-2.5, -1.25, 178), os: eye(-2.75, -1, 168) };
  const v02 = w.DioptraAlgorithm.predictCase(input);
  const v03 = e.predictCase(input);
  for (const k of ["od", "os"]) {
    assert.equal(v03[k].sphere, v02[k].sphere, `${k} sphere`);
    assert.equal(v03[k].cylinder, v02[k].cylinder, `${k} cylinder`);
  }
  assert.equal(v02.od.axis, 180);
  assert.equal(v03.od.axis, 178);
  assert.equal(v03.os.axis, 168);
  assert.ok(v03.od.flags.some(f => f.code === "AR_REPEATS_MISSING"));
  assert.ok(v03.flags.some(f => f.code === "VERTEX_ASSUMED"));
});

test("axis resolution follows cylinder power", () => {
  const p = e.predictCase({ age: 30, instrument: { vertexMm: 12 }, od: eye(-1, -0.5, 172), os: eye(-1, -1, 172) });
  assert.equal(p.od.axis, 170, "0.50 D cylinder rounds to 5°");
  assert.equal(p.od.axisStep, 5);
  assert.equal(p.os.axis, 172, "1.00 D cylinder keeps 1°");
  assert.equal(p.os.axisStep, 1);
});

test("repeat readings: median, most plus and repeatability evidence", () => {
  const input = {
    age: 25,
    instrument: { vertexMm: 12 },
    od: eye(-2.5, -1.25, 178, {
      readings: [
        { sphere: -2.5, cylinder: -1.25, axis: 178, reliability: 9 },
        { sphere: -2.5, cylinder: -1.25, axis: 177, reliability: 9 },
        { sphere: -2.75, cylinder: -1.5, axis: 178, reliability: 9 }
      ]
    }),
    os: eye(-2.75, -1, 168, {
      readings: [
        { sphere: -2.5, cylinder: -1, axis: 168 },
        { sphere: -2.75, cylinder: -1, axis: 168 },
        { sphere: -2.75, cylinder: -1, axis: 168 }
      ]
    })
  };
  const p = e.predictCase(input);
  near(p.od.evidence.mRange, 0.375, 1e-9, "OD M range");
  near(p.os.evidence.mRange, 0.25, 1e-9, "OS M range");
  assert.equal(p.od.evidence.readings, 3);
  assert.deepEqual(p.od.evidence.reliability, [9, 9, 9]);
  assert.equal(p.od.estimator, "median");
  assert.deepEqual({ ...p.os.candidates.median }, { sphere: -3, cylinder: -1, axis: 168, sphericalEquivalent: -3.5 });
  assert.deepEqual({ ...p.os.candidates.mostPlus }, { sphere: -2.75, cylinder: -1, axis: 168, sphericalEquivalent: -3.25 });
  assert.equal(p.status, "supported");
  assert.equal(p.od.flags.length, 0);
});

test("unstable readings raise review flags without changing dioptric logic", () => {
  const p = e.predictCase({
    age: 22,
    instrument: { vertexMm: 12 },
    od: eye(-2, -0.5, 90, {
      readings: [
        { sphere: -1.5, cylinder: -0.5, axis: 90 },
        { sphere: -2.5, cylinder: -0.5, axis: 90 },
        { sphere: -2.25, cylinder: -1.5, axis: 45 }
      ]
    }),
    os: eye(-2, -0.5, 90)
  });
  const codes = p.od.flags.map(f => f.code);
  assert.ok(codes.includes("AR_REPEATABILITY_LOW"), codes.join());
  assert.ok(codes.includes("AR_ASTIGMATISM_UNSTABLE"), codes.join());
  assert.equal(p.status, "review");
});

test("vertex conversion works per principal meridian", () => {
  assert.equal(e.convertVertex, w.DioptraVertex.convertVertex, "engine uses shared calculator optics");
  near(e.effectivePower(-8, 0, 12), -8.8496, 1e-3, "corneal -8.00 at 12 mm");
  near(e.effectivePower(-10, 12, 0), -8.9286, 1e-3, "spectacle -10.00 at the cornea");
  const rx = e.convertVertex({ sphere: -6, cylinder: -2, axis: 180 }, 0, 12);
  near(rx.sphere, e.effectivePower(-6, 0, 12), 1e-9, "axis meridian");
  near(rx.sphere + rx.cylinder, e.effectivePower(-8, 0, 12), 1e-9, "perpendicular meridian");
  const p = e.predictCase({ age: 30, instrument: { vertexMm: 0 }, od: eye(-8, 0, 180), os: eye(-8, 0, 180) });
  assert.equal(p.od.sphere, -9, "-8.85 at spectacle plane, then -0.25 offset, rounds to -9.00");
  assert.ok(p.od.flags.some(f => f.code === "VERTEX_CONVERTED"));
});

test("ADD classifies refractive state from the raw reading, not the offset prediction", () => {
  const input = { age: 50, od: eye(2.25, 0, 180), os: eye(2.25, 0, 180) };
  assert.equal(w.DioptraAlgorithm.predictCase(input).tentativeAdd, 1.75, "v0.2 behaviour (frozen)");
  assert.equal(e.predictCase(input).tentativeAdd, 2.25, "v0.3 uses higher-hyperopia row");
});

test("ADD adjusts for the patient's working distance and reports an amplitude estimate", () => {
  const base = { age: 52, od: eye(-1, 0, 180), os: eye(-1, 0, 180) };
  assert.equal(e.predictCase(base).tentativeAdd, 1.25);
  const p = e.predictCase({ ...base, near: { workingDistanceCm: 33, nearPointCm: 50 } });
  assert.equal(p.tentativeAdd, 1.75, "33 cm needs about +0.50 more than 40 cm");
  assert.equal(p.add.estimates.amplitudeBased, 2, "3.03 D demand - half of 2.00 D amplitude");
  assert.equal(e.predictCase({ age: 30, near: { workingDistanceCm: 25 }, od: eye(-1, 0, 180), os: eye(-1, 0, 180) }).tentativeAdd, 0,
    "no ADD is created for a non-presbyopic age");
});

test("simplified Javal estimate and keratometry disagreement flag", () => {
  const j = e.javalEstimate({ k1D: 42, k1Axis: 180, k2D: 43.5, k2Axis: 90 });
  near(j.cornealCylinder, 1.5, 1e-9, "corneal cylinder");
  assert.equal(j.cornealOrientation, "withTheRule");
  near(j.predictedCylinder, -1, 1e-9, "with the rule: 1.50 - 0.50");
  assert.equal(j.predictedAxis, 180);
  const atr = e.javalEstimate({ k1D: 43.5, k1Axis: 180, k2D: 42.5, k2Axis: 90 });
  near(atr.predictedCylinder, -1.5, 1e-9, "against the rule: 1.00 + 0.50");
  assert.equal(atr.predictedAxis, 90);

  const k = { k1D: 42, k1Axis: 180, k2D: 43.5, k2Axis: 90 };
  const agree = e.predictCase({ age: 30, instrument: { vertexMm: 12 }, od: eye(-1, -1, 180, { keratometry: k }), os: eye(-1, -1, 180) });
  assert.ok(!agree.od.flags.some(f => f.code === "KERATOMETRY_DISAGREEMENT"));
  const disagree = e.predictCase({ age: 30, instrument: { vertexMm: 12 }, od: eye(-1, -2.5, 90, { keratometry: k }), os: eye(-1, -1, 180) });
  assert.ok(disagree.od.flags.some(f => f.code === "KERATOMETRY_DISAGREEMENT"));
});

test("astigmatism orientation and ametropia labels", () => {
  assert.equal(e.astigmatismOrientation(-1, 178), "withTheRule");
  assert.equal(e.astigmatismOrientation(-1, 95), "againstTheRule");
  assert.equal(e.astigmatismOrientation(-1, 45), "oblique");
  assert.equal(e.astigmatismOrientation(0, 45), "none");
  assert.equal(e.classifyAmetropia(-2.5, -1.25), "compoundMyopicAstigmatism");
  assert.equal(e.classifyAmetropia(0, -1), "simpleMyopicAstigmatism");
  assert.equal(e.classifyAmetropia(2, -2), "simpleHyperopicAstigmatism");
  assert.equal(e.classifyAmetropia(2, -1), "compoundHyperopicAstigmatism");
  assert.equal(e.classifyAmetropia(1, -2), "mixedAstigmatism");
  assert.equal(e.classifyAmetropia(-1, 0), "myopia");
});

test("pinhole without improvement is flagged, never used as a dioptric rule", () => {
  const a = e.predictCase({ age: 30, od: eye(-1, 0, 180, { va: "20/60", pinhole: "20/60" }), os: eye(-1, 0, 180) });
  const b = e.predictCase({ age: 30, od: eye(-1, 0, 180, { va: "20/60", pinhole: "20/25" }), os: eye(-1, 0, 180) });
  assert.ok(a.od.flags.some(f => f.code === "PINHOLE_LIMITED_GAIN"));
  assert.ok(!b.od.flags.some(f => f.code === "PINHOLE_LIMITED_GAIN"));
  assert.equal(a.od.sphere, b.od.sphere);
});

test("rounding preserves spherical equivalent and breaks ties toward plus", () => {
  const p = e.predictCase({ age: 30, instrument: { vertexMm: 12 }, od: eye(0.37, -0.37, 91), os: eye(-0.12, -0.62, 44) });
  for (const k of ["od", "os"]) {
    const exactM = p[k].raw.sphericalEquivalent - 0.25;
    near(p[k].sphericalEquivalent, exactM, 0.125 + EPS, `${k} SE within half a step`);
    assert.ok(Number.isInteger(p[k].sphere * 4), `${k} sphere on 0.25 grid`);
    assert.ok(Number.isInteger(p[k].cylinder * 4), `${k} cylinder on 0.25 grid`);
  }
  assert.equal(e.roundToStep(-1.375, 0.25), -1.25);
  assert.equal(e.roundToStep(-1.125, 0.25), -1);
});

test("stratified offsets and the cap are applied in M", () => {
  const w2 = load(c => {
    c.sphereOffsets.myopiaEmmetropia.under40 = -0.5;
    c.sphereOffsets.higherHyperopia["40plus"] = 0.9;
  });
  const p = w2.DioptraEngineV03.predictCase({ age: 25, instrument: { vertexMm: 12 }, od: eye(-3, 0, 180), os: eye(-3, 0, 180) });
  assert.equal(p.od.sphere, -3.5);
  assert.equal(p.od.stratum.refractiveState, "myopiaEmmetropia");
  assert.equal(p.od.stratum.ageBand, "under40");
  const q = w2.DioptraEngineV03.predictCase({ age: 55, instrument: { vertexMm: 12 }, od: eye(3, 0, 180), os: eye(3, 0, 180) });
  assert.equal(q.od.sphere, 3.5, "0.9 is clamped to the 0.50 cap");
  assert.ok(q.od.flags.some(f => f.code === "OFFSET_CLAMPED"));
});

test("optional low-cylinder rule moves half the cylinder into the sphere", () => {
  const w3 = load(c => { c.lowCylinder.dropAtOrBelow = 0.25; });
  const p = w3.DioptraEngineV03.predictCase({ age: 30, instrument: { vertexMm: 12 }, od: eye(-1, -0.25, 90), os: eye(-1, -0.5, 90) });
  assert.equal(p.od.cylinder, 0);
  assert.equal(p.od.sphere, -1.25, "M -1.125 - 0.25 = -1.375, tie rounds toward plus");
  assert.equal(p.os.cylinder, -0.5, "0.50 D is above the threshold");
});

test("incomplete autorefractor data abstains", () => {
  assert.throws(() => e.predictCase({ age: 30, od: { sphere: -1, cylinder: null, axis: 90 }, os: eye(-1, 0, 180) }), /Incomplete/);
});

test("ANSI-style axis tolerance and cylinder-aware scoring", () => {
  assert.equal(s.axisTolerance(0.25), 14);
  assert.equal(s.axisTolerance(0.5), 7);
  assert.equal(s.axisTolerance(0.75), 5);
  assert.equal(s.axisTolerance(1.5), 3);
  assert.equal(s.axisTolerance(1.75), 2);
  assert.equal(s.axisTolerance(0), null);

  const hi = s.scoreEye({ sphere: -2, cylinder: -2, axis: 175 }, { sphere: -2, cylinder: -2, axis: 178 });
  assert.equal(hi.axisWithinTolerance, false, "3° is outside ±2° at 2.00 D");
  assert.equal(hi.clinicalMatch, false);
  const lo = s.scoreEye({ sphere: -2, cylinder: -0.5, axis: 175 }, { sphere: -2, cylinder: -0.5, axis: 180 });
  assert.equal(lo.axisWithinTolerance, true, "5° is inside ±7° at 0.50 D");
  const plano = s.scoreEye({ sphere: -2, cylinder: 0, axis: 180 }, { sphere: -2, cylinder: 0, axis: 90 });
  assert.equal(plano.axisApplicable, false);
  assert.equal(plano.axisWithinTolerance, null);
  assert.equal(plano.clinicalMatch, true);
  near(plano.vectorErrorMagnitude, 0, EPS, "identical spheres");

  const sum = s.summarize([hi, lo, plano]);
  assert.equal(sum.eyes, 3);
  assert.equal(sum.axisEyes, 2);
  near(sum.axisWithinToleranceRate, 0.5, EPS, "axis rate");
});

test("engine registry promotes v1.0 Beryl with v0.3 as comparator and no v0.2 execution", () => {
  const run = w.DioptraEngines.run({ age: 30, od: eye(-1, -0.5, 90), os: eye(-1, -0.5, 90) });
  assert.equal(run.primary.id, "v1.0");
  assert.equal(run.primary.prediction.version, "1.0.0");
  assert.equal(run.shadow.id, "v0.3");
  assert.equal(run.shadow.prediction.version, "0.3.0");

  const historical = load(c => { c.mode = "shadow"; });
  const run2 = historical.DioptraEngines.run({ age: 30, od: eye(-1, -0.5, 90), os: eye(-1, -0.5, 90) });
  assert.equal(run2.primary.id, "v1.0");
  assert.equal(run2.shadow.id, "v0.3");
  assert.equal(historical.DioptraEngines.ENGINES["v0.2"], undefined);
});

test("a v0.3 shadow failure never substitutes for or blocks the active engine", () => {
  const isolated = load();
  isolated.DioptraEngineV03.predictCase = () => { throw new Error("Synthetic shadow failure"); };
  const run = isolated.DioptraEngines.run({ age: 30, od: eye(-1, -1, 178), os: eye(-1, -1, 168) });
  assert.equal(run.primary.prediction.od.axis, 178);
  assert.equal(run.shadow.prediction, null);
  assert.equal(run.shadow.error, "Synthetic shadow failure");
});

test("v0.2 predictions are identical with and without the extra v0.3 inputs", () => {
  const plain = { age: 47, od: eye(-1.25, -0.75, 12), os: eye(0.5, -1.5, 95) };
  const rich = {
    ...plain,
    instrument: { vertexMm: 0 },
    near: { workingDistanceCm: 30 },
    od: { ...plain.od, readings: [{ sphere: -3, cylinder: -2, axis: 40 }] },
    os: { ...plain.os, keratometry: { k1D: 40, k1Axis: 10, k2D: 46, k2Axis: 100 } }
  };
  const a = w.DioptraAlgorithm.predictCase(plain);
  const b = w.DioptraAlgorithm.predictCase(rich);
  for (const k of ["od", "os"]) {
    assert.equal(a[k].sphere, b[k].sphere);
    assert.equal(a[k].cylinder, b[k].cylinder);
    assert.equal(a[k].axis, b[k].axis);
  }
  assert.equal(a.tentativeAdd, b.tentativeAdd);
});

console.log(`PASS: v0.3 engine and scoring (${count} tests)`);
