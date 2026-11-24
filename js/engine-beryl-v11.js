// Beryl v1.1: the unchanged v0.3.0 prediction path under a new release identity.
(function () {
  const cfg = window.OCULI_BERYL_V11_CONFIG;
  const engine = window.DioptraEngineFactory(cfg);
  const EPS = 1e-9;

  function predictCase(input) {
    const prediction = engine.predictCase(input);
    prediction.name = cfg.name;
    prediction.flags.unshift({
      code: "UNVALIDATED",
      level: "review",
      message: "Beryl is an unvalidated research model. Complete an independent examination; do not prescribe from this result alone."
    });
    if (Number(input.age) < 18) {
      prediction.flags.push({
        code: "PEDIATRIC_RESEARCH_ONLY",
        level: "review",
        message: "Under 18: this release has no pediatric validation and requires a full independent examination."
      });
    }
    if (prediction.tentativeAdd != null && prediction.tentativeAdd >= cfg.add.maxAdd - EPS) {
      prediction.flags.push({
        code: "ADD_AT_CAP",
        level: "review",
        message: `ADD reached the +${cfg.add.maxAdd.toFixed(2)} cap. Check the near working distance entry.`
      });
    }
    prediction.status = "review";
    prediction.calibration = JSON.parse(JSON.stringify(cfg.offsetsProvenance));
    prediction.lineage = JSON.parse(JSON.stringify(cfg.lineage));
    return prediction;
  }

  window.OculiEngineBerylV11 = { ...engine, predictCase };
})();
