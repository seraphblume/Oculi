// Project Dioptra — engine registry.
//
// v1.0 "Beryl" is primary; v0.3 is the fixed shadow comparator. v0.2 and the
// 0.4.0-rc.1 release candidate are retired from new runs; their records and source
// remain for historical exports and parity tests.
(function () {
  const ENGINES = {
    "v1.0": {
      id: "v1.0",
      label: "Beryl",
      version: () => window.DIOPTRA_V10_CONFIG.version,
      predictCase: input => window.DioptraEngineV10.predictCase(input)
    },
    "v0.3": {
      id: "v0.3",
      label: "v0.3",
      version: () => window.DIOPTRA_V03_CONFIG.version,
      predictCase: input => window.DioptraEngineV03.predictCase(input)
    }
  };

  function primaryId() {
    return "v1.0";
  }

  function shadowId() {
    return "v0.3";
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
