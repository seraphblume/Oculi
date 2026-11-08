// Project Dioptra — cylinder-aware scoring.
//
// Evaluation only: nothing here changes a prediction. The v0.2 comparison fields
// (algorithm.js compareEye) are still produced unchanged for the study CSV; this module
// adds power-vector errors and an axis tolerance that scales with cylinder power.
(function () {
  const EPS = 1e-9;

  // Axis tolerance by cylinder power, following the ANSI Z80.1 schedule for spectacle lenses.
  const AXIS_TOLERANCE = [
    { maxCylinder: 0.25, degrees: 14 },
    { maxCylinder: 0.50, degrees: 7 },
    { maxCylinder: 0.75, degrees: 5 },
    { maxCylinder: 1.50, degrees: 3 },
    { maxCylinder: Infinity, degrees: 2 }
  ];

  function normalizeAxis(axis) {
    let a = Number(axis);
    if (!Number.isFinite(a)) return null;
    a = ((a % 180) + 180) % 180;
    return a === 0 ? 180 : a;
  }

  function axisDistance(a1, a2) {
    const x = normalizeAxis(a1);
    const y = normalizeAxis(a2);
    if (x == null || y == null) return null;
    const d = Math.abs(x - y);
    return Math.min(d, 180 - d);
  }

  // Clinicians commonly record axis in 5° steps. Reported alongside the lens-tolerance rule,
  // never instead of it, so recording resolution is not mistaken for prediction error.
  const AXIS_RECORDING_FLOOR = 5;

  function axisTolerance(cylinder) {
    const c = Math.abs(Number(cylinder));
    if (!Number.isFinite(c) || c < EPS) return null;
    return AXIS_TOLERANCE.find(row => c <= row.maxCylinder + EPS).degrees;
  }

  function minusCylinder(rx) {
    const s = Number(rx.sphere), c = Number(rx.cylinder), a = Number(rx.axis);
    if (c > 0) return { sphere: s + c, cylinder: -c, axis: normalizeAxis(a + 90) };
    return { sphere: s, cylinder: c, axis: normalizeAxis(a) };
  }

  function powerVector(rx) {
    const r = (2 * (rx.axis || 180) * Math.PI) / 180;
    return {
      M: rx.sphere + rx.cylinder / 2,
      J0: (-rx.cylinder / 2) * Math.cos(r),
      J45: (-rx.cylinder / 2) * Math.sin(r)
    };
  }

  function scoreEye(prediction, actual) {
    const p = minusCylinder(prediction);
    const a = minusCylinder(actual);
    const pv = powerVector(p);
    const av = powerVector(a);

    const sphereError = a.sphere - p.sphere;
    const cylinderError = a.cylinder - p.cylinder;
    const bothCylinders = Math.abs(p.cylinder) > EPS && Math.abs(a.cylinder) > EPS;
    const axisError = bothCylinders ? axisDistance(p.axis, a.axis) : null;
    const tolerance = bothCylinders ? axisTolerance(a.cylinder) : null;
    const axisWithinTolerance = bothCylinders ? axisError <= tolerance + EPS : null;
    const axisWithinFloor = bothCylinders ? axisError <= Math.max(tolerance, AXIS_RECORDING_FLOOR) + EPS : null;

    const dM = av.M - pv.M;
    const dJ0 = av.J0 - pv.J0;
    const dJ45 = av.J45 - pv.J45;

    const within025Sphere = Math.abs(sphereError) <= 0.25 + EPS;
    const within025Cylinder = Math.abs(cylinderError) <= 0.25 + EPS;

    return {
      sphereError,
      cylinderError,
      axisError,
      axisTolerance: tolerance,
      axisApplicable: bothCylinders,
      axisWithinTolerance,
      axisWithinFloor,
      seError: dM,
      vectorError: { M: dM, J0: dJ0, J45: dJ45 },
      vectorErrorMagnitude: Math.hypot(dM, dJ0, dJ45),
      astigmaticError: 2 * Math.hypot(dJ0, dJ45),
      within025Sphere,
      within025Cylinder,
      within025SE: Math.abs(dM) <= 0.25 + EPS,
      clinicalMatch: within025Sphere && within025Cylinder && axisWithinTolerance !== false,
      clinicalMatchFloor: within025Sphere && within025Cylinder && axisWithinFloor !== false
    };
  }

  function rate(items, predicate) {
    if (!items.length) return null;
    return items.filter(predicate).length / items.length;
  }

  function mean(values) {
    return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  }

  function summarize(scores) {
    const eyes = scores.filter(Boolean);
    const axisEyes = eyes.filter(s => s.axisApplicable);
    return {
      eyes: eyes.length,
      clinicalMatchRate: rate(eyes, s => s.clinicalMatch),
      clinicalMatchFloorRate: rate(eyes, s => s.clinicalMatchFloor),
      sphereWithin025Rate: rate(eyes, s => s.within025Sphere),
      cylinderWithin025Rate: rate(eyes, s => s.within025Cylinder),
      seWithin025Rate: rate(eyes, s => s.within025SE),
      axisWithinToleranceRate: rate(axisEyes, s => s.axisWithinTolerance),
      axisWithinFloorRate: rate(axisEyes, s => s.axisWithinFloor),
      axisEyes: axisEyes.length,
      meanSEBias: mean(eyes.map(s => s.seError)),
      meanAbsSEError: mean(eyes.map(s => Math.abs(s.seError))),
      meanVectorError: mean(eyes.map(s => s.vectorErrorMagnitude))
    };
  }

  // A transparent post-exam tolerance count, NOT calibrated clinical confidence.
  function agreementCase(prediction, actual) {
    const eyes = ["od", "os"];
    if (eyes.some(eye => [prediction && prediction[eye], actual && actual[eye]].some(rx =>
      !rx || ![rx.sphere, rx.cylinder, rx.axis].every(Number.isFinite)))) return null;
    const checks = [];
    for (const eye of eyes) {
      const s = scoreEye(prediction[eye], actual[eye]);
      checks.push({ eye, component: "sphere", difference: s.sphereError, tolerance: 0.25, pass: s.within025Sphere });
      checks.push({ eye, component: "cylinder", difference: s.cylinderError, tolerance: 0.25, pass: s.within025Cylinder });
      if (s.axisApplicable) checks.push({ eye, component: "axis", difference: s.axisError, tolerance: s.axisTolerance, pass: s.axisWithinTolerance });
    }
    const passed = checks.filter(c => c.pass).length;
    return { version: "rx-agreement-1", percent: Math.round(100 * passed / checks.length), passed, total: checks.length, checks };
  }

  window.DioptraScoring = { AXIS_TOLERANCE, AXIS_RECORDING_FLOOR, axisTolerance, axisDistance, scoreEye, summarize, agreementCase };
})();
