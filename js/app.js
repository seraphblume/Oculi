(function () {
  const $ = id => document.getElementById(id);
  const cfg = window.DIOPTRA_CONFIG;
  const activeCfg = window.DIOPTRA_V04_CONFIG;
  const alg = window.DioptraAlgorithm;
  const engines = window.DioptraEngines;
  const scoring = window.DioptraScoring;
  const store = window.DioptraStorage;
  const ticketScan = window.DioptraTicketScan;

  const EYES = [
    { id: "od", short: "OD", name: "Right eye" },
    { id: "os", short: "OS", name: "Left eye" }
  ];
  const AR_ROWS = [
    { id: "R1", label: "1", repeat: true },
    { id: "R2", label: "2", repeat: true },
    { id: "R3", label: "3", repeat: true },
    { id: "Sel", label: "‹ ›", repeat: false }
  ];
  const SYMPTOMS = [
    ["tearing", "Tearing"],
    ["blurredVision", "Blurred vision"],
    ["burningIrritation", "Burning / irritation"],
    ["itching", "Itching"],
    ["discharge", "Discharge"],
    ["infection", "Infection"],
    ["headache", "Headache"],
    ["flashes", "Flashes"],
    ["dryEye", "Dry eye"],
    ["other", "Other"]
  ];
  const MEDICAL = [["diabetes", "Diabetes"], ["hypertension", "Hypertension"], ["pregnancy", "Pregnancy"]];

  const FLAG_TITLES = {
    EXPERIMENTAL_RC: "Experimental release candidate",
    PEDIATRIC_PRIOR: "Pediatric calibration unavailable",
    SPARSE_CALIBRATION: "Limited hyperopic calibration",
    VERTEX_CONVERTED: "Vertex distance converted",
    VERTEX_ASSUMED: "Vertex distance assumed",
    AR_REPEATS_MISSING: "Repeat readings not entered",
    AR_REPEATABILITY_LOW: "Readings disagree",
    AR_ASTIGMATISM_UNSTABLE: "Cylinder unstable across readings",
    AR_SELECTED_OUTSIDE_CLUSTER: "Selected line is an outlier",
    OFFSET_CLAMPED: "Offset capped",
    SE_SHIFT_REVIEW: "Large shift from the autorefractor",
    LOW_CYLINDER_DROPPED: "Small cylinder dropped",
    OBLIQUE_ASTIGMATISM: "Oblique astigmatism",
    KERATOMETRY_DISAGREEMENT: "Keratometry disagrees",
    PINHOLE_LIMITED_GAIN: "Pinhole gave no improvement"
  };

  const state = {
    stage: "measure",
    input: null,        // v0.2-shaped input (unchanged study record)
    observations: null, // evidence for the active candidate and comparison engine
    run: null,          // { primary, shadow }
    actual: null,
    comparison: null
  };

  // ------------------------------------------------------------------ formatting

  const MINUS = "−";

  function fmtPower(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    if (Math.abs(n) < 1e-9) return "0.00";
    return (n > 0 ? "+" : MINUS) + Math.abs(n).toFixed(2);
  }

  function fmtDelta(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    if (Math.abs(n) < 1e-9) return "0.00";
    return (n > 0 ? "+" : MINUS) + Math.abs(n).toFixed(2);
  }

  function fmtAxis(n) {
    return n == null || !Number.isFinite(n) ? "—" : `${Math.round(n)}°`;
  }

  function pct(rate) {
    return rate == null ? "—" : `${Math.round(rate * 100)}%`;
  }

  function esc(text) {
    return String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ------------------------------------------------------------------ builders

  function powerField(id, signed) {
    const label = `${id.startsWith("od") ? "OD" : "OS"} ${id.includes("Prev") ? "previous" : id.includes("Fin") ? "final" : id.includes("Sel") ? "selected" : "reading " + id.match(/R(\d)/)[1]} ${signed ? "sphere" : "cylinder"}`;
    const sign = signed
      ? `<button type="button" class="sign" data-target="${id}" aria-label="Toggle ${label} sign">${MINUS}</button>`
      : `<span class="sign static" aria-hidden="true">${MINUS}</span>`;
    const options = Array.from({ length: (signed ? 30 : 10) * 4 + 1 }, (_, i) => (i / 4).toFixed(2))
      .map(v => `<option value="${v}">${v}</option>`).join("");
    return `<div class="power">${sign}<select id="${id}" class="field" aria-label="${label}" data-sign="-1"><option value="">—</option>${options}</select></div>`;
  }

  function axisField(id, label, step = 1) {
    const options = Array.from({ length: Math.floor(180 / step) }, (_, i) => (i + 1) * step)
      .map(v => `<option value="${v}">${v}°</option>`).join("");
    return `<select id="${id}" class="field" aria-label="${label}"><option value="">—</option><option value="0" disabled>0°</option>${options}</select>`;
  }

  function buildArTables() {
    for (const eye of EYES) {
      const rows = AR_ROWS.map(row => {
        const p = `${eye.id}${row.id}`;
        const q = row.repeat
          ? `<select id="${p}Q" class="field" aria-label="${eye.short} reading ${row.label} reliability"><option value="">—</option>${Array.from({ length: 10 }, (_, i) => `<option value="${i}">${i}</option>`).join("")}</select>`
          : `<span></span>`;
        return `
          <div class="rx-row${row.repeat ? "" : " selected"}" data-eye="${eye.id}" data-row="${row.id}">
            <span class="rx-row-label" title="${row.repeat ? "Reading " + row.label : "Selected line (required)"}">${row.label}</span>
            ${powerField(p + "Sph", true)}
            ${powerField(p + "Cyl", false)}
            ${axisField(p + "Ax", `${eye.short} ${row.repeat ? "reading " + row.label : "selected"} axis`)}
            ${q}
          </div>`;
      }).join("");
      $(`ar-${eye.id}`).innerHTML = `
        <div class="rx-head"><span></span><span>SPH</span><span>CYL</span><span>AXIS</span><span>Q</span></div>${rows}`;
    }
  }

  function buildFinalTables() {
    const step = (activeCfg.ui && activeCfg.ui.finalAxisStep) || 5;
    for (const [kind, suffix] of [["final", "Fin"], ["previous", "Prev"]]) {
      for (const eye of EYES) {
        const p = `${eye.id}${suffix}`;
        $(`${kind}-${eye.id}`).innerHTML = `
        <div class="rx-head"><span></span><span>SPH</span><span>CYL</span><span>AXIS</span></div>
        <div class="rx-row" data-eye="${eye.id}">
          <span class="rx-row-label">${eye.short}</span>
          ${powerField(p + "Sph", true)}
          ${powerField(p + "Cyl", false)}
          ${axisField(p + "Ax", `${eye.short} ${kind} axis`, kind === "final" ? step : 1)}
        </div>`;
      }
    }
  }

  function buildKeratometry() {
    const rows = EYES.map(eye => `
      <div class="row">
        <span class="row-label">${eye.short} K1</span>
        <span class="row-value">
          <input id="${eye.id}K1" class="row-input num short" type="text" inputmode="decimal" placeholder="D" aria-label="${eye.short} K1 dioptres" />
          <span class="unit">@</span>
          <input id="${eye.id}K1Ax" class="row-input num short" type="text" inputmode="numeric" placeholder="°" aria-label="${eye.short} K1 axis" />
        </span>
      </div>
      <div class="row">
        <span class="row-label">${eye.short} K2</span>
        <span class="row-value">
          <input id="${eye.id}K2" class="row-input num short" type="text" inputmode="decimal" placeholder="D" aria-label="${eye.short} K2 dioptres" />
          <span class="unit">@</span>
          <input id="${eye.id}K2Ax" class="row-input num short" type="text" inputmode="numeric" placeholder="°" aria-label="${eye.short} K2 axis" />
        </span>
      </div>`).join("");
    $("k-fields").innerHTML = rows;
  }

  function buildChips() {
    $("symptomChips").innerHTML = SYMPTOMS.map(([key, label]) =>
      `<label class="chip"><input type="checkbox" data-symptom="${key}" /><span>${label}</span></label>`).join("");
    $("medicalChips").innerHTML = MEDICAL.map(([key, label]) =>
      `<label class="chip"><input type="checkbox" data-medical="${key}" /><span>${label}</span></label>`).join("");
  }

  function populateSelects() {
    const va = '<option value="">—</option>' + cfg.visualAcuity.map(v => `<option value="${v.snellen}">${v.decimal.toFixed(2)} = ${v.snellen}</option>`).join("");
    ["vaOd", "phOd", "vaOs", "phOs"].forEach(id => { $(id).innerHTML = va; });
    const add = '<option value="">None</option>' +
      Array.from({ length: 14 }, (_, i) => ((i + 1) * 0.25).toFixed(2)).map(v => `<option value="${v}">+${v}</option>`).join("");
    ["finalAdd", "previousAdd"].forEach(id => { $(id).innerHTML = add; });
  }

  // ------------------------------------------------------------------ reading values

  function rawText(id) {
    const el = $(id);
    return el ? el.value.trim().replace(",", ".") : "";
  }

  function parsed(id) {
    const t = rawText(id);
    if (t === "") return null;
    const n = Number(t.replace(/^[+−-]/, m => (m === "+" ? "" : "-")));
    return Number.isFinite(n) ? n : NaN;
  }

  function signedValue(id) {
    const n = parsed(id);
    if (n == null || Number.isNaN(n)) return n;
    const el = $(id);
    const typedSign = /^[+−-]/.test(rawText(id));
    const sign = typedSign ? Math.sign(n) || -1 : Number(el.dataset.sign || -1);
    const mag = Math.abs(n);
    return mag === 0 ? 0 : mag * sign;
  }

  function minusValue(id) {
    const n = parsed(id);
    if (n == null || Number.isNaN(n)) return n;
    return Math.abs(n) === 0 ? 0 : -Math.abs(n);
  }

  // Entry/notation only: neither prediction engine nor historical records are changed.
  function syncRxAxis(prefix) {
    const axis = $(`${prefix}Ax`);
    const cylinder = parsed(`${prefix}Cyl`);
    const optionalCylinder = /(?:Fin|Prev)$/.test(prefix);
    const sphereOnly = cylinder === 0 ||
      (optionalCylinder && cylinder == null && parsed(`${prefix}Sph`) != null);
    axis.disabled = sphereOnly;
    if (sphereOnly) {
      axis.value = "0";
      axis.classList.remove("invalid");
      axis.title = "Axis is 0° when cylinder is 0.00 D.";
    } else {
      if (axis.value === "0") axis.value = "";
      axis.removeAttribute("title");
    }
  }

  function syncPinhole(suffix) {
    const va = cfg.visualAcuity.find(v => v.snellen === $(`va${suffix}`).value);
    const cancelled = Boolean(va && va.decimal >= 1);
    const ph = $(`ph${suffix}`);
    ph.disabled = cancelled;
    ph.options[0].textContent = cancelled ? "Not needed · ≥20/20" : "—";
    if (cancelled) ph.value = "";
  }

  function syncEntryRules() {
    for (const eye of EYES) {
      for (const row of [...AR_ROWS.map(r => r.id), "Prev", "Fin"]) syncRxAxis(`${eye.id}${row}`);
      syncPinhole(eye.id === "od" ? "Od" : "Os");
    }
  }

  function normalizePredictionNotation(prediction) {
    if (!prediction) return;
    for (const eye of EYES) {
      const rx = prediction[eye.id];
      for (const r of [rx, rx.raw, ...Object.values(rx.candidates || {})]) {
        if (r && r.cylinder === 0) r.axis = 0;
      }
    }
  }

  function setSignedField(id, value) {
    const el = $(id);
    if (!el || value == null || !Number.isFinite(Number(value))) return;
    const n = Number(value);
    const sign = n > 0 ? 1 : -1;
    setFieldValue(el, Math.abs(n).toFixed(2));
    el.dataset.sign = String(sign);
    const button = document.querySelector(`.sign[data-target="${id}"]`);
    if (button) button.textContent = sign > 0 ? "+" : MINUS;
  }

  function setCylinderField(id, value) {
    const el = $(id);
    if (!el || value == null || !Number.isFinite(Number(value))) return;
    setFieldValue(el, Math.abs(Number(value)).toFixed(2));
  }

  // Preserve exact scanned values even when the ticket uses finer than 0.25 D steps.
  function setFieldValue(el, value) {
    if (el.tagName === "SELECT" && ![...el.options].some(o => o.value === value)) {
      el.add(new Option(value, value));
    }
    el.value = value;
  }

  function setPlainField(id, value, digits = null) {
    const el = $(id);
    if (!el || value == null || !Number.isFinite(Number(value))) return;
    setFieldValue(el, digits == null ? String(value) : Number(value).toFixed(digits));
  }

  function applyScannedEye(eye, parsedEye) {
    if (!parsedEye) return;
    (parsedEye.readings || []).slice(0, 3).forEach((reading, i) => {
      const p = `${eye}R${i + 1}`;
      setSignedField(`${p}Sph`, reading.sphere);
      setCylinderField(`${p}Cyl`, reading.cylinder);
      setPlainField(`${p}Ax`, reading.axis);
      if (reading.reliability != null) setPlainField(`${p}Q`, reading.reliability);
    });
    if (parsedEye.selected) {
      const p = `${eye}Sel`;
      setSignedField(`${p}Sph`, parsedEye.selected.sphere);
      setCylinderField(`${p}Cyl`, parsedEye.selected.cylinder);
      setPlainField(`${p}Ax`, parsedEye.selected.axis);
    }
  }

  function applyTicketScan(result) {
    applyScannedEye("od", result.od);
    applyScannedEye("os", result.os);
    if (result.instrument) {
      setPlainField("vertexMm", result.instrument.vertexMm, 2);
      setPlainField("pdDistance", result.instrument.pdDistanceMm);
      setPlainField("pdNear", result.instrument.pdNearMm);
    }
    if (result.near && result.near.workingDistanceCm != null) setPlainField("nearWd", result.near.workingDistanceCm * 10);
    syncEntryRules();
    document.querySelectorAll(".invalid").forEach(el => el.classList.remove("invalid"));
  }

  function scanProgressText(message) {
    if (!message || !message.status) return "Reading ticket…";
    if (message.status === "recognizing text" && Number.isFinite(message.progress)) {
      return `Reading ticket… ${Math.round(message.progress * 100)}%`;
    }
    if (/loading/i.test(message.status)) return "Loading scanner…";
    return "Reading ticket…";
  }

  async function scanTicketFile(file) {
    if (!ticketScan || !ticketScan.scanImage) {
      toast("Ticket scanner is unavailable. Manual entry still works.", true);
      return;
    }
    const btn = $("scanTicketBtn");
    const row = $("scanStatusRow");
    const status = $("scanStatus");
    btn.disabled = true;
    row.hidden = false;
    status.textContent = "Loading scanner…";
    try {
      const result = await ticketScan.scanImage(file, message => {
        status.textContent = scanProgressText(message);
      });
      const describe = eye => eye && eye.selected
        ? [eye.selected.sphere.toFixed(2), eye.selected.cylinder.toFixed(2), eye.selected.axis + "°"].join(" / ")
        : "Not recognized";
      const summary = ["Review these values against the photographed ticket:",
        "OD: " + describe(result.od), "OS: " + describe(result.os),
        ...(result.warnings || []), "Import recognized values into the examination form?"].join("\\n");
      if (!window.confirm(summary)) {
        status.textContent = "Cancelled · no values changed";
        return;
      }
      applyTicketScan(result);
      const warningCount = result.warnings ? result.warnings.length : 0;
      status.textContent = warningCount
        ? `Imported with ${warningCount} item${warningCount === 1 ? "" : "s"} to review`
        : "Imported · review values before locking";
      toast(warningCount ? "Ticket imported. Review highlighted/missing values." : "Ticket imported. Review values before locking.");
    } catch (err) {
      status.textContent = "Scan failed · use manual entry or try another photo";
      toast(err && err.message ? err.message : "Could not scan this ticket.", true);
    } finally {
      btn.disabled = false;
      $("ticketImageInput").value = "";
    }
  }

  function markInvalid(ids, errors, id, message) {
    ids.add(id);
    if (message) errors.push(message);
  }

  function readArRow(eye, row) {
    const p = `${eye}${row}`;
    const ids = [`${p}Sph`, `${p}Cyl`, `${p}Ax`];
    const filled = ids.some(id => rawText(id) !== "") || ($(`${p}Q`) && rawText(`${p}Q`) !== "");
    return {
      ids,
      filled,
      sphere: signedValue(`${p}Sph`),
      cylinder: minusValue(`${p}Cyl`),
      axis: parsed(`${p}Ax`),
      reliability: $(`${p}Q`) ? parsed(`${p}Q`) : null
    };
  }

  function validRx(r) {
    return [r.sphere, r.cylinder, r.axis].every(v => v != null && Number.isFinite(v)) &&
      (r.cylinder === 0 ? r.axis === 0 : r.axis >= 1 && r.axis <= 180) &&
      Math.abs(r.sphere) <= 30 && Math.abs(r.cylinder) <= 10;
  }

  function readSymptoms() {
    const symptoms = {};
    const labels = [];
    document.querySelectorAll("[data-symptom]").forEach(cb => {
      const key = cb.dataset.symptom;
      symptoms[key] = cb.checked;
      if (cb.checked) labels.push(SYMPTOMS.find(s => s[0] === key)[1]);
    });
    const otherText = $("symptomOtherText").value.trim();
    symptoms.otherText = otherText;
    if (symptoms.other && otherText) labels[labels.indexOf("Other")] = `Other: ${otherText}`;
    return { symptoms, labels };
  }

  function readMedical() {
    const medical = {};
    document.querySelectorAll("[data-medical]").forEach(cb => { medical[cb.dataset.medical] = cb.checked; });
    return medical;
  }

  function readKeratometry(eye) {
    const k = {
      k1D: parsed(`${eye}K1`), k1Axis: parsed(`${eye}K1Ax`),
      k2D: parsed(`${eye}K2`), k2Axis: parsed(`${eye}K2Ax`)
    };
    return Object.values(k).every(v => v == null) ? null : k;
  }

  function readCase() {
    syncEntryRules(); // Also excludes stale pinhole values at the save boundary.
    const errors = [];
    const invalid = new Set();

    const age = parsed("age");
    if (age == null || Number.isNaN(age) || age < 1 || age > 120) markInvalid(invalid, errors, "age", "Enter the patient's age.");

    const eyes = {};
    const extras = {};
    for (const eye of EYES) {
      const sel = readArRow(eye.id, "Sel");
      if (!validRx(sel)) {
        sel.ids.forEach(id => invalid.add(id));
        errors.push(`Enter the bracketed (selected) line for the ${eye.name.toLowerCase()}.`);
      }
      const readings = [];
      for (const row of AR_ROWS.filter(r => r.repeat)) {
        const r = readArRow(eye.id, row.id);
        if (!r.filled) continue;
        if (!validRx(r)) {
          r.ids.forEach(id => invalid.add(id));
          errors.push(`Complete or clear reading ${row.label} for ${eye.short}.`);
          continue;
        }
        readings.push({ sphere: r.sphere, cylinder: r.cylinder, axis: r.axis, reliability: Number.isFinite(r.reliability) ? r.reliability : null });
      }
      const suffix = eye.id === "od" ? "Od" : "Os";
      eyes[eye.id] = {
        sphere: sel.sphere,
        cylinder: sel.cylinder,
        axis: sel.axis,
        va: $(`va${suffix}`).value,
        pinhole: $(`ph${suffix}`).value
      };
      extras[eye.id] = { readings, keratometry: readKeratometry(eye.id) };
    }

    const optional = (id, min, max, label) => {
      const v = parsed(id);
      if (v == null) return null;
      if (Number.isNaN(v) || v < min || v > max) { markInvalid(invalid, errors, id, `${label} looks out of range.`); return null; }
      return v;
    };
    const instrument = {
      vertexMm: optional("vertexMm", 0, 25, "Vertex distance"),
      pdDistanceMm: optional("pdDistance", 40, 85, "Distance PD"),
      pdNearMm: optional("pdNear", 35, 85, "Near PD")
    };
    const near = {
      // UI is mm; the existing engine and historical observation schema use cm.
      workingDistanceCm: null,
      nearPointCm: null
    };
    const wdMm = optional("nearWd", 150, 1000, "Near working distance (150–1000 mm)");
    const npMm = optional("nearPoint", 50, 2000, "Near point (50–2000 mm)");
    if (wdMm != null) near.workingDistanceCm = wdMm / 10;
    if (npMm != null) near.nearPointCm = npMm / 10;

    let previousRx = null;
    if ($("previousRxKnown").dataset.value === "yes") {
      previousRx = {};
      for (const eye of EYES) {
        const p = `${eye.id}Prev`;
        const r = { sphere: signedValue(`${p}Sph`), cylinder: minusValue(`${p}Cyl`) ?? 0, axis: parsed(`${p}Ax`) };
        if (r.cylinder === 0) r.axis = 0;
        if (!validRx(r)) {
          [`${p}Sph`, `${p}Cyl`, `${p}Ax`].forEach(id => invalid.add(id));
          errors.push(`Enter the previous prescription for ${eye.short}.`);
        }
        previousRx[eye.id] = r;
      }
      previousRx.add = parsed("previousAdd");
      previousRx.wornMonths = optional("previousWornMonths", 0, 600, "Time wearing previous Rx (0–600 months)");
      if (previousRx.wornMonths != null && !Number.isInteger(previousRx.wornMonths)) {
        markInvalid(invalid, errors, "previousWornMonths", "Enter whole months, or leave duration unknown.");
      }
    }

    const symptomData = readSymptoms();
    const input = {
      caseId: $("caseTitle").dataset.caseId,
      age,
      symptom: symptomData.labels.join(", "),
      symptoms: symptomData.symptoms,
      medical: readMedical(),
      previousRxKnown: $("previousRxKnown").dataset.value,
      previousRx,
      od: eyes.od,
      os: eyes.os
    };
    const observations = { instrument, near, od: extras.od, os: extras.os };
    return { input, observations, errors, invalid };
  }

  function engineInput(input, observations) {
    return {
      ...input,
      instrument: observations.instrument,
      near: observations.near,
      od: { ...input.od, ...observations.od },
      os: { ...input.os, ...observations.os }
    };
  }

  function readActual() {
    syncEntryRules();
    const errors = [];
    const invalid = new Set();
    const actual = {};
    for (const eye of EYES) {
      const p = `${eye.id}Fin`;
      const r = { sphere: signedValue(`${p}Sph`), cylinder: minusValue(`${p}Cyl`), axis: parsed(`${p}Ax`) };
      if (r.cylinder === null && r.sphere != null) r.cylinder = 0;
      if (r.cylinder === 0) r.axis = 0;
      if (!validRx(r)) {
        [`${p}Sph`, `${p}Cyl`, `${p}Ax`].forEach(id => invalid.add(id));
        errors.push(`Enter your final Rx for the ${eye.name.toLowerCase()}.`);
      }
      actual[eye.id] = r;
    }
    actual.add = $("finalAdd").value === "" ? null : Number($("finalAdd").value);
    actual.note = $("finalNote").value.trim();
    return { actual, errors, invalid };
  }

  function showInvalid(ids) {
    document.querySelectorAll(".invalid").forEach(el => el.classList.remove("invalid"));
    ids.forEach(id => {
      const el = $(id);
      if (!el) return;
      (el.closest(".power") || el).classList.add("invalid");
    });
    const first = [...ids].map($).find(Boolean);
    if (first) first.focus({ preventScroll: false });
  }

  // ------------------------------------------------------------------ stage flow

  function setStage(stage) {
    state.stage = stage;
    document.body.dataset.stage = stage;
    $("measureSection").hidden = stage !== "measure";
    $("refractSection").hidden = stage === "measure";
    $("compareSection").hidden = stage !== "compare";
    $("refractSection").disabled = stage === "compare";

    const order = ["measure", "refract", "compare"];
    document.querySelectorAll(".stepper li").forEach(li => {
      const i = order.indexOf(li.dataset.step);
      const cur = order.indexOf(stage);
      li.classList.toggle("current", i === cur);
      li.classList.toggle("done", i < cur);
      li.querySelector(".step-dot").textContent = i < cur ? "✓" : String(i + 1);
    });

    $("primaryAction").textContent = { measure: "Lock Prediction", refract: "Reveal Comparison", compare: "Save Case" }[stage];
  }

  function lock() {
    const { input, observations, errors, invalid } = readCase();
    showInvalid(invalid);
    if (errors.length) {
      toast(errors[0], true);
      return;
    }
    try {
      state.run = engines.run(engineInput(input, observations));
      normalizePredictionNotation(state.run.primary.prediction);
      normalizePredictionNotation(state.run.shadow.prediction);
    } catch (err) {
      toast(err.message, true);
      return;
    }
    hideToast();
    state.input = input;
    state.observations = observations;
    const p = state.run.primary.prediction;
    const time = new Date(p.lockedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    $("lockedDetail").textContent = `${engineLabel(state.run.primary.id)} at ${time} · hidden until you reveal.`;
    setStage("refract");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reveal() {
    const { actual, errors, invalid } = readActual();
    showInvalid(invalid);
    if (errors.length) {
      toast(errors[0], true);
      return;
    }
    hideToast();
    const p = state.run.primary.prediction;
    state.actual = actual;
    state.comparison = {
      od: alg.compareEye(p.od, actual.od),
      os: alg.compareEye(p.os, actual.os),
      addError: actual.add == null ? null : actual.add - p.tentativeAdd
    };
    renderComparison();
    setStage("compare");
    $("compareSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function save() {
    const run = state.run;
    const record = {
      schema: "dioptra-case-3",
      entryRevision: "v04-rc-rx-duration-1",
      cohort: activeCfg.cohort,
      caseId: state.input.caseId,
      savedAt: new Date().toISOString(),
      input: state.input,
      prediction: run.primary.prediction,
      actual: state.actual,
      comparison: state.comparison,
      agreement: scoring.agreementCase(run.primary.prediction, state.actual),
      observations: state.observations,
      shadow: {
        shadowOnly: true,
        schema: "dioptra-shadow-1",
        primaryEngine: run.primary.id,
        shadowEngine: run.shadow.id,
        prediction: run.shadow.prediction,
        error: run.shadow.error
      }
    };
    store.saveCase(record);
    updateStats();
    resetForm();
    toast(`Saved ${record.caseId}`);
  }

  function primaryAction() {
    if (state.stage === "measure") lock();
    else if (state.stage === "refract") reveal();
    else save();
  }

  function resetForm() {
    state.input = state.observations = state.run = state.actual = state.comparison = null;
    $("casePanel").querySelectorAll("input").forEach(el => {
      if (el.type === "checkbox") el.checked = false;
      else el.value = "";
    });
    $("casePanel").querySelectorAll(".chip").forEach(c => c.classList.remove("on"));
    $("casePanel").querySelectorAll("select").forEach(el => { el.selectedIndex = 0; });
    $("casePanel").querySelectorAll(".field[data-sign]").forEach(el => { el.dataset.sign = "-1"; });
    $("casePanel").querySelectorAll(".sign:not(.static)").forEach(b => { b.textContent = MINUS; });
    document.querySelectorAll(".invalid").forEach(el => el.classList.remove("invalid"));
    setSegment($("previousRxKnown"), "");
    syncEntryRules();
    $("comparisonContent").innerHTML = "";
    $("kSection").open = false;
    $("scanStatusRow").hidden = true;
    $("scanStatus").textContent = "Ready";
    $("ticketImageInput").value = "";
    setCaseId(newCaseId());
    setStage("measure");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function newCaseId() {
    return "RX-" + String(store.listCases().length + 1).padStart(4, "0");
  }

  function setCaseId(id) {
    $("caseTitle").dataset.caseId = id;
    $("caseTitle").textContent = `Case ${id}`;
    $("navTitle").textContent = id;
  }

  function engineLabel(id) {
    const e = engines.ENGINES[id];
    return `v${e.version()}`;
  }

  // ------------------------------------------------------------------ comparison view

  function deltaPill(value, ok, kind = "power") {
    if (value == null || !Number.isFinite(value)) return `<span class="pill na">n/a</span>`;
    const text = kind === "axis" ? `${Math.round(value)}°` : fmtDelta(value);
    return `<span class="pill ${ok ? "ok" : "off"}">${text}</span>`;
  }

  function eyeTable(eye, pred, actual, title) {
    const s = scoring.scoreEye(pred, actual);
    const axisCell = s.axisApplicable
      ? `${deltaPill(s.axisError, s.axisWithinTolerance, "axis")}<span class="tol">±${s.axisTolerance}°</span>`
      : `<span class="pill na">n/a</span>`;
    return `
      <h2 class="group-header">${esc(title)}</h2>
      <div class="group">
        <div class="cmp">
          <span class="cmp-h">${eye.short}</span><span class="cmp-h">Dioptra</span><span class="cmp-h">You</span><span class="cmp-h" style="padding-right:16px">Δ</span>
          <span class="cmp-label">SPH</span><span class="cmp-v">${fmtPower(pred.sphere)}</span><span class="cmp-v">${fmtPower(actual.sphere)}</span><span class="cmp-d">${deltaPill(s.sphereError, s.within025Sphere)}</span>
          <span class="cmp-sep"></span>
          <span class="cmp-label">CYL</span><span class="cmp-v">${fmtPower(pred.cylinder)}</span><span class="cmp-v">${fmtPower(actual.cylinder)}</span><span class="cmp-d">${deltaPill(s.cylinderError, s.within025Cylinder)}</span>
          <span class="cmp-sep"></span>
          <span class="cmp-label">AXIS</span><span class="cmp-v">${fmtAxis(pred.axis)}</span><span class="cmp-v">${fmtAxis(actual.axis)}</span><span class="cmp-d">${axisCell}</span>
          <span class="cmp-sep"></span>
          <span class="cmp-label">SE</span><span class="cmp-v">${fmtPower(pred.sphere + pred.cylinder / 2)}</span><span class="cmp-v">${fmtPower(actual.sphere + actual.cylinder / 2)}</span><span class="cmp-d">${deltaPill(s.seError, s.within025SE)}</span>
        </div>
      </div>`;
  }

  function flagsFor(prediction) {
    if (!prediction || !["v0.3", "v0.4"].includes(prediction.engine)) return [];
    const list = [...(prediction.flags || [])];
    for (const eye of EYES) {
      for (const f of prediction[eye.id].flags) list.push({ ...f, eye: eye.short });
    }
    return list;
  }

  function flagsGroup(prediction, title) {
    if (!prediction || !["v0.3", "v0.4"].includes(prediction.engine)) return "";
    const flags = flagsFor(prediction);
    const items = flags.length
      ? flags.map(f => `
          <li><span class="flag-dot ${f.level === "review" ? "review" : "info"}">${f.level === "review" ? "!" : "i"}</span>
          <span class="flag-text"><strong>${esc(FLAG_TITLES[f.code] || f.code)}${f.eye ? ` · ${f.eye}` : ""}</strong><span>${esc(f.message)}</span></span></li>`).join("")
      : `<li><span class="flag-dot ok">✓</span><span class="flag-text"><strong>No flags</strong><span>Readings consistent; nothing to review.</span></span></li>`;
    return `<h2 class="group-header">${esc(title)}</h2><div class="group"><ul class="flag-list">${items}</ul></div>`;
  }

  function addGroup(prediction, actual) {
    const p = prediction.tentativeAdd;
    const ok = actual.add == null ? null : Math.abs(actual.add - p) <= 0.25 + 1e-9;
    const est = prediction.add && prediction.add.estimates;
    const amp = est && est.amplitudeBased != null ? `<div class="row"><span class="row-label">Amplitude-based estimate</span><span class="row-detail">${fmtPower(est.amplitudeBased)}</span></div>` : "";
    return `
      <h2 class="group-header">Near addition</h2>
      <div class="group">
        <div class="row"><span class="row-label">Dioptra</span><span class="row-detail num">${p ? fmtPower(p) : "None"}</span></div>
        <div class="row"><span class="row-label">You</span><span class="row-detail num">${actual.add == null ? "None" : fmtPower(actual.add)}</span></div>
        ${actual.add == null ? "" : `<div class="row"><span class="row-label">Difference</span>${deltaPill(actual.add - p, ok)}</div>`}
        ${amp}
      </div>`;
  }

  function candidatesGroup(v03p) {
    if (!v03p) return "";
    const names = { selected: "Selected", median: "Median", mostPlus: "Most plus" };
    const rows = Object.entries(names).map(([key, label]) => {
      const lines = EYES.map(eye => {
        const c = v03p[eye.id].candidates[key];
        const axis = c.cylinder === 0 ? "" : ` × ${Math.round(c.axis)}`;
        return `<span>${eye.short}&nbsp; ${fmtPower(c.sphere)} ${fmtPower(c.cylinder)}${axis}</span>`;
      }).join("");
      const used = v03p.od.estimator === key ? `<span class="badge">Used</span>` : "";
      return `<div class="row"><span class="row-label">${label} ${used}</span><span class="cand">${lines}</span></div>`;
    }).join("");
    return `<h2 class="group-header">${esc(v03p.engine)} estimators</h2><div class="group">${rows}</div>
      <p class="group-footer">All three are computed on every case so they can be compared once the cohort closes.</p>`;
  }

  function renderComparison() {
    const run = state.run;
    const p = run.primary.prediction;
    const a = state.actual;
    const primaryName = engineLabel(run.primary.id);
    const shadowPred = run.shadow.prediction;
    const agreement = scoring.agreementCase(p, a);
    let html = `<h2 class="group-header">Post-exam agreement · ${esc(primaryName)}</h2>
      <div class="group"><div class="row"><span class="row-label">Within tolerance</span><strong id="agreementScore">${agreement.percent}% · ${agreement.passed}/${agreement.total} checks</strong></div></div>
      <p class="group-footer">Agreement with your entered Rx—not clinical confidence or proof either Rx is correct. Each eye contributes sphere ±0.25 D, cylinder ±0.25 D and cylinder-dependent axis tolerance. Axis is excluded when either cylinder is zero. ADD is assessed separately; 100% does not mean an exact match.</p>`;
    html += EYES.map(eye => eyeTable(eye, p[eye.id], a[eye.id], `${eye.name} · ${primaryName}`)).join("");
    html += addGroup(p, a);
    const previous = state.input.previousRx;
    if (previous) {
      const duration = previous.wornMonths == null ? "Unknown" : previous.wornMonths === 0 ? "Less than 1 month" : `${previous.wornMonths} months`;
      html += `<h2 class="group-header">Habitual prescription context</h2><div class="group"><div class="row"><span class="row-label">Time wearing previous Rx</span><span class="row-detail">${duration}</span></div>`;
      for (const eye of EYES) {
        const before = previous[eye.id], after = a[eye.id];
        html += `<div class="row"><span class="row-label">${eye.short} final − previous SE</span><span class="row-detail">${fmtDelta(after.sphere + after.cylinder / 2 - before.sphere - before.cylinder / 2)} D</span></div>`;
      }
      html += `</div><p class="group-footer">Duration and change are context only. They do not alter the prediction or agreement score and do not explain limited visual improvement.</p>`;
    }

    html += flagsGroup(p, "RC limitations and review flags") + candidatesGroup(p);

    if (shadowPred) {
      const shadowName = engineLabel(run.shadow.id);
      const inner = EYES.map(eye => eyeTable(eye, shadowPred[eye.id], a[eye.id], `${eye.name} · ${shadowName}`)).join("") +
        flagsGroup(shadowPred, "Flags") + candidatesGroup(shadowPred);
      html += `
        <details class="shadow-block">
          <summary class="group row disclosure-row"><span class="row-label">Shadow engine</span><span class="row-detail">${shadowName}</span></summary>
          <p class="group-footer">Shown for information only. The study records the ${primaryName} result above.</p>
          <div class="shadow-inner">${inner}</div>
        </details>`;
    } else if (run.shadow.error) {
      html += `<p class="group-footer">Shadow engine could not run: ${esc(run.shadow.error)}</p>`;
    }
    $("comparisonContent").innerHTML = html;
  }

  // ------------------------------------------------------------------ study stats

  function scoresFor(cases, pick) {
    const out = [];
    for (const c of cases) {
      const pred = pick(c);
      if (!pred || !c.actual) continue;
      for (const eye of EYES) {
        if (pred[eye.id] && c.actual[eye.id]) out.push(scoring.scoreEye(pred[eye.id], c.actual[eye.id]));
      }
    }
    return out;
  }

  function updateStats() {
    const allCases = store.listCases();
    const cases = allCases.filter(c => c.cohort === activeCfg.cohort);
    const historical = allCases.length - cases.length;
    $("statsScope").textContent = `v0.4 RC prospective cohort · ${cases.length} cases${historical ? ` · ${historical} earlier cases retained in exports` : ""}`;
    const summary = scoring.summarize(scoresFor(cases, c => c.prediction));
    const exact = cases.flatMap(c => [c.comparison.od, c.comparison.os]).filter(e => e.exact).length;
    const eyes = cases.length * 2;
    $("stats").innerHTML = [
      [cases.length, "Cases"],
      [pct(summary.clinicalMatchRate), "Eyes matched"],
      [pct(summary.sphereWithin025Rate), "Sphere ±0.25 D"],
      [pct(summary.cylinderWithin025Rate), "Cylinder ±0.25 D"],
      [pct(summary.axisWithinToleranceRate), "Axis in tolerance"],
      [eyes ? pct(exact / eyes) : "—", "Exact eyes"]
    ].map(([value, label]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join("");

    renderEngineCompare(cases);
  }

  function predictionFor(c, id) {
    return [c.prediction, c.shadow && c.shadow.prediction].find(p => p &&
      (p.engine || "v" + p.version.split(".").slice(0, 2).join(".")) === id);
  }

  function renderEngineCompare(cases) {
    const paired = cases.filter(c => predictionFor(c, "v0.4") && predictionFor(c, "v0.3"));
    const variants = [["v0.4 RC · prospective", c => predictionFor(c, "v0.4"), true],
      ["v0.3 · paired shadow", c => predictionFor(c, "v0.3")]];
    for (const id of ["v0.4", "v0.3"]) for (const key of ["selected", "median", "mostPlus"]) {
      variants.push([`${id} ${key}`, c => candidateSet(c, key, id)]);
    }
    const rows = variants.map(([label, pick, primary]) => {
      const s = scoring.summarize(scoresFor(paired, pick));
      if (!s.eyes) return "";
      return `<tr class="${primary ? "primary-row" : ""}"><td>${label}</td><td class="col-eyes">${s.eyes}</td><td>${pct(s.clinicalMatchRate)}</td>
        <td>${fmtDelta(s.meanSEBias)}</td><td>${s.meanAbsSEError == null ? "—" : s.meanAbsSEError.toFixed(2)}</td>
        <td>${s.meanVectorError == null ? "—" : s.meanVectorError.toFixed(2)}</td></tr>`;
    }).join("");
    $("engineCompareDetail").textContent = cases.length ? `${paired.length}/${cases.length} paired RC cases` : "No RC cases yet";
    $("engineCompare").innerHTML = rows
      ? `<table><thead><tr><th>Engine</th><th class="col-eyes">Eyes</th><th>Match</th><th>Bias</th><th>|SE|</th><th>Vector</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="empty">Saved cases will appear here.</p>`;
  }

  function candidateSet(c, key, id) {
    const p = predictionFor(c, id);
    if (!p) return null;
    return { od: p.od.candidates[key], os: p.os.candidates[key] };
  }

  // ------------------------------------------------------------------ dialogs, toast, export

  let toastTimer = null;
  function hideToast() {
    clearTimeout(toastTimer);
    $("toast").classList.remove("show");
  }

  function toast(message, isError = false) {
    const el = $("toast");
    el.textContent = message;
    el.classList.toggle("error", isError);
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), isError ? 3200 : 2200);
  }

  function ask({ title, message = "", actions }) {
    const dialog = $("dialog");
    $("dialogTitle").textContent = title;
    $("dialogMessage").textContent = message;
    $("dialogActions").innerHTML = actions
      .map(a => `<button value="${a.id}" class="${a.style || ""}">${esc(a.label)}</button>`).join("");
    return new Promise(resolve => {
      const done = () => {
        dialog.removeEventListener("close", done);
        resolve(dialog.returnValue || "cancel");
      };
      dialog.returnValue = "";
      dialog.addEventListener("close", done);
      dialog.showModal();
    });
  }

  function download(name, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportData() {
    const cases = store.listCases();
    if (!cases.length) {
      toast("No saved cases yet.");
      return;
    }
    const choice = await ask({
      title: "Export",
      message: `${cases.length} case${cases.length === 1 ? "" : "s"} on this device.`,
      actions: [
        { id: "study", label: "Study CSV" },
        { id: "shadow", label: "Engine Comparison CSV" },
        { id: "cancel", label: "Cancel", style: "cancel" }
      ]
    });
    const date = new Date().toISOString().slice(0, 10);
    if (choice === "study") download(`project-dioptra-${date}.csv`, store.toCSV(cases));
    if (choice === "shadow") download(`project-dioptra-shadow-${date}.csv`, store.toShadowCSV(cases));
  }

  async function clearData() {
    const n = store.listCases().length;
    if (!n) {
      toast("No saved cases.");
      return;
    }
    const choice = await ask({
      title: `Delete ${n} case${n === 1 ? "" : "s"}?`,
      message: "This removes every case stored on this device. Export first if you need them.",
      actions: [
        { id: "delete", label: "Delete", style: "destructive" },
        { id: "cancel", label: "Cancel", style: "cancel" }
      ]
    });
    if (choice !== "delete") return;
    store.clearCases();
    updateStats();
    resetForm();
    toast("All cases deleted.");
  }

  async function newCase() {
    const dirty = state.stage !== "measure" ||
      $("previousRxKnown").dataset.value !== "" ||
      [...document.querySelectorAll("#measureSection input, #measureSection select")].some(el => (el.type === "checkbox" ? el.checked : el.value.trim() !== ""));
    if (dirty) {
      const choice = await ask({
        title: "Discard this case?",
        message: state.stage === "measure" ? "The values you entered will be cleared." : "The locked prediction has not been saved.",
        actions: [
          { id: "discard", label: "Discard", style: "destructive" },
          { id: "cancel", label: "Keep Editing", style: "cancel" }
        ]
      });
      if (choice !== "discard") return;
    }
    resetForm();
  }

  // ------------------------------------------------------------------ controls

  function setSegment(el, value) {
    el.dataset.value = value;
    el.querySelectorAll("button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.value === value)));
    if (el.id === "previousRxKnown") {
      $("previousRxFields").hidden = value !== "yes";
      $("previousRxFields").disabled = value !== "yes";
    }
  }

  function bindControls() {
    document.addEventListener("click", e => {
      const sign = e.target.closest(".sign:not(.static)");
      if (sign) {
        const input = $(sign.dataset.target);
        const positive = Number(input.dataset.sign || -1) < 0;
        input.dataset.sign = positive ? "1" : "-1";
        sign.textContent = positive ? "+" : MINUS;
        // carry the sign to empty sphere fields of the same eye, so repeats need one tap
        const row = sign.closest(".rx-row");
        if (row && row.closest(".rx-table:not(.final)")) {
          row.parentElement.querySelectorAll(".rx-row .sign:not(.static)").forEach(other => {
            const target = $(other.dataset.target);
            if (other !== sign && target.value.trim() === "") {
              target.dataset.sign = input.dataset.sign;
              other.textContent = sign.textContent;
            }
          });
        }
        input.focus();
        return;
      }
      const seg = e.target.closest(".segmented button");
      if (seg) setSegment(seg.parentElement, seg.dataset.value);
    });

    document.addEventListener("change", e => {
      if (/^(od|os)(R[123]|Sel|Prev|Fin)(Sph|Cyl)$/.test(e.target.id)) {
        syncRxAxis(e.target.id.replace(/(Sph|Cyl)$/, ""));
      }
      if (/^va(Od|Os)$/.test(e.target.id)) syncPinhole(e.target.id.slice(2));
      const chip = e.target.closest(".chip");
      if (chip) chip.classList.toggle("on", e.target.checked);
      (e.target.closest(".power") || e.target).classList.remove("invalid");
    });

    document.addEventListener("input", e => {
      const box = e.target.closest(".invalid") || (e.target.classList.contains("invalid") ? e.target : null);
      if (box) box.classList.remove("invalid");
    });

    // Enter moves to the next field, like a numeric keypad workflow.
    document.addEventListener("keydown", e => {
      if (e.key !== "Enter" || !e.target.matches("input.field, input.row-input")) return;
      e.preventDefault();
      const fields = [...document.querySelectorAll("fieldset:not([hidden]) input.field, fieldset:not([hidden]) input.row-input, fieldset:not([hidden]) select")]
        .filter(el => !el.disabled && el.offsetParent !== null);
      const next = fields[fields.indexOf(e.target) + 1];
      if (next) next.focus();
    });

    const navbar = $("navbar");
    const onScroll = () => navbar.classList.toggle("scrolled", window.scrollY > 36);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    $("scanTicketBtn").addEventListener("click", () => $("ticketImageInput").click());
    $("ticketImageInput").addEventListener("change", e => {
      const file = e.target.files && e.target.files[0];
      if (file) scanTicketFile(file);
    });

    $("primaryAction").addEventListener("click", primaryAction);
    $("newCaseBtn").addEventListener("click", newCase);
    $("exportBtn").addEventListener("click", exportData);
    $("clearDataBtn").addEventListener("click", clearData);
  }

  // ------------------------------------------------------------------ init

  buildArTables();
  buildFinalTables();
  buildKeratometry();
  buildChips();
  populateSelects();
  syncEntryRules();
  bindControls();
  setSegment($("previousRxKnown"), "");
  setCaseId(newCaseId());

  $("engineLine").textContent = `Experimental ${engineLabel(engines.primaryId())} · unvalidated · v0.3 shadow comparator`;

  setStage("measure");
  updateStats();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
