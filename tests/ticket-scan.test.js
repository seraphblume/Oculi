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
assert.deepStrictEqual(p.od.readings, [
  { sphere: -2.5, cylinder: -1.25, axis: 178, reliability: 9 },
  { sphere: -2.5, cylinder: -1.25, axis: 177, reliability: 9 },
  { sphere: -2.75, cylinder: -1.5, axis: 178, reliability: 9 }
]);
assert.deepStrictEqual(p.os.readings, [
  { sphere: -2.5, cylinder: -1, axis: 168, reliability: 9 },
  { sphere: -2.75, cylinder: -1, axis: 168, reliability: 9 },
  { sphere: -2.75, cylinder: -1, axis: 168, reliability: 9 }
]);
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

const plus = scan.parseRxLine("+1.00 +1.50 180 9");
assert.strictEqual(plus.sphere, 2.5);
assert.strictEqual(plus.cylinder, -1.5);
assert.strictEqual(plus.axis, 90);
assert.strictEqual(scan.parseRxLine("24/07/2026 05:30 PM"), null);
assert.strictEqual(scan.parseRxLine("PD 62 N 58"), null);

const rawPhotoOcr = scan.parseTicketText(`
[ieee 025 unm
NAME M/F
24/JUL/2026 05:30 PM
VD=12. 00mm
WD=40cm
/ RS . A
i -250-1.25178 9
/ - 250 - 1.25177 9
/ -2.75- 1.50178 9
<- 2.50 - 1.25 178>
= i I~. )
Ay 8 c 2
A - 2.50 - 1.00 168 9
- 275 - 1.00 168 9
Gig] -275-1.00168 9
i is, dir <- 2.75 - 1.00 _168>
`);
assert.deepStrictEqual(rawPhotoOcr.od.selected, { sphere: -2.5, cylinder: -1.25, axis: 178 });
assert.deepStrictEqual(rawPhotoOcr.os.selected, { sphere: -2.75, cylinder: -1, axis: 168 });
assert.strictEqual(rawPhotoOcr.od.readings.length, 3);
assert.strictEqual(rawPhotoOcr.os.readings.length, 3);
assert.match(rawPhotoOcr.warnings[0], /inferred/);

const thresholdPhotoOcr = scan.parseTicketText(`
<R> S C A
- 2.50 -1.25178 9
-2.50-1.25177 9
-2.75-1.50178 9
<- 2.50 - 1.25 _178>
LD S C A
- 2.50 - 1.00 168 9
- 2.75 - 1.00 168 9
-9275-1.00 168 9
<- 2.75 - 1.00 _168>
PD62
`);
assert.deepStrictEqual(thresholdPhotoOcr.od.selected, { sphere: -2.5, cylinder: -1.25, axis: 178 });
assert.deepStrictEqual(thresholdPhotoOcr.os.selected, { sphere: -2.75, cylinder: -1, axis: 168 });
assert.strictEqual(thresholdPhotoOcr.od.readings.length, 3);
assert.strictEqual(thresholdPhotoOcr.os.readings.length, 2);
assert.strictEqual(thresholdPhotoOcr.instrument.pdDistanceMm, 62);

const mergedPhotoOcr = scan.mergeParsedTickets(thresholdPhotoOcr, rawPhotoOcr);
assert.deepStrictEqual(mergedPhotoOcr.od.selected, { sphere: -2.5, cylinder: -1.25, axis: 178 });
assert.deepStrictEqual(mergedPhotoOcr.os.selected, { sphere: -2.75, cylinder: -1, axis: 168 });
assert.strictEqual(mergedPhotoOcr.od.readings.length, 3);
assert.strictEqual(mergedPhotoOcr.os.readings.length, 3);
assert.strictEqual(mergedPhotoOcr.instrument.pdDistanceMm, 62);
assert.strictEqual(mergedPhotoOcr.instrument.pdNearMm, null);
assert.deepStrictEqual(mergedPhotoOcr.warnings, ["Near PD not recognized"]);

const recoveredPd = scan.parseTicketText("PD 7\nPD62\nN 909\nN58");
assert.strictEqual(recoveredPd.instrument.pdDistanceMm, 62);
assert.strictEqual(recoveredPd.instrument.pdNearMm, 58);

console.log("ticket-scan: ok");
