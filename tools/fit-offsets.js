#!/usr/bin/env node
// Fit the v0.3 stratified spherical-equivalent offsets from an exported cohort.
//
//   node tools/fit-offsets.js <export.csv> [--prior 8] [--base centre|selected] [--cohort-closed]
//
// Accepts either the study CSV (project-dioptra-*.csv) or the shadow CSV
// (project-dioptra-shadow-*.csv). Each eye contributes one residual:
//   residual = clinician final M - autorefractor M
// Offsets are estimated per stratum (refractive state x age band) and shrunk toward the
// global mean so that small strata do not overfit:
//   offset_s = (sum of residuals in s + prior * global) / (n_s + prior)
//
// Leave-one-case-out cross-validation compares three options on the same data:
// no offset, one global offset, and the stratified offsets.
//
// Refuses to fit on v0.2 (Cohort B) or v1.0 (Beryl) cases unless --cohort-closed is passed,
// so thresholds are never selected from a cohort that is still collecting.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const file of ["js/vertex.js", "js/config.js", "js/config-v03.js", "js/engine-v03.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
}
const cfg = sandbox.window.DIOPTRA_V03_CONFIG;
const engine = sandbox.window.DioptraEngineV03;

function parseArgs(argv) {
  const args = { file: null, prior: 8, base: "centre", cohortClosed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--prior") args.prior = Number(argv[++i]);
    else if (a === "--base") args.base = argv[++i];
    else if (a === "--cohort-closed") args.cohortClosed = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else args.file = a;
  }
  return args;
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter(r => r.length > 1 || r[0] !== "");
  return body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

function num(x) {
  if (x === undefined || x === null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function eyesFromRows(rows, base) {
  const eyes = [];
  if (rows.length && "variant" in rows[0]) {
    // Shadow CSV: one row per variant; keep the cohort engine's rows (one per case x eye).
    for (const r of rows) {
      if (r.variant !== r.cohort_engine) continue;
      const centre = num(r.ar_centre_m);
      const arM = base === "selected" || centre == null ? num(r.ar_sel_m) : centre;
      eyes.push({ caseId: r.case_id, version: r.algorithm_version, age: num(r.age), arM, finalM: num(r.final_m) });
    }
  } else {
    // Study CSV: one row per case, OD and OS columns.
    for (const r of rows) {
      for (const eye of ["od", "os"]) {
        eyes.push({
          caseId: r.case_id,
          version: r.algorithm_version,
          age: num(r.age),
          arM: num(r[`ar_${eye}_se`]),
          finalM: num(r[`final_${eye}_se`])
        });
      }
    }
  }
  return eyes
    .filter(e => e.arM != null && e.finalM != null && e.age != null)
    .map(e => ({
      ...e,
      residual: e.finalM - e.arM,
      state: engine.classifyRefractiveState(e.arM),
      band: engine.ageBand(e.age)
    }));
}

const mean = v => v.reduce((s, x) => s + x, 0) / v.length;

function fit(eyes, prior) {
  const global = mean(eyes.map(e => e.residual));
  const strata = {};
  for (const state of Object.keys(cfg.sphereOffsets)) {
    strata[state] = {};
    for (const band of cfg.ageBands.map(b => b.id)) {
      const group = eyes.filter(e => e.state === state && e.band === band);
      const sum = group.reduce((s, e) => s + e.residual, 0);
      strata[state][band] = {
        n: group.length,
        mean: group.length ? sum / group.length : null,
        offset: (sum + prior * global) / (group.length + prior)
      };
    }
  }
  return { global, strata };
}

function crossValidate(eyes, prior) {
  const cases = [...new Set(eyes.map(e => e.caseId))];
  const err = { none: [], global: [], stratified: [] };
  for (const id of cases) {
    const train = eyes.filter(e => e.caseId !== id);
    const test = eyes.filter(e => e.caseId === id);
    if (!train.length) continue;
    const model = fit(train, prior);
    for (const e of test) {
      err.none.push(Math.abs(e.residual));
      err.global.push(Math.abs(e.residual - model.global));
      err.stratified.push(Math.abs(e.residual - model.strata[e.state][e.band].offset));
    }
  }
  return Object.fromEntries(Object.entries(err).map(([k, v]) => [k, v.length ? mean(v) : null]));
}

const r2 = x => Math.round(x * 100) / 100;

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.file) {
    console.log("Usage: node tools/fit-offsets.js <export.csv> [--prior 8] [--base centre|selected] [--cohort-closed]");
    process.exit(args.help ? 0 : 1);
  }

  const eyes = eyesFromRows(parseCSV(fs.readFileSync(args.file, "utf8")), args.base);
  if (!eyes.length) {
    console.error("No usable eyes found (need age, autorefractor SE and final SE).");
    process.exit(1);
  }
  // Cohorts that may still be collecting: Cohort B (v0.2) and the Beryl prospective cohort (v1.0).
  const open = [["0.2", "v0.2 (Cohort B)"], ["1.0", "v1.0 Beryl"]].filter(([prefix]) => eyes.some(e => String(e.version).startsWith(prefix)));
  if (!args.cohortClosed && open.length) {
    console.error(`This export contains ${open.map(o => o[1]).join(" and ")} cases. Close and export the cohort, then re-run with --cohort-closed.`);
    process.exit(2);
  }

  const model = fit(eyes, args.prior);
  const cv = crossValidate(eyes, args.prior);
  const cases = new Set(eyes.map(e => e.caseId)).size;

  console.log(`Eyes: ${eyes.length} from ${cases} cases · prior strength ${args.prior} · base ${args.base}`);
  console.log(`Global offset (final M - AR M): ${model.global.toFixed(3)} D\n`);
  console.log("Stratum                          n     mean   offset");
  for (const [state, bands] of Object.entries(model.strata)) {
    for (const [band, s] of Object.entries(bands)) {
      const label = `${state} / ${band}`.padEnd(30);
      console.log(`${label} ${String(s.n).padStart(3)}  ${s.mean == null ? "   —  " : s.mean.toFixed(3).padStart(6)}  ${s.offset.toFixed(3).padStart(6)}`);
    }
  }
  console.log("\nLeave-one-case-out mean absolute M error:");
  for (const [k, v] of Object.entries(cv)) console.log(`  ${k.padEnd(11)} ${v == null ? "—" : v.toFixed(3) + " D"}`);

  const sphereOffsets = {};
  let capped = false;
  for (const [state, bands] of Object.entries(model.strata)) {
    sphereOffsets[state] = {};
    for (const [band, s] of Object.entries(bands)) {
      const value = r2(s.offset);
      if (Math.abs(value) > cfg.maxOffset) capped = true;
      sphereOffsets[state][band] = value;
    }
  }
  const snippet = {
    sphereOffsets,
    offsetsProvenance: {
      method: "fitted",
      source: path.basename(args.file),
      fittedOn: new Date().toISOString().slice(0, 10),
      priorStrength: args.prior,
      eyes: eyes.length
    }
  };
  console.log("\nPaste into js/config-v03.js:\n");
  console.log(JSON.stringify(snippet, null, 2));
  if (capped) console.log(`\nNote: at least one offset exceeds maxOffset (${cfg.maxOffset} D) and will be clamped and flagged by the engine.`);
}

main();
