// Shared prescription entry: one set of builders and readers for every workspace,
// so Clinical Study and Genius look, behave and validate the same way.
(function () {
  const $ = id => document.getElementById(id);
  const MINUS = "−";

  // Autorefractor ticket rows: three repeats and the bracketed (selected) line.
  const AR_ROWS = [
    { id: "R1", label: "1", repeat: true },
    { id: "R2", label: "2", repeat: true },
    { id: "R3", label: "3", repeat: true },
    { id: "Sel", label: "‹ ›", repeat: false }
  ];

  // Short titles for engine review flags, shared by every workspace.
  const FLAG_TITLES = Object.freeze({
    UNVALIDATED: "Not clinically validated",
    EXPERIMENTAL_RC: "Experimental release candidate",
    ADD_AT_CAP: "ADD at the cap",
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
  });

  // ---------------------------------------------------------------- formatting

  function fmtPower(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const x = Number(n);
    if (Math.abs(x) < 1e-9) return "0.00";
    return (x > 0 ? "+" : MINUS) + Math.abs(x).toFixed(2);
  }

  function fmtAxis(n, pad = false) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const a = String(Math.round(Number(n)));
    return `${pad ? a.padStart(3, "0") : a}°`;
  }

  function fmtRx(rx) {
    if (!rx) return "—";
    if (Number(rx.cylinder) === 0) return `${fmtPower(rx.sphere)} DS`;
    return `${fmtPower(rx.sphere)} ${fmtPower(rx.cylinder)} × ${fmtAxis(rx.axis, true)}`;
  }

  // Typographic minus for display only. Copied text keeps ASCII so it pastes anywhere.
  function displayMinus(text) {
    return String(text).replace(/(^|[\s(])-(?=\d)/g, `$1${MINUS}`);
  }

  // ---------------------------------------------------------------- builders

  function powerField(id, signed, label) {
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

  function reliabilityField(id, label) {
    const options = Array.from({ length: 10 }, (_, i) => `<option value="${i}">${i}</option>`).join("");
    return `<select id="${id}" class="field" aria-label="${label}"><option value="">—</option>${options}</select>`;
  }

  // prefix: id stem for one eye, e.g. "od" -> odR1Sph … odSelAx.
  function arTableHTML(prefix, eyeShort, labelFor) {
    const rows = AR_ROWS.map(row => {
      const p = `${prefix}${row.id}`;
      const name = row.repeat ? `reading ${row.label}` : "selected";
      return `
        <div class="rx-row${row.repeat ? "" : " selected"}" data-row="${row.id}">
          <span class="rx-row-label" title="${row.repeat ? "Reading " + row.label : "Selected line (required)"}">${row.label}</span>
          ${powerField(p + "Sph", true, labelFor ? labelFor(p + "Sph", true) : `${eyeShort} ${name} sphere`)}
          ${powerField(p + "Cyl", false, labelFor ? labelFor(p + "Cyl", false) : `${eyeShort} ${name} cylinder`)}
          ${axisField(p + "Ax", `${eyeShort} ${name} axis`)}
          ${row.repeat ? reliabilityField(`${p}Q`, `${eyeShort} reading ${row.label} reliability`) : "<span></span>"}
        </div>`;
    }).join("");
    return `<div class="rx-head"><span></span><span>SPH</span><span>CYL</span><span>AXIS</span><span title="Reliability">Q</span></div>${rows}`;
  }

  // A single S/C/A row (final, previous, endpoint, refined…).
  function rxRowHTML(prefix, eyeShort, kind, step = 1, labelFor) {
    return `
      <div class="rx-head"><span></span><span>SPH</span><span>CYL</span><span>AXIS</span></div>
      <div class="rx-row">
        <span class="rx-row-label">${eyeShort}</span>
        ${powerField(prefix + "Sph", true, labelFor ? labelFor(prefix + "Sph", true) : `${eyeShort} ${kind} sphere`)}
        ${powerField(prefix + "Cyl", false, labelFor ? labelFor(prefix + "Cyl", false) : `${eyeShort} ${kind} cylinder`)}
        ${axisField(prefix + "Ax", `${eyeShort} ${kind} axis`, step)}
      </div>`;
  }

  function vaOptionsHTML(emptyLabel = "—") {
    return `<option value="">${emptyLabel}</option>` + window.DIOPTRA_CONFIG.visualAcuity
      .map(v => `<option value="${v.snellen}">${v.decimal.toFixed(2)} = ${v.snellen}</option>`).join("");
  }

  function addOptionsHTML(emptyLabel = "None") {
    return `<option value="">${emptyLabel}</option>` +
      Array.from({ length: 14 }, (_, i) => ((i + 1) * 0.25).toFixed(2)).map(v => `<option value="${v}">+${v}</option>`).join("");
  }

  // ---------------------------------------------------------------- reading

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
    const typedSign = /^[+−-]/.test(rawText(id));
    const sign = typedSign ? Math.sign(n) || -1 : Number($(id).dataset.sign || -1);
    const mag = Math.abs(n);
    return mag === 0 ? 0 : mag * sign;
  }

  function minusValue(id) {
    const n = parsed(id);
    if (n == null || Number.isNaN(n)) return n;
    return Math.abs(n) === 0 ? 0 : -Math.abs(n);
  }

  function validRx(r) {
    return [r.sphere, r.cylinder, r.axis].every(v => v != null && Number.isFinite(v)) &&
      (r.cylinder === 0 ? r.axis === 0 : r.axis >= 1 && r.axis <= 180) &&
      Math.abs(r.sphere) <= 30 && Math.abs(r.cylinder) <= 10;
  }

  function readArRow(prefix) {
    const ids = [`${prefix}Sph`, `${prefix}Cyl`, `${prefix}Ax`];
    const filled = ids.some(id => rawText(id) !== "") || ($(`${prefix}Q`) && rawText(`${prefix}Q`) !== "");
    return {
      ids,
      filled,
      sphere: signedValue(`${prefix}Sph`),
      cylinder: minusValue(`${prefix}Cyl`),
      axis: parsed(`${prefix}Ax`),
      reliability: $(`${prefix}Q`) ? parsed(`${prefix}Q`) : null
    };
  }

  // Prescriptions where a blank cylinder means sphere only (final, previous, endpoint, refined).
  function readOptionalCylRx(prefix) {
    const r = { sphere: signedValue(`${prefix}Sph`), cylinder: minusValue(`${prefix}Cyl`), axis: parsed(`${prefix}Ax`) };
    if (r.cylinder === null && r.sphere != null) r.cylinder = 0;
    if (r.cylinder === 0) r.axis = 0;
    return r;
  }

  // ---------------------------------------------------------------- entry rules

  // Entry/notation only: a zero (or, where optional, blank) cylinder has axis 0.
  function syncRxAxis(prefix, optionalCylinder) {
    const axis = $(`${prefix}Ax`);
    if (!axis) return;
    const cylinder = parsed(`${prefix}Cyl`);
    const sphereOnly = cylinder === 0 || (optionalCylinder && cylinder == null && parsed(`${prefix}Sph`) != null);
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

  // ---------------------------------------------------------------- writing

  // Preserve exact scanned values even when the ticket uses finer than 0.25 D steps.
  function setFieldValue(el, value) {
    if (el.tagName === "SELECT" && ![...el.options].some(o => o.value === value)) el.add(new Option(value, value));
    el.value = value;
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

  function setPlainField(id, value, digits = null) {
    const el = $(id);
    if (!el || value == null || !Number.isFinite(Number(value))) return;
    setFieldValue(el, digits == null ? String(value) : Number(value).toFixed(digits));
  }

  function clearRxRow(prefix) {
    const sphere = $(prefix + "Sph");
    if (!sphere) return;
    setFieldValue(sphere, "");
    sphere.dataset.sign = "-1";
    const sign = document.querySelector(`.sign[data-target="${prefix}Sph"]`);
    if (sign) sign.textContent = MINUS;
    setFieldValue($(prefix + "Cyl"), "");
    setFieldValue($(prefix + "Ax"), "");
    if ($(prefix + "Q")) setFieldValue($(prefix + "Q"), "");
  }

  // Applies one eye of a parsed autorefractor ticket to an AR table.
  function applyScannedEye(prefix, parsedEye) {
    if (!parsedEye) return;
    for (const row of AR_ROWS) clearRxRow(prefix + row.id);
    (parsedEye.readings || []).slice(0, 3).forEach((reading, i) => {
      const p = `${prefix}R${i + 1}`;
      setSignedField(`${p}Sph`, reading.sphere);
      setCylinderField(`${p}Cyl`, reading.cylinder);
      setPlainField(`${p}Ax`, reading.axis);
      if (reading.reliability != null) setPlainField(`${p}Q`, reading.reliability);
    });
    if (parsedEye.selected) {
      const p = `${prefix}Sel`;
      setSignedField(`${p}Sph`, parsedEye.selected.sphere);
      setCylinderField(`${p}Cyl`, parsedEye.selected.cylinder);
      setPlainField(`${p}Ax`, parsedEye.selected.axis);
    }
  }

  // The confirmation text shown before a scanned ticket is imported.
  function scanSummary(result) {
    const describe = eye => eye && eye.selected
      ? [eye.selected.sphere.toFixed(2), eye.selected.cylinder.toFixed(2), eye.selected.axis + "°"].join(" / ")
      : "Not recognized";
    const pd = result.instrument || {};
    return ["Review these values against the photographed ticket:",
      "OD: " + describe(result.od) + " · " + result.od.readings.length + "/3 repeats",
      "OS: " + describe(result.os) + " · " + result.os.readings.length + "/3 repeats",
      "PD: distance " + (pd.pdDistanceMm == null ? "not recognized" : pd.pdDistanceMm + " mm") +
        " · near " + (pd.pdNearMm == null ? "not recognized" : pd.pdNearMm + " mm"),
      ...(result.warnings || []), "Import recognized values into the form?"].join("\n");
  }

  function scanProgressText(message) {
    if (!message || !message.status) return "Reading ticket…";
    if (message.status === "recognizing text" && Number.isFinite(message.progress)) {
      return `Reading ticket… ${Math.round(message.progress * 100)}%`;
    }
    if (/loading/i.test(message.status)) return "Loading scanner…";
    return "Reading ticket…";
  }

  window.OculiRx = Object.freeze({
    MINUS, AR_ROWS, FLAG_TITLES,
    fmtPower, fmtAxis, fmtRx, displayMinus,
    powerField, axisField, arTableHTML, rxRowHTML, vaOptionsHTML, addOptionsHTML,
    rawText, parsed, signedValue, minusValue, validRx, readArRow, readOptionalCylRx,
    syncRxAxis, setFieldValue, setSignedField, setCylinderField, setPlainField, clearRxRow,
    applyScannedEye, scanSummary, scanProgressText
  });
})();
