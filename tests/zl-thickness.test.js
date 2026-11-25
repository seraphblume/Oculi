#!/usr/bin/env node
// ZL Thickness port: parity with the Python zl_thickness 0.3.0 package on six reference lenses
// (minus, plus, toric, aspheric, prism thinning by rule and by equalise, a carrier case).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const T = require("../js/zl-thickness.js");

const ref = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/zl-thickness-reference.json"), "utf8"));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

ref.cases.forEach((c, n) => {
  const k = c.kw;
  const mesh = T.lensMesh(c.radii, T.surface(...c.front), T.surface(...c.back), {
    index: k.index ?? 1.6, density: k.density ?? 1.3, decentration: k.decentration ?? [0, 0],
    minCenterMm: k.min_center_mm ?? 1.5, minEdgeMm: k.min_edge_mm ?? 1.0, addD: k.add_d ?? 0, thinning: k.thinning ?? "rule"
  });
  close(mesh.centerMm, c.center, 1e-12, `case ${n} centre`);
  close(mesh.thinningPrism, c.prism, 1e-12, `case ${n} prism`);
  c.edge.forEach((e, i) => close(mesh.edgeMm[i], e, 1e-12, `case ${n} rim ${i}°`));
  close(mesh.volumeMm3, c.volume, 1e-10, `case ${n} volume`);
  close(mesh.massG, c.mass, 1e-10, `case ${n} mass`);
  assert.equal(mesh.carrierUsed, c.carrier, `case ${n} carrier`);
});
assert.deepEqual(T.boxingOffset(54, 17, 40, 31.5, 22), ref.box);
assert.throws(() => T.lensMesh(new Array(359).fill(20), T.surface(4, 4), T.surface(6, 6)), /360 positive radii/);
assert.throws(() => T.boxingOffset(50, -1, 40, 30, 20), /boxing/);
console.log(`PASS: ZL Thickness port matches zl_thickness 0.3.0 on ${ref.cases.length} reference lenses`);
