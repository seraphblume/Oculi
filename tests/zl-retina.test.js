#!/usr/bin/env node
// ZL Retina port: numerical parity with the Python zl_retina 0.1.0 package.
// The fixture was produced by running the package itself (see docs/zl-retina.md).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const R = require("../js/zl-retina.js");

const ref = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/zl-retina-reference.json"), "utf8"));
const flat = ref.image.flat(2);
const image = { width: ref.image[0].length, height: ref.image.length, data: Uint8Array.from(flat) };

const maxDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);

for (const c of ref.cases) {
  const [sphere, cylinder, axis] = c.rx;
  const k = c.kw;
  const psf = R.retinalPsf({ sphere, cylinder, axis }, {
    pupilMm: k.pupil_mm,
    arcminPerPixel: k.arcmin_per_pixel ?? null,
    pupilSamples: k.pupil_samples,
    maxSamples: k.max_samples,
    viewingM: k.viewing_m ?? Infinity,
    higherOrderUm: k.higher_order_um ?? [0, 0, 0],
    chromaticDiopters: k.chromatic_diopters ?? null
  });
  const label = `Rx ${c.rx.join("/")}`;
  assert.equal(psf.side, c.side, `${label} kernel side`);
  assert.equal(psf.pupilSamples, c.samples, `${label} pupil sampling`);
  assert.ok(Math.abs(psf.arcminPerPixel - c.arcmin) < 1e-9, `${label} pitch`);
  for (let ch = 0; ch < 3; ch++) {
    const sum = psf.kernels[ch].reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-12, `${label} unit energy`);
    assert.ok(maxDiff(psf.kernels[ch], c.kernels[ch]) < 1e-9, `${label} kernel ${ch} matches Python`);
  }
  const sim = R.simulateRetina(image, psf);
  assert.ok(maxDiff(sim, c.sim) < 1e-5, `${label} simulated image matches Python`);
}

// No correction needed means no defocus blur: the kernel is the diffraction-limited Airy core.
const sharp = R.retinalPsf({}, { pupilMm: 3, arcminPerPixel: 1, chromaticDiopters: [0, 0, 0], pupilSamples: 32, maxSamples: 64 });
const blurred = R.retinalPsf({ sphere: -2 }, { pupilMm: 3, arcminPerPixel: 1, chromaticDiopters: [0, 0, 0], pupilSamples: 32, maxSamples: 256 });
const centre = p => p.kernels[1][((p.side - 1) / 2) * p.side + (p.side - 1) / 2];
assert.ok(centre(sharp) > 10 * centre(blurred), "defocus spreads the light");

// Cylinder blurs along its power meridian: axis 180 minus cylinder smears vertically.
const cyl = R.retinalPsf({ cylinder: -2, axis: 180 }, { pupilMm: 4, arcminPerPixel: 1, chromaticDiopters: [0, 0, 0], maxSamples: 256 });
const s = cyl.side, c0 = (s - 1) / 2, kk = cyl.kernels[1];
let vertical = 0, horizontal = 0;
for (let d = -c0; d <= c0; d++) { vertical += kk[(c0 + d) * s + c0] * d * d; horizontal += kk[c0 * s + c0 + d] * d * d; }
assert.ok(vertical > 4 * horizontal, "axis convention: 180° minus cylinder blurs vertically");

// Power-vector round trip in minus-cylinder notation.
for (const rx of [{ sphere: -2, cylinder: -1, axis: 35 }, { sphere: 1.5, cylinder: -0.75, axis: 180 }, { sphere: 0.25, cylinder: -2.5, axis: 90 }]) {
  const back = R.fromPowerVectors(R.powerVectors(rx));
  assert.ok(Math.abs(back.sphere - rx.sphere) < 1e-9 && Math.abs(back.cylinder - rx.cylinder) < 1e-9 && Math.abs(back.axis - rx.axis) < 1e-9, `round trip ${rx.axis}`);
}

// Cropping keeps unit energy and stays centred.
const cropped = R.cropPsf(blurred, 1e-4);
assert.ok(cropped.side <= blurred.side && cropped.side % 2 === 1);
assert.ok(Math.abs(cropped.kernels[1].reduce((a, b) => a + b, 0) - 1) < 1e-12);

assert.ok(Math.abs(R.lightAdaptedPupil(120, 400) - ref.pupil) < 1e-12, "Stanley–Davies pupil");
assert.throws(() => R.retinalPsf({ sphere: -12 }, { pupilMm: 6, pupilSamples: 32, maxSamples: 64 }), /Nyquist/);
assert.throws(() => R.retinalPsf({ sphere: NaN }), RangeError);

console.log(`PASS: ZL Retina port matches zl_retina 0.1.0 on ${ref.cases.length} reference cases`);
