// Goshenite v1.0 research manifest.
// No trained artifact exists and Goshenite is intentionally absent from DioptraEngines.
(function () {
  const manifest = Object.freeze({
    id: "goshenite-v1.0",
    name: "Goshenite",
    version: "1.0.0",
    baseEngine: "beryl-v1.1",
    status: "research-only-untrained",
    outcomeSchema: "goshenite-training-1",
    deploymentEligible: false,
    clinicalUseAllowed: false
  });

  // Produces a reproducible baseline snapshot for offline research. It never returns a
  // tuned recommendation and is not wired into the Clinical Study or Genius runtime.
  function createBaselineSnapshot(input) {
    return {
      manifest: { ...manifest },
      baseline: window.OculiEngineBerylV11.predictCase(input),
      tunedPrediction: null
    };
  }

  window.OculiGosheniteResearch = { manifest, createBaselineSnapshot };
})();
