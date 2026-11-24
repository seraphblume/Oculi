// Heliodor v1.1: release identity for the unchanged former Beryl v1.0 rules.
// Historical v1.0 records and source retain their original Beryl identity.
(function () {
  const baseline = JSON.parse(JSON.stringify(window.DIOPTRA_V10_CONFIG));
  window.OCULI_HELIODOR_V11_CONFIG = {
    ...baseline,
    engine: "heliodor-v1.1",
    name: "Heliodor",
    version: "1.1.0",
    mode: "shadow",
    cohort: "heliodor-v1.1-1",
    lineage: {
      rulesFrom: "v1.0.0 Beryl",
      change: "release identity only",
      validation: "not clinically validated"
    },
    offsetsProvenance: {
      ...baseline.offsetsProvenance,
      carriedFrom: "v1.0.0 Beryl",
      validation: "development-only fit; independent prospective evaluation required"
    }
  };
})();
