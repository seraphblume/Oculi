// Project Dioptra — engine registry.
//
// Beryl v1.1.1 is primary; Heliodor v1.1 is the paired comparator. Their source
// algorithms remain frozen as v0.3.0 and v1.0.0 Beryl respectively. Goshenite is
// research-only and must not be added here without the documented validation gates.
(function () {
  const ENGINES = {
    "beryl-v1.1.1": {
      id: "beryl-v1.1.1",
      label: "Beryl",
      version: () => window.OCULI_BERYL_V111_CONFIG.version,
      predictCase: input => window.OculiEngineBerylV111.predictCase(input)
    },
    "heliodor-v1.1": {
      id: "heliodor-v1.1",
      label: "Heliodor",
      version: () => window.OCULI_HELIODOR_V11_CONFIG.version,
      predictCase: input => window.OculiEngineHeliodorV11.predictCase(input)
    }
  };

  function primaryId() {
    return "beryl-v1.1.1";
  }

  function shadowId() {
    return "heliodor-v1.1";
  }

  // The primary engine must succeed; a shadow failure is recorded and never blocks the case.
  function run(input) {
    const primary = ENGINES[primaryId()];
    const shadow = ENGINES[shadowId()];
    const primaryPrediction = primary.predictCase(input);
    let shadowPrediction = null;
    let shadowError = null;
    try {
      shadowPrediction = shadow.predictCase(input);
    } catch (err) {
      shadowError = err.message;
    }
    return {
      primary: { id: primary.id, prediction: primaryPrediction },
      shadow: { id: shadow.id, prediction: shadowPrediction, error: shadowError }
    };
  }

  window.DioptraEngines = { ENGINES, primaryId, shadowId, run };
})();
