#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const window = {};
const context = vm.createContext({ window });
for (const file of [
  "js/vertex.js", "js/config.js", "js/algorithm.js", "js/config-v03.js", "js/engine-v03.js",
  "js/config-v10.js", "js/engine-v10.js", "js/config-beryl-v111.js", "js/engine-beryl-v111.js",
  "js/config-heliodor-v11.js", "js/engine-heliodor-v11.js", "js/goshenite-research.js",
  "js/scoring.js", "js/engines.js"
]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });

const optics = prediction => ({
  od: [prediction.od.sphere, prediction.od.cylinder, prediction.od.axis, prediction.od.sphericalEquivalent, prediction.od.candidates],
  os: [prediction.os.sphere, prediction.os.cylinder, prediction.os.axis, prediction.os.sphericalEquivalent, prediction.os.candidates],
  add: prediction.add
});

for (let i = 0; i < 200; i++) {
  const eye = (shift, multiplier) => ({
    sphere: ((i * multiplier) % 60 - 40 + shift) / 4,
    cylinder: -((i + shift) % 12) / 4,
    axis: ((i * multiplier + shift) % 180) + 1
  });
  const od = eye(1, 7), os = eye(3, 11);
  const input = {
    age: (i % 75) + 5,
    instrument: { vertexMm: 12 },
    od: { ...od, readings: [od, od, od] },
    os: { ...os, readings: [os, os, os] }
  };
  assert.deepEqual(optics(window.OculiEngineBerylV111.predictCase(input)), optics(window.DioptraEngineV03.predictCase(input)), `Beryl parity ${i}`);
  assert.deepEqual(optics(window.OculiEngineHeliodorV11.predictCase(input)), optics(window.DioptraEngineV10.predictCase(input)), `Heliodor parity ${i}`);
}

assert.equal(window.OCULI_BERYL_V111_CONFIG.lineage.rulesFrom, "v0.3.0");
assert.equal(window.OCULI_HELIODOR_V11_CONFIG.lineage.rulesFrom, "v1.0.0 Beryl");
assert.equal(window.DioptraEngines.primaryId(), "beryl-v1.1.1");
assert.equal(window.DioptraEngines.shadowId(), "heliodor-v1.1");
assert.equal(window.DioptraEngines.ENGINES["goshenite-v1.0"], undefined, "untrained Goshenite must not be runnable");
assert.equal(window.OculiGosheniteResearch.manifest.deploymentEligible, false);
assert.equal(window.OculiGosheniteResearch.manifest.clinicalUseAllowed, false);

const schema = JSON.parse(fs.readFileSync(path.join(root, "docs/goshenite-training-record.schema.json"), "utf8"));
assert.ok(schema.required.includes("clinicianAssessment"));
assert.ok(schema.required.includes("patientTolerance"));
assert.equal(schema.properties.baseEngine.properties.id.const, "beryl-v1.1.1");

console.log("PASS: Beryl and Heliodor identities preserve frozen optics; Goshenite remains research-only");
