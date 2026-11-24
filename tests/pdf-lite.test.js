#!/usr/bin/env node
// Oculi's one-page PDF writer: structure, WinAnsi text encoding and escaping. No browser needed.
const assert = require("node:assert/strict");
const OculiPdf = require("../js/pdf-lite.js");

// Text: minus → en dash (\226), degree and middle dot stay Latin-1, parentheses and backslashes escaped,
// characters WinAnsi cannot show become "?".
assert.equal(OculiPdf.pdfString("−2.25 × 180°"), "(\\2262.25 \\327 180\\260)");
assert.equal(OculiPdf.pdfString("OD · (a\\b)"), "(OD \\267 \\(a\\\\b\\))");
assert.equal(OculiPdf.pdfString("López — 視"), "(L\\363pez \\227 ?)");

const doc = OculiPdf.create(612, 792);
doc.rotatedText("NOT A PRESCRIPTION", 306, 396, 28, { size: 46, color: 0.93 });
doc.text("Prescription preview", 46, 80, { font: "serif", size: 23 });
doc.text("Right", 566, 120, { align: "right" });
doc.line(46, 130, 566, 130);
doc.rect(46, 140, 520, 40, { stroke: 0.6, radius: 8 });
doc.rect(46, 190, 520, 20, { fill: 0.95 });
const lines = doc.wrap("one two three four five six seven eight nine ten", 60, "regular", 10);
assert.ok(lines.length > 1 && lines.every(l => l.length > 0), "wraps to several non-empty lines");
assert.deepEqual(doc.wrap("", 100), [""]);

const bytes = doc.toBytes({ title: "Test (1)" });
const text = Buffer.from(bytes).toString("latin1");
assert.ok(text.startsWith("%PDF-1.4\n"));
assert.ok(text.endsWith("%%EOF\n"));
assert.ok(bytes.every(b => b < 128), "ASCII-only file, so offsets equal string positions");
assert.match(text, /\/MediaBox \[0 0 612 792\]/);
assert.match(text, /\/Count 1/);
assert.equal((text.match(/\/Type \/Page(?![a-z])/g) || []).length, 1);
for (const base of ["Helvetica", "Helvetica-Bold", "Times-Roman"]) assert.ok(text.includes(`/BaseFont /${base} /Encoding /WinAnsiEncoding`));
assert.ok(text.includes("/Title (Test \\(1\\))"));

// Cross-reference table points at every object; the stream length matches its content.
const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)[1]);
const xref = text.slice(startxref).split("\n");
assert.equal(xref[0], "xref");
const size = Number(xref[1].split(" ")[1]);
for (let i = 1; i < size; i++) {
  const offset = Number(xref[2 + i].slice(0, 10));
  assert.ok(text.slice(offset).startsWith(`${i} 0 obj\n`), `object ${i} offset`);
}
const stream = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(text);
assert.equal(Number(stream[1]), stream[2].length);
assert.match(stream[2], /0\.88 0\.47 -0\.47 0\.88 [\d.]+ [\d.]+ Tm \(NOT A PRESCRIPTION\) Tj/, "watermark rotated 28°");
assert.match(stream[2], /\/F3 23 Tf/, "serif title");
assert.match(stream[2], / c h B| c h S/, "rounded rectangle path");

console.log("PASS: PDF writer structure, xref offsets, WinAnsi encoding, escaping, wrapping, rotated watermark");

// Several pages, filled polygons and a 180° turn (the folded card's front cover).
const card = OculiPdf.create(255.12, 453.54);
card.text("Inside", 10, 20);
card.newPage();
card.rotated180(127.56, 113.39, () => card.text("Cover", 10, 20));
card.polygon([[10, 10], [20, 10], [15, 20]], { fill: [0.08, 0.07, 0.35] });
const cardText = Buffer.from(card.toBytes()).toString("latin1");
assert.match(cardText, /\/Count 2/);
assert.equal((cardText.match(/\/Type \/Page(?![a-z])/g) || []).length, 2);
assert.match(cardText, /q -1 0 0 -1 255\.12 680\.3 cm[\s\S]*\(Cover\) Tj[\s\S]*Q/, "cover drawn turned 180°");
assert.match(cardText, /0\.08 0\.07 0\.35 rg 10 443\.54 m 20 443\.54 l 15 433\.54 l h f/, "filled polygon in labs-indigo");
const cx = Number(/startxref\n(\d+)\n%%EOF/.exec(cardText)[1]);
const cxr = cardText.slice(cx).split("\n");
for (let i = 1; i < Number(cxr[1].split(" ")[1]); i++) assert.ok(cardText.slice(Number(cxr[2 + i].slice(0, 10))).startsWith(`${i} 0 obj\n`), `card object ${i}`);
console.log("PASS: multi-page card, polygon and 180° cover");
