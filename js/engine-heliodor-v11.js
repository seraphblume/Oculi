// Heliodor v1.1: the unchanged former Beryl v1.0 prediction path under a new identity.
(function () {
  const cfg = window.OCULI_HELIODOR_V11_CONFIG;
  const engine = window.DioptraEngineFactory(cfg);
  const EPS = 1e-9;

  function predictCase(input) {
    const prediction = engine.predictCase(input);
    prediction.name = cfg.name;
    prediction.flags.unshift({
      code: "UNVALIDATED",
      level: "review",
      message: "Heliodor is an unvalidated research comparator. Complete an independent examination; do not prescribe from this result alone."
    });
    if (Number(input.age) < 18) {
      prediction.flags.push({
        code: "PEDIATRIC_PRIOR",
        level: "review",
        message: "Under 18: fitted offsets are not applied; the prior is retained. This is not pediatric validation."
      });
    }
    if ([prediction.od, prediction.os].some(eye => eye.stratum.refractiveState !== "myopiaEmmetropia")) {
      prediction.flags.push({
        code: "SPARSE_CALIBRATION",
        level: "review",
        message: "Hyperopic calibration data are sparse; original prior offsets are retained."
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

  window.OculiEngineHeliodorV11 = { ...engine, predictCase };
})();
