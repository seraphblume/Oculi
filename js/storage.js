(function () {
  const KEY = "project-dioptra-cases-v1";

  function listCases() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch { return []; }
  }

  function saveCase(record) {
    const cases = listCases();
    cases.push(record);
    localStorage.setItem(KEY, JSON.stringify(cases));
    return cases;
  }

  function clearCases() { localStorage.removeItem(KEY); }

  function csvEscape(value) {
    const text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) return '"' + text.replaceAll('"', '""') + '"';
    return text;
  }

  function symptomValue(c, key) {
    return c.input && c.input.symptoms && typeof c.input.symptoms[key] === "boolean" ? c.input.symptoms[key] : "";
  }

  function medicalValue(c, key) {
    return c.input && c.input.medical && typeof c.input.medical[key] === "boolean" ? c.input.medical[key] : "";
  }

  function se(sph, cyl) {
    if (!Number.isFinite(Number(sph)) || !Number.isFinite(Number(cyl))) return "";
    return Number(sph) + Number(cyl) / 2;
  }

  function eyeSEFields(c, eye) {
    const input = c.input && c.input[eye] ? c.input[eye] : {};
    const pred = c.prediction && c.prediction[eye] ? c.prediction[eye] : {};
    const actual = c.actual && c.actual[eye] ? c.actual[eye] : {};
    const arSE = se(input.sphere, input.cylinder);
    const predSE = Number.isFinite(Number(pred.sphericalEquivalent)) ? Number(pred.sphericalEquivalent) : se(pred.sphere, pred.cylinder);
    const finalSE = se(actual.sphere, actual.cylinder);
    const shift = arSE === "" || predSE === "" ? "" : predSE - arSE;
    const error = predSE === "" || finalSE === "" ? "" : finalSE - predSE;
    return {
      arSE, predSE, finalSE, shift, error,
      status: pred.seGuardrail && pred.seGuardrail.status ? pred.seGuardrail.status : "",
      applied: pred.seGuardrail && typeof pred.seGuardrail.applied === "boolean" ? pred.seGuardrail.applied : ""
    };
  }

  function toCSV(cases) {
    const headers = [
      "case_id","age","created_at","algorithm_version",
      "ar_od_sph","ar_od_cyl","ar_od_axis","va_od","ph_od",
      "ar_os_sph","ar_os_cyl","ar_os_axis","va_os","ph_os",
      "pred_od_sph","pred_od_cyl","pred_od_axis",
      "pred_os_sph","pred_os_cyl","pred_os_axis","pred_add",
      "final_od_sph","final_od_cyl","final_od_axis",
      "final_os_sph","final_os_cyl","final_os_axis","final_add",
      "od_sph_error","od_cyl_error","od_axis_error",
      "os_sph_error","os_cyl_error","os_axis_error",
      "ar_od_se","pred_od_se","final_od_se","pred_od_se_shift","od_se_error","od_se_guardrail_status","od_se_guardrail_applied",
      "ar_os_se","pred_os_se","final_os_se","pred_os_se_shift","os_se_error","os_se_guardrail_status","os_se_guardrail_applied",
      "od_exact","os_exact","od_within_025_sph","od_within_025_cyl","od_within_5_axis","od_within_025_se",
      "os_within_025_sph","os_within_025_cyl","os_within_5_axis","os_within_025_se",
      "symptoms_text","symptom_tearing","symptom_blurred_vision","symptom_burning_irritation","symptom_itching",
      "symptom_discharge","symptom_infection","symptom_headache","symptom_flashes","symptom_dry_eye",
      "symptom_other","symptom_other_text","diabetes","hypertension","pregnancy","previous_rx_known","final_note"
    ];

    const rows = cases.map(c => {
      const odSE = eyeSEFields(c, "od");
      const osSE = eyeSEFields(c, "os");
      return [
        c.caseId, c.input.age, c.savedAt, c.prediction.version,
        c.input.od.sphere, c.input.od.cylinder, c.input.od.axis, c.input.od.va, c.input.od.pinhole,
        c.input.os.sphere, c.input.os.cylinder, c.input.os.axis, c.input.os.va, c.input.os.pinhole,
        c.prediction.od.sphere, c.prediction.od.cylinder, c.prediction.od.axis,
        c.prediction.os.sphere, c.prediction.os.cylinder, c.prediction.os.axis, c.prediction.tentativeAdd,
        c.actual.od.sphere, c.actual.od.cylinder, c.actual.od.axis,
        c.actual.os.sphere, c.actual.os.cylinder, c.actual.os.axis, c.actual.add,
        c.comparison.od.sphereError, c.comparison.od.cylinderError, c.comparison.od.axisError,
        c.comparison.os.sphereError, c.comparison.os.cylinderError, c.comparison.os.axisError,
        odSE.arSE, odSE.predSE, odSE.finalSE, odSE.shift, odSE.error, odSE.status, odSE.applied,
        osSE.arSE, osSE.predSE, osSE.finalSE, osSE.shift, osSE.error, osSE.status, osSE.applied,
        c.comparison.od.exact, c.comparison.os.exact,
        c.comparison.od.within025Sphere, c.comparison.od.within025Cylinder, c.comparison.od.within5Axis,
        odSE.error === "" ? "" : Math.abs(odSE.error) <= 0.25 + 1e-9,
        c.comparison.os.within025Sphere, c.comparison.os.within025Cylinder, c.comparison.os.within5Axis,
        osSE.error === "" ? "" : Math.abs(osSE.error) <= 0.25 + 1e-9,
        c.input.symptom || "",
        symptomValue(c,"tearing"), symptomValue(c,"blurredVision"), symptomValue(c,"burningIrritation"),
        symptomValue(c,"itching"), symptomValue(c,"discharge"), symptomValue(c,"infection"),
        symptomValue(c,"headache"), symptomValue(c,"flashes"), symptomValue(c,"dryEye"),
        symptomValue(c,"other"), (c.input.symptoms && c.input.symptoms.otherText) || "",
        medicalValue(c,"diabetes"), medicalValue(c,"hypertension"), medicalValue(c,"pregnancy"),
        c.input.previousRxKnown, c.actual.note
      ];
    });

    return [headers, ...rows].map(r => r.map(csvEscape).join(",")).join("\n");
  }

  // ------------------------------------------------------------------ shadow export
  // Long format: one row per case x eye x engine variant, with cylinder-aware scoring.
  // The study CSV above is unchanged; this file is for comparing engines after the cohort closes.

  function v03Prediction(c) {
    if (c.prediction && c.prediction.engine === "v0.3") return c.prediction;
    if (c.shadow && c.shadow.prediction && c.shadow.prediction.engine === "v0.3") return c.shadow.prediction;
    return null;
  }

  function engineId(prediction) {
    if (!prediction) return "";
    return prediction.engine || ("v" + String(prediction.version || "").split(".").slice(0, 2).join("."));
  }

  function variantsFor(c) {
    const variants = [];
    if (c.prediction) variants.push({ variant: engineId(c.prediction), prediction: c.prediction });
    if (c.shadow && c.shadow.prediction) variants.push({ variant: engineId(c.shadow.prediction), prediction: c.shadow.prediction });
    for (const p of [c.prediction, c.shadow && c.shadow.prediction].filter(p => p && p.od.candidates && p.os.candidates)) {
      for (const name of ["selected", "median", "mostPlus"]) {
        const od = p.od.candidates[name];
        const os = p.os.candidates[name];
        if (od && os) variants.push({ variant: `${engineId(p)}:${name}`, prediction: { od, os, tentativeAdd: p.tentativeAdd } });
      }
    }
    return variants;
  }

  function fixed(n, digits = 3) {
    if (n === null || n === undefined || n === "") return "";
    const x = Number(n);
    return Number.isFinite(x) ? Number(x.toFixed(digits)) : "";
  }

  // Records whose post-exam agreement is scored (the 0.4.0-rc.1 cohort onwards).
  const SCORED_SCHEMAS = ["dioptra-case-3", "dioptra-case-4"];

  function toShadowCSV(cases) {
    const scoring = window.DioptraScoring;
    const headers = [
      "case_id","saved_at","algorithm_version","cohort_engine","variant","eye","age",
      "vertex_mm","near_wd_cm","near_point_cm",
      "ar_sel_sph","ar_sel_cyl","ar_sel_axis","ar_sel_m",
      "ar_centre_m","ar_centre_j0","ar_centre_j45","n_readings","m_range","j_spread","selected_distance","reliability",
      "refractive_state","age_band","offset",
      "pred_sph","pred_cyl","pred_axis","pred_m","pred_add",
      "final_sph","final_cyl","final_axis","final_m","final_add",
      "sph_error","cyl_error","axis_error","axis_tolerance","axis_within_tolerance",
      "se_error","j0_error","j45_error","vector_error","astigmatic_error","clinical_match",
      "keratometry_disagreement","ametropia","astigmatism","flags","status",
      "record_schema","cohort","near_wd_mm","near_point_mm",
      "previous_sph","previous_cyl","previous_axis","previous_add",
      "previous_rx_worn_months","agreement_percent","agreement_passed","agreement_total","agreement_version","entry_revision",
      "axis_within_floor","clinical_match_floor","va_condition","final_va","final_va_ou","plus_test","final_add_os",
      "endpoint_differs","endpoint_sph","endpoint_cyl","endpoint_axis","endpoint_reasons",
      "symptom_glare_halos","symptom_flashes_floaters"
    ];

    const rows = [];
    for (const c of cases) {
      if (!c.actual || !c.prediction) continue;
      const v03 = v03Prediction(c);
      const obs = c.observations || (c.shadow && c.shadow.observations) || {};
      const previous = c.input.previousRxKnown === "yes" ? c.input.previousRx : null;
      for (const { variant, prediction } of variantsFor(c)) {
        const source = [c.prediction, c.shadow && c.shadow.prediction].find(p => engineId(p) === variant.split(":")[0]);
        // Retain the legacy evidence fallback for historical v0.2 exports.
        const evidence = source && source.od.evidence ? source : v03;
        const agreement = SCORED_SCHEMAS.includes(c.schema) ? scoring.agreementCase(prediction, c.actual) : null;
        const checks = c.actual.checks || null;
        const endpoint = c.actual.endpoint || null;
        for (const eye of ["od", "os"]) {
          const pred = prediction[eye];
          const actual = c.actual[eye];
          if (!pred || !actual) continue;
          const s = scoring.scoreEye(pred, actual);
          const ev = evidence ? evidence[eye] : null;
          const input = c.input[eye] || {};
          rows.push([
            c.caseId, c.savedAt, c.prediction.version, engineId(c.prediction), variant, eye, c.input.age,
            obs.instrument ? obs.instrument.vertexMm : "", obs.near ? obs.near.workingDistanceCm : "", obs.near ? obs.near.nearPointCm : "",
            input.sphere, input.cylinder, input.axis, fixed(se(input.sphere, input.cylinder)),
            ev ? fixed(ev.evidence.centre.M) : "", ev ? fixed(ev.evidence.centre.J0) : "", ev ? fixed(ev.evidence.centre.J45) : "",
            ev ? ev.evidence.readings : "", ev ? fixed(ev.evidence.mRange) : "", ev ? fixed(ev.evidence.jSpread) : "",
            ev ? fixed(ev.evidence.selectedDistance) : "", ev ? ev.evidence.reliability.join(" ") : "",
            ev ? ev.stratum.refractiveState : "", ev ? ev.stratum.ageBand : "", ev ? ev.stratum.offset : "",
            pred.sphere, pred.cylinder, pred.axis, fixed(se(pred.sphere, pred.cylinder)), prediction.tentativeAdd,
            actual.sphere, actual.cylinder, actual.axis, fixed(se(actual.sphere, actual.cylinder)), c.actual.add,
            fixed(s.sphereError), fixed(s.cylinderError), s.axisError == null ? "" : fixed(s.axisError, 1),
            s.axisTolerance == null ? "" : s.axisTolerance, s.axisWithinTolerance == null ? "" : s.axisWithinTolerance,
            fixed(s.seError), fixed(s.vectorError.J0), fixed(s.vectorError.J45), fixed(s.vectorErrorMagnitude), fixed(s.astigmaticError),
            s.clinicalMatch,
            ev && ev.keratometry ? fixed(ev.keratometry.disagreement) : "",
            ev ? ev.ametropia : "", ev ? ev.astigmatism : "",
            ev ? ev.flags.map(f => f.code).join(" ") : "",
            evidence ? evidence.status : "",
            c.schema || "", c.cohort || "",
            obs.near && obs.near.workingDistanceCm != null ? fixed(obs.near.workingDistanceCm * 10) : "",
            obs.near && obs.near.nearPointCm != null ? fixed(obs.near.nearPointCm * 10) : "",
            previous && previous[eye] ? previous[eye].sphere : "",
            previous && previous[eye] ? previous[eye].cylinder : "",
            previous && previous[eye] ? previous[eye].axis : "",
            previous ? previous.add : "",
            previous && previous.wornMonths != null ? previous.wornMonths : "",
            agreement ? agreement.percent : "", agreement ? agreement.passed : "", agreement ? agreement.total : "",
            agreement ? agreement.version : "", c.entryRevision || "",
            s.axisWithinFloor == null ? "" : s.axisWithinFloor, s.clinicalMatchFloor,
            c.input.vaCondition || "",
            checks && checks.va ? checks.va[eye] || "" : "", checks && checks.va ? checks.va.ou || "" : "",
            checks ? checks.plusTest || "" : "",
            "addOs" in c.actual ? (c.actual.addOs == null ? "" : c.actual.addOs) : "",
            "endpoint" in c.actual ? Boolean(endpoint) : "",
            endpoint && endpoint[eye] ? endpoint[eye].sphere : "",
            endpoint && endpoint[eye] ? endpoint[eye].cylinder : "",
            endpoint && endpoint[eye] ? endpoint[eye].axis : "",
            endpoint ? endpoint.reasons.join(" ") : "",
            symptomValue(c, "glareHalos"), symptomValue(c, "flashesFloaters")
          ]);
        }
      }
    }
    return [headers, ...rows].map(r => r.map(csvEscape).join(",")).join("\n");
  }

  window.DioptraStorage = { listCases, saveCase, clearCases, toCSV, toShadowCSV };
})();
