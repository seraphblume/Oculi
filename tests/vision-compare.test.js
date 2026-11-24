#!/usr/bin/env node
// Genius vision comparison: the defocus each panel shows, before ZL Retina draws it.
const assert = require("node:assert/strict");
const V = require("../js/vision-compare.js");

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

// Hofstetter minimum amplitude: 15 − 0.25 × age, floored at zero.
close(V.accommodation(20), 10, "age 20");
close(V.accommodation(60), 0, "age 60");
close(V.accommodation(80), 0, "never negative");

// A −2.00 myope without glasses is 2 D out of focus at distance; accommodation cannot help.
let r = V.residual({ eye: { sphere: -2 }, lens: null, age: 30 });
close(r.m, -2, "myope at distance");
close(r.accommodationUsed, 0, "a myope cannot accommodate the blur away");
// Fully corrected, the same eye is in focus.
r = V.residual({ eye: { sphere: -2 }, lens: { sphere: -2 }, age: 30 });
close(r.m, 0, "corrected myope");

// A young +2.00 hyperope focuses through it at distance; at 60 the blur is all there.
r = V.residual({ eye: { sphere: 2 }, lens: null, age: 20 });
close(r.m, 0, "young hyperope accommodates");
close(r.accommodationUsed, 2, "using 2 D");
r = V.residual({ eye: { sphere: 2 }, lens: null, age: 60 });
close(r.m, 2, "presbyopic hyperope");

// Near at 40 cm for a corrected 60-year-old: blurred without an ADD, clear with +2.50.
r = V.residual({ eye: { sphere: 0 }, lens: { sphere: 0 }, vergence: 2.5, age: 60 });
close(r.m, 2.5, "presbyope at near without ADD");
r = V.residual({ eye: { sphere: 0 }, lens: { sphere: 0 }, add: 2.5, vergence: 2.5, age: 60 });
close(r.m, 0, "presbyope at near with ADD");

// Cylinder is never accommodated, and old glasses with the wrong axis leave astigmatism.
r = V.residual({ eye: { sphere: 0, cylinder: -1.5, axis: 90 }, lens: null, age: 10 });
close(Math.hypot(r.j0, r.j45), 0.75, "uncorrected cylinder stays");
r = V.residual({ eye: { sphere: 0, cylinder: -1, axis: 90 }, lens: { sphere: 0, cylinder: -1, axis: 180 }, age: 30 });
close(Math.hypot(r.j0, r.j45), 1, "axis 90° off doubles the residual");

// The chart runs 20/200 to 20/20 at 5′ per 20/20 letter.
assert.equal(V.LINES[0].distance, "20/200");
assert.equal(V.LINES.at(-1).arcmin, 5);
console.log("PASS: vision comparison defocus, accommodation and chart geometry");
