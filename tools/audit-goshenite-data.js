#!/usr/bin/env node
// Aggregate-only readiness audit for Goshenite research exports. It never trains a model
// and never prints patient-level values.
const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_LABELS = [
  "patient_tolerance_status",
  "patient_tolerance_follow_up_days",
  "optometrist_score",
  "optometrist_scale_version",
  "clinician_independent",
  "clinician_blinded_until_endpoint"
];

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [header = [], ...body] = rows.filter(values => values.length > 1 || values[0] !== "");
  return { header, rows: body.map(values => Object.fromEntries(header.map((name, i) => [name, values[i] || ""]))) };
}

function audit(file) {
  const { header, rows } = parseCSV(fs.readFileSync(file, "utf8"));
  const cases = new Set(rows.map(row => row.case_id).filter(Boolean));
  const missingLabels = REQUIRED_LABELS.filter(label => !header.includes(label));
  const completeLabels = REQUIRED_LABELS.filter(label => header.includes(label))
    .filter(label => rows.length && rows.every(row => String(row[label]).trim() !== ""));
  const variants = new Set(rows.map(row => row.variant).filter(Boolean));
  const eyes = new Set(rows.map(row => row.eye).filter(Boolean));
  return {
    file: path.basename(file),
    rows: rows.length,
    columns: header.length,
    uniqueCases: cases.size,
    longFormat: header.includes("variant") && header.includes("eye"),
    variants: variants.size,
    eyes: [...eyes].sort(),
    missingRequiredLabels: missingLabels,
    completeRequiredLabels: completeLabels,
    trainingReady: missingLabels.length === 0 && completeLabels.length === REQUIRED_LABELS.length
  };
}

const files = process.argv.slice(2).filter(arg => !arg.startsWith("-"));
if (!files.length) {
  console.error("Usage: node tools/audit-goshenite-data.js <export.csv> [more.csv ...]");
  process.exit(1);
}

const reports = files.map(audit);
const caseSets = files.map(file => {
  const parsed = parseCSV(fs.readFileSync(file, "utf8"));
  return new Set(parsed.rows.map(row => row.case_id).filter(Boolean));
});
const overlaps = [];
for (let i = 0; i < files.length; i++) for (let j = i + 1; j < files.length; j++) {
  overlaps.push({
    files: [path.basename(files[i]), path.basename(files[j])],
    overlappingCases: [...caseSets[i]].filter(id => caseSets[j].has(id)).length
  });
}

const result = {
  schema: "goshenite-readiness-audit-1",
  reports,
  overlaps,
  readyForSupervisedTuning: reports.length > 0 && reports.every(report => report.trainingReady),
  note: "Axis lens-tolerance fields are scoring rules, not patient-tolerance outcomes."
};
console.log(JSON.stringify(result, null, 2));
if (!result.readyForSupervisedTuning) process.exitCode = 2;
