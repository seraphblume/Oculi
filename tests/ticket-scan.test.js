"use strict";

const assert = require("assert");
const scan = require("../js/ticket-scan.js");

const sample = `
------------0438------------
NAME                    M/F
24/JUL/2026 05:30 PM
VD=12.00mm
WD=40cm
<R>      S      C      A
 - 2.50  - 1.25 178 9
 - 2.50  - 1.25 177 9
 - 2.75  - 1.50 178 9
 <- 2.50 - 1.25 178>
<L>      S      C      A
 - 2.50  - 1.00 168 9
 - 2.75  - 1.00 168 9
 - 2.75  - 1.00 168 9
 <- 2.75 - 1.00 168>
PD 62                 N 58
`;

const p = scan.parseTicketText(sample);
assert.deepStrictEqual(p.od.selected, { sphere: -2.5, cylinder: -1.25, axis: 178 });
assert.deepStrictEqual(p.os.selected, { sphere: -2.75, cylinder: -1, axis: 168 });
assert.strictEqual(p.od.readings.length, 3);
assert.strictEqual(p.os.readings.length, 3);
assert.strictEqual(p.od.readings[2].cylinder, -1.5);
assert.strictEqual(p.od.readings[0].reliability, 9);
assert.strictEqual(p.instrument.vertexMm, 12);
assert.strictEqual(p.instrument.pdDistanceMm, 62);
assert.strictEqual(p.instrument.pdNearMm, 58);
assert.strictEqual(p.near.workingDistanceCm, 40);
assert.deepStrictEqual(p.warnings, []);

const fallback = scan.parseTicketText(`
<R> S C A
-1.00 -0.50 179 8
-1.00 -0.50 180 9
-1.25 -0.50 180 9
-1.00 -0.50 180
<L> S C A
+0.50 -0.25 90 9
+0.50 -0.25 90 9
+0.75 -0.25 91 8
+0.50 -0.25 90
PD 64 N 60
`);
assert.deepStrictEqual(fallback.od.selected, { sphere: -1, cylinder: -0.5, axis: 180 });
assert.deepStrictEqual(fallback.os.selected, { sphere: 0.5, cylinder: -0.25, axis: 90 });

console.log("ticket-scan: ok");

const plus = scan.parseRxLine("+1.00 +1.50 180 9");
assert.strictEqual(plus.sphere, 2.5);
assert.strictEqual(plus.cylinder, -1.5);
assert.strictEqual(plus.axis, 90);
assert.strictEqual(scan.parseRxLine("24/07/2026 05:30 PM"), null);
assert.strictEqual(scan.parseRxLine("PD 62 N 58"), null);
