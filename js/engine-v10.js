// Oculi v1.0 "Beryl". Same prediction path as v0.3 with the fitted offsets in config-v10.js.
// Wrapper flags never change a dioptric value.
(function () {
  const cfg = window.DIOPTRA_V10_CONFIG;
  const engine = window.DioptraEngineFactory(cfg);
  const EPS = 1e-9;
  function predictCase(input) {
    const p = engine.predictCase(input);
    p.name = cfg.name;
    p.flags.unshift({ code: "UNVALIDATED", level: "review", message: "Beryl is not clinically validated. Compare with an independently completed exam; do not prescribe from this result alone." });
    if (Number(input.age) < 18) p.flags.push({ code: "PEDIATRIC_PRIOR", level: "review", message: "Under 18: fitted offsets are not applied; the prior is retained. This is not pediatric validation." });
    if ([p.od, p.os].some(e => e.stratum.refractiveState !== "myopiaEmmetropia")) {
      p.flags.push({ code: "SPARSE_CALIBRATION", level: "review", message: "Hyperopic calibration data are sparse; original prior offsets are retained." });
    }
    if (p.tentativeAdd != null && p.tentativeAdd >= cfg.add.maxAdd - EPS) {
      p.flags.push({ code: "ADD_AT_CAP", level: "review", message: `ADD reached the +${cfg.add.maxAdd.toFixed(2)} cap. Check the near working distance entry.` });
    }
    p.status = "review";
    p.calibration = JSON.parse(JSON.stringify(cfg.offsetsProvenance));
    return p;
  }
  window.DioptraEngineV10 = { ...engine, predictCase };
})();
