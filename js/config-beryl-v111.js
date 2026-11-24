// Beryl v1.1.1: release identity for the unchanged v0.3.0 rules.
// This is a naming/version transition, not a fit, validation, or clinical-performance claim.
(function () {
  const baseline = JSON.parse(JSON.stringify(window.DIOPTRA_V03_CONFIG));
  window.OCULI_BERYL_V111_CONFIG = {
    ...baseline,
    engine: "beryl-v1.1.1",
    name: "Beryl",
    version: "1.1.1",
    mode: "active",
    cohort: "beryl-v1.1.1-1",
    lineage: {
      rulesFrom: "v0.3.0",
      change: "release identity only",
      validation: "not clinically validated"
    },
    offsetsProvenance: {
      ...baseline.offsetsProvenance,
      carriedFrom: "v0.3.0",
      validation: "unfitted prior; independent prospective evaluation required"
    }
  };
})();
