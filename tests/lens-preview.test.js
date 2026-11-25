// Frame/Lens Preview: frame shapes, base curves, power through the edged lens, fringing.
const assert = require("assert");
const T = require("../js/zl-thickness.js");
const L = require("../js/lens-preview.js");

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

// Frame shapes fill exactly the A × B box.
for (const shape of Object.keys(L.SHAPES)) {
  const r = L.frameRadii(shape, 52, 38);
  assert.strictEqual(r.length, 360);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  r.forEach((v, d) => {
    const x = v * Math.cos((d * Math.PI) / 180), y = v * Math.sin((d * Math.PI) / 180);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  near(maxX - minX, 52, 0.3, `${shape} width`);
  near(maxY - minY, 38, 0.3, `${shape} height`);
}
const round = L.frameRadii("round", 46, 46);
assert.ok(Math.max(...round) - Math.min(...round) < 0.05, "a round frame has one radius");
assert.throws(() => L.frameRadii("hexagon", 52, 38), RangeError);
assert.throws(() => L.frameRadii("oval", 90, 38), RangeError);

// Vogel's rule, to the nearest stocked base.
assert.strictEqual(L.baseCurve({ sphere: -2, cylinder: 0 }), 5);
assert.strictEqual(L.baseCurve({ sphere: -6, cylinder: -1.5 }), 3);
assert.strictEqual(L.baseCurve({ sphere: 3, cylinder: 0 }), 8);
assert.strictEqual(L.baseCurve({ sphere: 0, cylinder: 0 }), 6);
assert.strictEqual(L.baseCurve({ sphere: -14, cylinder: 0 }), 0.5);

// OS mirrors the TABO axis into the nasal lens frame.
assert.strictEqual(L.lensAxis(30, "od"), 30);
assert.strictEqual(L.lensAxis(30, "os"), 150);
assert.strictEqual(L.lensAxis(180, "os"), 0);

const frame = { shape: "rectangle", a: 52, b: 38, dbl: 18, pd: 31 };

// The back surface gives the prescribed back-vertex power through the actual centre.
function bvp(p, meridianDeg) {
  const n = p.material.index, t = p.mesh.centerMm / 1000;
  const front = p.base / (1 - (t / n) * p.base);
  const th = (meridianDeg * Math.PI) / 180;
  const h = 1e-3, c = Math.cos(th), s = Math.sin(th);
  const sagBack = (x, y) => T.sag(T.surface(...backPowers(p)), x, y, n)[0];
  const k = (2 * sagBack(h * c, h * s)) / (h * h); // curvature, 1/mm
  return front - 1000 * (n - 1) * k;
}
function backPowers(p) {
  const n = p.material.index, t = p.mesh.centerMm / 1000;
  const eff = p.base / (1 - (t / n) * p.base);
  return [-(p.rx.sphere - eff), -((p.rx.sphere + p.rx.cylinder) - eff), L.lensAxis(p.rx.axis, p.eye)];
}
for (const [rx, eye] of [[{ sphere: -4, cylinder: -1.25, axis: 20 }, "od"], [{ sphere: 3.5, cylinder: -0.75, axis: 100 }, "os"], [{ sphere: -0.5, cylinder: 0, axis: 0 }, "od"]]) {
  const p = L.preview(rx, frame, eye);
  const axis = L.lensAxis(rx.axis, eye);
  near(bvp(p, axis), rx.sphere, 0.01, `${JSON.stringify(rx)} power along the axis`);
  near(bvp(p, axis + 90), rx.sphere + rx.cylinder, 0.01, `${JSON.stringify(rx)} power across the axis`);
}

// Minus lenses: thin centre, thick edge, thickest temporally (the optical centre sits nasal of
// the boxing centre). Plus lenses: thick centre, a 1.0 mm edge.
const minus = L.preview({ sphere: -4, cylinder: 0, axis: 0 }, frame, "od");
near(minus.mesh.centerMm, 1.0, 1e-9, "minus lens holds the minimum centre");
assert.ok(minus.thickest.mm > 4 && minus.thickest.mm < 7, `−4.00 edge ${minus.thickest.mm}`);
assert.ok(/temporal/.test(minus.thickest.where), `thickest at ${minus.thickest.where}`);
const plus = L.preview({ sphere: 4, cylinder: 0, axis: 0 }, frame, "od");
near(plus.thinnest.mm, 1.0, 1e-6, "plus lens holds the minimum edge");
assert.ok(plus.mesh.centerMm > 3.5 && plus.mesh.centerMm < 6, `+4.00 centre ${plus.mesh.centerMm}`);

// Stronger Rx: heavier lens, thicker edge.
const strong = L.preview({ sphere: -8, cylinder: 0, axis: 0 }, frame, "od");
assert.ok(strong.thickest.mm > minus.thickest.mm && strong.mesh.massG > minus.mesh.massG);

// OD and OS mirror each other.
const os = L.preview({ sphere: -4, cylinder: 0, axis: 0 }, frame, "os");
near(os.thickest.mm, minus.thickest.mm, 1e-9, "OD/OS mirror");

// Transverse chromatic aberration: Prentice ÷ Abbe.
near(minus.fringe.at10mm, (4 * 1) / 30, 1e-12, "−4.00 at 10 mm");
near(L.preview({ sphere: -1, cylinder: -2, axis: 90 }, frame, "od").fringe.at10mm, 3 / 30, 1e-12, "strongest meridian");
assert.ok(minus.fringe.atRim > minus.fringe.at10mm);
assert.strictEqual(L.preview({ sphere: 0, cylinder: 0, axis: 0 }, frame, "od").fringe.atRim, 0);

// Fitting height moves the optical centre; out-of-range fits are refused.
const high = L.preview({ sphere: -4, cylinder: 0, axis: 0 }, { ...frame, fittingHeight: 24 }, "od");
near(high.decentration[1], 5, 1e-12, "fitting height 24 in a 38 mm B");
assert.throws(() => L.preview({ sphere: -4, cylinder: 0, axis: 0 }, { ...frame, pd: 60 }, "od"), RangeError);
assert.throws(() => L.preview({ sphere: -4, cylinder: 0, axis: 0 }, { ...frame, fittingHeight: 37 }, "od"), RangeError);

console.log("PASS: Frame/Lens Preview shapes, base curves, back-vertex power, thickness and fringing");
