// Genius: guided refraction preview. Screen → propose → verify in a trial frame → one-page preview,
// saved as a PDF or printed. Nothing here is saved, and nothing reaches the Clinical Study.
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const Rx = window.OculiRx;
  const engine = window.DioptraEngineV03; // prior offset (−0.25 D); Beryl's fitted offset belongs to one instrument and examiner
  const ENGINE_NOTE = "prior offset";
  const MODEL_LABEL = "Oculi Model";
  const MIN_AGE = 18;
  const LARGE_CHANGE_D = 0.75;
  const EYES = [{ id: "od", key: "Od", short: "OD", name: "Right eye" }, { id: "os", key: "Os", short: "OS", name: "Left eye" }];
  const SYMPTOMS = [["geniusBlurredVision", "Blurred vision"], ["geniusHeadache", "Headache"], ["geniusGlare", "Glare / halos"],
    ["geniusTearing", "Tearing"], ["geniusIrritation", "Burning / irritation"], ["geniusItching", "Itching"],
    ["geniusDischarge", "Discharge"], ["geniusDryEye", "Dry eye"]];
  const MEDICAL = [["geniusDiabetes", "Diabetes"], ["geniusHypertension", "Hypertension"], ["geniusPregnancy", "Pregnancy"]];
  const GENIUS_FLAG_TITLES = {
    FIRST_GLASSES: "First glasses",
    LARGE_CHANGE: "Large change from current glasses",
    UNSTABLE_RX: "Refraction may fluctuate",
    CHECK_ADD: "Check the ADD at near"
  };

  let proposal = null; // { prediction, flags, context }

  // ---------------------------------------------------------------- build

  function build() {
    for (const eye of EYES) {
      $(`genius-ar-${eye.id}`).innerHTML = Rx.arTableHTML(`genius${eye.key}`, eye.short);
      $(`genius-prev-${eye.id}`).innerHTML = Rx.rxRowHTML(`genius${eye.key}Prev`, eye.short, "current glasses");
      $(`genius-ref-${eye.id}`).innerHTML = Rx.rxRowHTML(`genius${eye.key}Ref`, eye.short, "refined");
    }
    ["geniusVaOd", "geniusVaOs", "geniusVaOu"].forEach(id => { $(id).innerHTML = Rx.vaOptionsHTML(); });
    ["geniusPrevAdd", "geniusRefAdd"].forEach(id => { $(id).innerHTML = Rx.addOptionsHTML(); });
    syncAxes();
  }

  function syncAxes() {
    for (const eye of EYES) {
      for (const row of [...Rx.AR_ROWS.map(r => r.id), "Prev", "Ref"]) Rx.syncRxAxis(`genius${eye.key}${row}`, row === "Prev" || row === "Ref");
    }
  }

  // ---------------------------------------------------------------- state

  function setStep(step) {
    const order = ["screen", "propose", "verify"];
    const cur = order.indexOf(step);
    document.querySelectorAll("#geniusStepper li").forEach(li => {
      const i = order.indexOf(li.dataset.step);
      li.classList.toggle("current", i === cur);
      li.classList.toggle("done", i < cur);
      li.querySelector(".step-dot").textContent = i < cur ? "✓" : String(i + 1);
    });
  }

  function hidePreview() {
    $("geniusPrescription").hidden = true;
    if (proposal) setStep("propose");
  }

  function invalidate() {
    proposal = null;
    $("geniusResults").hidden = true;
    $("geniusStop").hidden = true;
    $("geniusPrescription").hidden = true;
    $("geniusError").textContent = "";
    $("geniusVerifyError").textContent = "";
    setStep("screen");
  }

  function segment(id, value) {
    const el = $(id);
    el.dataset.value = value;
    el.querySelectorAll("button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.value === value)));
  }

  function resetVerification() {
    ["geniusVaOd", "geniusVaOs", "geniusVaOu", "geniusRefAdd"].forEach(id => { $(id).value = ""; });
    ["geniusNear", "geniusPlusTest", "geniusOutcome"].forEach(id => segment(id, ""));
    for (const eye of EYES) Rx.clearRxRow(`genius${eye.key}Ref`);
    toggleRefine(false);
  }

  function toggleRefine(on) {
    $("geniusRefineFields").hidden = !on;
    $("geniusRefineFields").disabled = !on;
  }

  // ---------------------------------------------------------------- reading

  function checked(entries) {
    return entries.filter(([id]) => $(id).checked).map(([, label]) => label);
  }

  function context() {
    const symptoms = checked(SYMPTOMS);
    const other = $("geniusOtherSymptoms").value.trim();
    if (other) symptoms.push(other);
    return { medical: checked(MEDICAL), symptoms };
  }

  function optionalNumber(id, min, max, label) {
    const v = Rx.parsed(id);
    if (v == null) return null;
    if (Number.isNaN(v) || v < min || v > max) throw new Error(`${label} looks out of range.`);
    return v;
  }

  function readEyeTicket(eye) {
    const sel = Rx.readArRow(`genius${eye.key}Sel`);
    if (!Rx.validRx(sel)) throw new Error(`Enter the bracketed (selected) line for the ${eye.name.toLowerCase()}.`);
    const readings = [];
    for (const row of Rx.AR_ROWS.filter(r => r.repeat)) {
      const r = Rx.readArRow(`genius${eye.key}${row.id}`);
      if (!r.filled) continue;
      if (!Rx.validRx(r)) throw new Error(`Complete or clear reading ${row.label} for ${eye.short}.`);
      readings.push({ sphere: r.sphere, cylinder: r.cylinder, axis: r.axis, reliability: Number.isFinite(r.reliability) ? r.reliability : null });
    }
    return { sphere: sel.sphere, cylinder: sel.cylinder, axis: sel.axis, readings };
  }

  function readCurrentGlasses() {
    const glasses = $("geniusGlasses").dataset.value;
    if (!glasses) throw new Error("Choose whether the patient wears glasses.");
    if (glasses !== "yes") return null;
    const out = {};
    for (const eye of EYES) {
      const r = Rx.readOptionalCylRx(`genius${eye.key}Prev`);
      if (!Rx.validRx(r)) throw new Error(`Enter the current glasses for the ${eye.name.toLowerCase()}, or choose None.`);
      out[eye.id] = r;
    }
    out.add = $("geniusPrevAdd").value === "" ? null : Number($("geniusPrevAdd").value);
    return out;
  }

  // ---------------------------------------------------------------- flags

  function engineFlags(prediction) {
    const list = prediction.flags.map(f => ({ ...f }));
    for (const eye of EYES) for (const f of prediction[eye.id].flags) list.push({ ...f, eye: eye.short });
    return list;
  }

  function geniusFlags(prediction, current, ctx) {
    const flags = [];
    if (!current) {
      flags.push({ code: "FIRST_GLASSES", level: "review", message: "A full eye exam is recommended before first glasses are made." });
    } else {
      for (const eye of EYES) {
        const a = engine.powerVector(engine.toMinusCylinder(current[eye.id]));
        const b = engine.powerVector(engine.toMinusCylinder(prediction[eye.id]));
        const dM = b.M - a.M;
        const dAstig = 2 * Math.hypot(b.J0 - a.J0, b.J45 - a.J45);
        if (Math.abs(dM) >= LARGE_CHANGE_D - 1e-9 || dAstig >= LARGE_CHANGE_D - 1e-9) {
          const parts = [];
          if (Math.abs(dM) >= LARGE_CHANGE_D - 1e-9) parts.push(`spherical equivalent by ${Rx.fmtPower(dM)} D`);
          if (dAstig >= LARGE_CHANGE_D - 1e-9) parts.push(`astigmatism by ${dAstig.toFixed(2)} D`);
          flags.push({ code: "LARGE_CHANGE", level: "review", eye: eye.short,
            message: `Changes ${parts.join(" and ")} from the current glasses. Consider part of the change now and a review at 3 months.` });
        }
      }
    }
    if (ctx.medical.includes("Diabetes") || ctx.medical.includes("Pregnancy")) {
      flags.push({ code: "UNSTABLE_RX", level: "review", message: "Diabetes and pregnancy can shift the refraction for a while. Recheck before dispensing if the Rx changed." });
    }
    if (prediction.tentativeAdd > 0) {
      flags.push({ code: "CHECK_ADD", level: "review", message: "The age table is a starting point. Confirm the ADD at the patient's own reading distance." });
    }
    return [...flags, ...engineFlags(prediction)];
  }

  function flagTitle(f) {
    return (GENIUS_FLAG_TITLES[f.code] || Rx.FLAG_TITLES[f.code] || f.code) + (f.eye ? ` · ${f.eye}` : "");
  }

  function renderFlags(flags) {
    const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    $("geniusFlags").innerHTML = flags.map(f => `
      <li><span class="flag-dot ${f.level === "review" ? "review" : "info"}">${f.level === "review" ? "!" : "i"}</span>
      <span class="flag-text"><strong>${esc(flagTitle(f))}</strong><span>${esc(f.message)}</span></span></li>`).join("");
  }

  // ---------------------------------------------------------------- propose

  function addText(add) {
    return add == null ? "Not estimated" : add > 0 ? `${Rx.fmtPower(add)} D` : "None";
  }

  function stop(reasons) {
    $("geniusStopReason").textContent = reasons.join(" ");
    $("geniusStop").hidden = false;
    setStep("screen");
    $("geniusStop").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function propose(event) {
    event.preventDefault();
    invalidate();
    try {
      const ageText = $("geniusAge").value.trim();
      if (!/^\d{1,3}$/.test(ageText) || Number(ageText) < 1 || Number(ageText) > 120) throw new Error("Enter an age from 1 to 120.");
      const age = Number(ageText);
      const warnings = [...document.querySelectorAll("#geniusWarnings input:checked")].map(cb => cb.dataset.warning);
      const reasons = [];
      if (warnings.length) reasons.push(`Warning signs reported: ${warnings.join(", ").toLowerCase()}.`);
      if (age < MIN_AGE) reasons.push(`Genius is for adults. Under ${MIN_AGE}, refraction needs a full eye exam.`);
      if (reasons.length) { stop(reasons); return; }

      const current = readCurrentGlasses();
      const od = readEyeTicket(EYES[0]);
      const os = readEyeTicket(EYES[1]);
      const instrument = {
        vertexMm: 12,
        pdDistanceMm: optionalNumber("geniusPdDistance", 40, 85, "Distance PD"),
        pdNearMm: optionalNumber("geniusPdNear", 35, 85, "Near PD")
      };
      const wdMm = optionalNumber("geniusNearWd", 250, 1000, "Working distance (250–1000 mm)");
      const prediction = engine.predictCase({ age, instrument, near: { workingDistanceCm: wdMm == null ? null : wdMm / 10 }, od, os });
      for (const eye of EYES) if (prediction[eye.id].cylinder === 0) prediction[eye.id].axis = 0;
      const ctx = context();
      proposal = { prediction, current, ctx, age, instrument, flags: geniusFlags(prediction, current, ctx) };
      renderProposal();
    } catch (error) {
      $("geniusError").textContent = error.message;
    }
  }

  function renderProposal() {
    const p = proposal.prediction;
    $("geniusVersion").textContent = `v${p.version} · ${ENGINE_NOTE}`;
    $("geniusOdResult").textContent = Rx.fmtRx(p.od);
    $("geniusOsResult").textContent = Rx.fmtRx(p.os);
    $("geniusAddResult").textContent = addText(p.tentativeAdd);
    renderFlags(proposal.flags);
    resetVerification();
    $("geniusNearRow").hidden = !(p.tentativeAdd > 0);
    $("geniusResults").hidden = false;
    setStep("propose");
    $("geniusResults").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------------------------------------------------------------- verify

  function prefillRefined() {
    const p = proposal.prediction;
    for (const eye of EYES) {
      const prefix = `genius${eye.key}Ref`;
      if (Rx.rawText(prefix + "Sph") !== "") continue;
      Rx.setSignedField(prefix + "Sph", p[eye.id].sphere);
      Rx.setCylinderField(prefix + "Cyl", p[eye.id].cylinder);
      Rx.setPlainField(prefix + "Ax", p[eye.id].cylinder === 0 ? 0 : p[eye.id].axis);
    }
    if ($("geniusRefAdd").value === "" && p.tentativeAdd > 0) Rx.setFieldValue($("geniusRefAdd"), p.tentativeAdd.toFixed(2));
    syncAxes();
  }

  function readVerification() {
    const p = proposal.prediction;
    const va = { od: $("geniusVaOd").value, os: $("geniusVaOs").value, ou: $("geniusVaOu").value };
    if (!va.od || !va.os) throw new Error("Enter the VA each eye reaches through the proposed Rx.");
    const near = $("geniusNear").dataset.value || null;
    if (p.tentativeAdd > 0 && !near) throw new Error("Check near vision with the ADD.");
    const outcome = $("geniusOutcome").dataset.value;
    if (!outcome) throw new Error("Choose whether the proposed Rx was accepted or refined.");
    let rx = { od: p.od, os: p.os, add: p.tentativeAdd > 0 ? p.tentativeAdd : null };
    if (outcome === "refined") {
      rx = {};
      for (const eye of EYES) {
        const r = Rx.readOptionalCylRx(`genius${eye.key}Ref`);
        if (!Rx.validRx(r)) throw new Error(`Enter the refined Rx for the ${eye.name.toLowerCase()}.`);
        rx[eye.id] = r;
      }
      rx.add = $("geniusRefAdd").value === "" ? null : Number($("geniusRefAdd").value);
    } else if (near === "not") {
      throw new Error("Near was not comfortable. Choose Refined and adjust the ADD.");
    }
    return { va, near, plusTest: $("geniusPlusTest").dataset.value || null, outcome, rx };
  }

  function renderPrescriptionEye(suffix, rx) {
    $("geniusPrescriptionSphere" + suffix).textContent = Rx.fmtPower(rx.sphere);
    $("geniusPrescriptionCylinder" + suffix).textContent = Rx.fmtPower(rx.cylinder);
    $("geniusPrescriptionAxis" + suffix).textContent = rx.cylinder === 0 ? "—" : Rx.fmtAxis(rx.axis, true);
  }

  function localDate() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function renderContext() {
    const ctx = context();
    $("geniusPrescriptionAge").textContent = `${proposal.age} years`;
    $("geniusPrescriptionMedical").textContent = ctx.medical.join(", ") || "None reported";
    $("geniusPrescriptionSymptoms").textContent = ctx.symptoms.join(", ") || "None reported";
  }

  function preparePreview() {
    $("geniusVerifyError").textContent = "";
    if (!proposal) return;
    let v;
    try { v = readVerification(); } catch (error) { $("geniusVerifyError").textContent = error.message; return; }
    const pd = proposal.instrument;
    renderPrescriptionEye("Od", v.rx.od);
    renderPrescriptionEye("Os", v.rx.os);
    $("geniusPrescriptionAdd").textContent = v.rx.add ? `${Rx.fmtPower(v.rx.add)} D` : "None";
    $("geniusPrescriptionPd").textContent = pd.pdDistanceMm == null && pd.pdNearMm == null ? "Not measured"
      : `${pd.pdDistanceMm ?? "—"} / ${pd.pdNearMm ?? "—"} mm`;
    $("geniusPrescriptionVa").textContent = `OD ${v.va.od} · OS ${v.va.os}${v.va.ou ? ` · both ${v.va.ou}` : ""}`;
    const parts = [v.outcome === "refined" ? "Refined in a trial frame" : "Accepted as proposed"];
    if (v.near) parts.push(`near ${v.near === "comfortable" ? "comfortable" : "not comfortable"}`);
    if (v.plusTest) parts.push(`+0.25 D ${v.plusTest === "held" ? "holds the line" : "blurs"}`);
    $("geniusPrescriptionOutcome").textContent = parts.join(" · ");
    renderContext();
    $("geniusPrescriptionFlags").innerHTML = "";
    for (const f of proposal.flags) {
      const li = document.createElement("li");
      li.textContent = `${flagTitle(f)}: ${f.message}`;
      $("geniusPrescriptionFlags").appendChild(li);
    }
    const p = proposal.prediction;
    $("geniusPrescriptionVersion").textContent = v.outcome === "refined"
      ? `${MODEL_LABEL} · proposed OD ${Rx.fmtRx(p.od)} · OS ${Rx.fmtRx(p.os)}`
      : MODEL_LABEL;
    if (!$("geniusPrescriptionDate").value) $("geniusPrescriptionDate").value = localDate();
    $("geniusExportStatus").textContent = "";
    $("geniusPrescription").hidden = false;
    setStep("verify");
    document.querySelector('#geniusStepper li[data-step="verify"] .step-dot').textContent = "✓";
    $("geniusPrescription").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------------------------------------------------------------- export

  function patientName() { return $("geniusPatientName").value.trim() || "Not provided"; }
  function previewDate() { return $("geniusPrescriptionDate").value || localDate(); }
  function previewNotes() { return $("geniusPrescriptionNotes").value.trim(); }

  // The editable name, date and notes have static twins that only show in print.
  function syncPrintValues() {
    if (!proposal || $("geniusPrescription").hidden) return;
    renderContext();
    $("geniusPatientNamePrint").textContent = patientName();
    $("geniusPrescriptionDatePrint").textContent = previewDate();
    $("geniusPrescriptionNotesPrint").textContent = previewNotes() || "—";
  }

  function print() {
    if ($("geniusPrescription").hidden) return;
    syncPrintValues();
    window.print();
  }

  // Home-screen web apps on iOS ignore window.print(); the PDF's share sheet offers Print there instead.
  function printSupported() {
    return typeof window.print === "function" && window.navigator.standalone !== true;
  }

  function pdfFileName() {
    return `oculi-genius-preview-${previewDate()}.pdf`;
  }

  // Letter where it is the usual office paper, A4 elsewhere.
  function pageSize() {
    const LETTER = ["US", "CA", "MX", "CL", "CO", "VE", "PH", "CR", "GT", "PA", "DO", "PR", "SV", "NI", "HN", "BZ"];
    let region = "";
    try { region = new Intl.Locale(navigator.language || "en-US").maximize().region || ""; } catch { region = ""; }
    return LETTER.includes(region) ? { width: 612, height: 792 } : { width: 595.28, height: 841.89 };
  }

  function text(id) { return $(id).textContent.trim(); }

  function previewData() {
    const warning = document.querySelector("#geniusPrescription .prescription-warning");
    const lead = warning.querySelector("strong").textContent.trim();
    return {
      warningLead: lead,
      warningRest: warning.textContent.replace(lead, "").trim(),
      caption: document.querySelector("#geniusPrescription .prescription-table caption").textContent.trim(),
      name: patientName(),
      date: previewDate(),
      rows: EYES.map(eye => ({ eye: eye.short, side: eye.name.replace(" eye", ""),
        cells: ["Sphere", "Cylinder", "Axis"].map(c => text(`geniusPrescription${c}${eye.key}`)) })),
      add: text("geniusPrescriptionAdd"), pd: text("geniusPrescriptionPd"),
      va: text("geniusPrescriptionVa"), outcome: text("geniusPrescriptionOutcome"),
      age: text("geniusPrescriptionAge"), medical: text("geniusPrescriptionMedical"), symptoms: text("geniusPrescriptionSymptoms"),
      flags: [...$("geniusPrescriptionFlags").children].map(li => li.textContent.trim()),
      notes: previewNotes(),
      signatory: text("geniusSignatory"), licence: text("geniusLicence"),
      footer: text("geniusPrescriptionVersion")
    };
  }

  // Draws the preview at scale k; returns the bottom edge so the caller can shrink it to one page.
  function drawPdf(pdf, d, k) {
    const M = 46, W = pdf.width, cw = W - 2 * M;
    const ink = 0.07, muted = 0.36, rule = 0.62;
    const sz = v => v * k;
    let y = M;

    pdf.rotatedText("NOT A PRESCRIPTION", W / 2, pdf.height / 2, 28, { font: "bold", size: 46, color: 0.93, spacing: 3 });

    // Header
    pdf.text("OCULI · GENIUS", M, y + sz(8), { size: sz(7.5), color: muted, spacing: 1.1 });
    pdf.text("Prescription preview", M, y + sz(31), { font: "serif", size: sz(23), color: ink });
    const badge = "NOT A PRESCRIPTION", badgeSize = sz(7), badgeW = pdf.textWidth(badge, "bold", badgeSize) + 0.6 * (badge.length - 1) + 16;
    pdf.rect(W - M - badgeW, y + sz(14), badgeW, sz(17), { stroke: ink, width: 0.8, radius: sz(8.5) });
    pdf.text(badge, W - M - badgeW / 2, y + sz(14) + sz(11.6), { font: "bold", size: badgeSize, color: ink, align: "center", spacing: 0.6 });
    y += sz(42);
    pdf.line(M, y, W - M, y, { width: 1.6, color: ink });

    // Warning callout: bold lead-in, then the rest, wrapped together.
    y += sz(12);
    const ws = sz(8.5), lh = ws * 1.4;
    const words = [...d.warningLead.split(/\s+/).map(w => ({ w, font: "bold" })), ...d.warningRest.split(/\s+/).map(w => ({ w, font: "regular" }))];
    const lines = [[]];
    let lineW = 0;
    for (const word of words) {
      const add = pdf.textWidth((lines[lines.length - 1].length ? " " : "") + word.w, word.font, ws);
      if (lines[lines.length - 1].length && lineW + add > cw - 20) { lines.push([]); lineW = 0; }
      const line = lines[lines.length - 1];
      const piece = (line.length ? " " : "") + word.w;
      const last = line[line.length - 1];
      if (last && last.font === word.font) last.t += piece; else line.push({ t: piece, font: word.font });
      lineW += pdf.textWidth(piece, word.font, ws);
    }
    const boxH = lines.length * lh + sz(12);
    pdf.rect(M, y, cw, boxH, { fill: 0.95 });
    pdf.rect(M, y, 2.2, boxH, { fill: ink });
    lines.forEach((line, i) => {
      let x = M + 12;
      for (const seg of line) {
        pdf.text(seg.t, x, y + sz(6) + ws + i * lh - 1, { font: seg.font, size: ws, color: seg.font === "bold" ? ink : 0.25 });
        x += pdf.textWidth(seg.t, seg.font, ws);
      }
    });
    y += boxH;

    // Patient and date
    y += sz(14);
    const nameW = (cw - 18) * 2 / 3, dateX = M + nameW + 18, dateW = cw - nameW - 18;
    pdf.text("Patient name", M, y + sz(8), { size: sz(8), color: muted });
    pdf.text("Date", dateX, y + sz(8), { size: sz(8), color: muted });
    const nameLines = pdf.wrap(d.name, nameW, "regular", sz(11.5));
    nameLines.forEach((line, j) => pdf.text(line, M, y + sz(23) + j * sz(15), { size: sz(11.5), color: ink }));
    pdf.text(d.date, dateX, y + sz(23), { size: sz(11.5), color: ink });
    y += sz(29) + (nameLines.length - 1) * sz(15);
    pdf.line(M, y, M + nameW, y, { color: rule });
    pdf.line(dateX, y, dateX + dateW, y, { color: rule });

    // Rx table
    y += sz(16);
    pdf.text(d.caption.toUpperCase(), M, y + sz(7), { size: sz(7), color: muted, spacing: 0.5 });
    y += sz(13);
    const eyeCol = 84, valCol = (cw - eyeCol) / 3, headH = sz(20), rowH = sz(32);
    const cols = [M, M + eyeCol, M + eyeCol + valCol, M + eyeCol + 2 * valCol, W - M];
    ["EYE", "SPHERE", "CYLINDER", "AXIS"].forEach((h, i) => {
      const x = i === 0 ? cols[0] + 10 : (cols[i] + cols[i + 1]) / 2;
      pdf.text(h, x, y + headH / 2 + sz(2.5), { size: sz(7), color: muted, align: i === 0 ? "left" : "center", spacing: 0.4 });
    });
    d.rows.forEach((row, r) => {
      const top = y + headH + r * rowH;
      pdf.text(row.eye, cols[0] + 10, top + rowH / 2 - sz(0.5), { font: "bold", size: sz(10), color: ink });
      pdf.text(row.side, cols[0] + 10, top + rowH / 2 + sz(9.5), { size: sz(7.5), color: muted });
      row.cells.forEach((c, i) => pdf.text(c, (cols[i + 1] + cols[i + 2]) / 2, top + rowH / 2 + sz(4.5), { size: sz(13.5), color: ink, align: "center" }));
    });
    const tableH = headH + 2 * rowH;
    for (const x of cols) pdf.line(x, y, x, y + tableH, { color: rule });
    for (const yy of [y, y + headH, y + headH + rowH, y + tableH]) pdf.line(M, yy, W - M, yy, { color: rule });
    y += tableH;

    // Boxed rows of label/value cells; values wrap and the row grows to the tallest cell.
    function cells(items, widths, valueSize, valueFont = "regular") {
      y += sz(11);
      const pad = 9, vlh = valueSize * 1.35;
      const total = widths.reduce((a, b) => a + b, 0);
      const ws2 = widths.map(w => w / total * cw);
      const wrapped = items.map((it, i) => pdf.wrap(it.value, ws2[i] - 2 * pad, valueFont, valueSize));
      const h = sz(8) + sz(7) + sz(5) + Math.max(...wrapped.map(l => l.length)) * vlh + sz(4);
      let x = M;
      items.forEach((it, i) => {
        pdf.text(it.label.toUpperCase(), x + pad, y + sz(8) + sz(6), { size: sz(7), color: muted, spacing: 0.4 });
        wrapped[i].forEach((line, j) => pdf.text(line, x + pad, y + sz(8) + sz(7) + sz(5) + valueSize * 0.85 + j * vlh, { font: valueFont, size: valueSize, color: ink }));
        if (i) pdf.line(x, y, x, y + h, { color: rule });
        x += ws2[i];
      });
      pdf.rect(M, y, cw, h, { stroke: rule });
      y += h;
    }
    cells([{ label: "ADD", value: d.add }, { label: "PD distance / near", value: d.pd }], [1, 1], sz(12.5));
    cells([{ label: "Verified VA", value: d.va }, { label: "Verification", value: d.outcome }], [1, 1], sz(9.5));
    cells([{ label: "Age", value: d.age }, { label: "Medical background", value: d.medical }, { label: "Reported symptoms", value: d.symptoms }],
      [0.55, 1, 1.3], sz(9.5));

    // Review notes
    if (d.flags.length) {
      y += sz(14);
      pdf.text("REVIEW NOTES", M, y + sz(6), { size: sz(7), color: muted, spacing: 0.4 });
      y += sz(10);
      const fs = sz(8), flh = fs * 1.4;
      for (const f of d.flags) {
        const lines2 = pdf.wrap(f, cw - 12, "regular", fs);
        pdf.text("•", M + 2, y + fs, { size: fs, color: 0.3 });
        lines2.forEach((line, j) => pdf.text(line, M + 12, y + fs + j * flh, { size: fs, color: 0.3 }));
        y += lines2.length * flh + sz(1.5);
      }
    }

    // Additional notes
    y += sz(12);
    pdf.text("Additional notes", M, y + sz(8), { size: sz(8), color: muted });
    y += sz(12);
    const ns = sz(10), nlh = ns * 1.4;
    const noteLines = pdf.wrap(d.notes || "—", cw, "regular", ns);
    noteLines.forEach((line, j) => pdf.text(line, M, y + ns + j * nlh, { size: ns, color: ink }));
    y += Math.max(noteLines.length * nlh, sz(30)) + sz(4);
    pdf.line(M, y, W - M, y, { color: rule });

    // Signatures
    y += sz(36);
    const sigW = (cw - 28) / 2;
    [[d.signatory, "Verified by"], [d.licence, "Licence or certification"]].forEach(([value, label], i) => {
      const x = M + i * (sigW + 28);
      pdf.line(x, y, x + sigW, y, { width: 0.8, color: 0.2 });
      pdf.text(value, x, y + sz(14), { size: sz(10.5), color: ink });
      pdf.text(label, x, y + sz(25), { size: sz(7.5), color: muted });
    });
    y += sz(36);

    // Footer
    pdf.line(M, y, W - M, y, { color: 0.8 });
    const footLines = pdf.wrap(d.footer, cw, "regular", sz(7.5));
    footLines.forEach((line, j) => pdf.text(line, M, y + sz(12) + j * sz(10), { size: sz(7.5), color: muted }));
    y += sz(12) + (footLines.length - 1) * sz(10);
    return y;
  }

  function buildPdf() {
    const d = previewData();
    const size = pageSize();
    let pdf;
    for (let k = 1; k >= 0.6; k -= 0.05) {
      pdf = window.OculiPdf.create(size.width, size.height);
      if (drawPdf(pdf, d, k) <= size.height - 40) break;
    }
    return pdf.toBytes({ title: `Oculi Genius preview ${d.date}` });
  }

  function download(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // Phones and tablets get the share sheet (Save to Files, Print, AirDrop); desktops download the file.
  async function savePdf() {
    if ($("geniusPrescription").hidden || !proposal) return;
    const status = $("geniusExportStatus");
    let file;
    try {
      syncPrintValues();
      file = new File([buildPdf()], pdfFileName(), { type: "application/pdf" });
    } catch (error) {
      status.textContent = "Could not create the PDF. Try Print instead.";
      return;
    }
    const touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Prescription preview" });
        status.textContent = "";
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
    }
    download(file);
    status.textContent = `Saved ${file.name}`;
  }

  function resetAll() {
    $("geniusForm").reset();
    $("geniusPanel").querySelectorAll(".chip").forEach(chip => chip.classList.remove("on"));
    $("geniusPanel").querySelectorAll(".field[data-sign]").forEach(el => { el.dataset.sign = "-1"; });
    $("geniusPanel").querySelectorAll(".sign:not(.static)").forEach(b => { b.textContent = Rx.MINUS; });
    segment("geniusGlasses", "");
    $("geniusGlassesFields").hidden = true;
    $("geniusGlassesFields").disabled = true;
    ["geniusPatientName", "geniusPrescriptionDate", "geniusPrescriptionNotes"].forEach(id => { $(id).value = ""; });
    ["geniusPatientNamePrint", "geniusPrescriptionDatePrint", "geniusPrescriptionNotesPrint", "geniusExportStatus"].forEach(id => { $(id).textContent = ""; });
    $("geniusScanStatusRow").hidden = true;
    resetVerification();
    syncAxes();
    invalidate();
  }

  function newPatient() {
    resetAll();
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    $("geniusAge").focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- scanner

  async function scan(file) {
    const scanner = window.DioptraTicketScan;
    const status = $("geniusScanStatus");
    $("geniusScanStatusRow").hidden = false;
    if (!scanner || !scanner.scanImage) { status.textContent = "Scanner unavailable · use manual entry"; return; }
    $("geniusScanBtn").disabled = true;
    status.textContent = "Loading scanner…";
    try {
      const result = await scanner.scanImage(file, m => { status.textContent = Rx.scanProgressText(m); });
      if (!result.od || !result.od.selected || !result.os || !result.os.selected) {
        throw new Error("Both OD and OS selected readings are required. No values were changed.");
      }
      if (!window.confirm(Rx.scanSummary(result))) { status.textContent = "Cancelled · no values changed"; return; }
      Rx.applyScannedEye("geniusOd", result.od);
      Rx.applyScannedEye("geniusOs", result.os);
      ["geniusPdDistance", "geniusPdNear", "geniusNearWd"].forEach(id => { $(id).value = ""; });
      if (result.instrument) {
        Rx.setPlainField("geniusPdDistance", result.instrument.pdDistanceMm);
        Rx.setPlainField("geniusPdNear", result.instrument.pdNearMm);
      }
      if (result.near && result.near.workingDistanceCm != null) Rx.setPlainField("geniusNearWd", result.near.workingDistanceCm * 10);
      syncAxes();
      invalidate();
      status.textContent = result.warnings && result.warnings.length ? `Imported with ${result.warnings.length} item(s) to review` : "Imported · review values";
    } catch (error) {
      status.textContent = "Scan failed · use manual entry or try another photo";
      $("geniusError").textContent = error && error.message ? error.message : "Could not scan this ticket.";
    } finally {
      $("geniusScanBtn").disabled = false;
      $("geniusTicketInput").value = "";
    }
  }

  // ---------------------------------------------------------------- events

  function bind() {
    $("geniusForm").addEventListener("submit", propose);
    $("geniusPreview").addEventListener("click", preparePreview);
    $("geniusPrint").addEventListener("click", print);
    $("geniusPrint").hidden = !printSupported();
    if ($("geniusPrint").hidden) $("geniusSavePdf").textContent = "Save or Print PDF";
    $("geniusSavePdf").addEventListener("click", savePdf);
    $("geniusNewPatient").addEventListener("click", newPatient);
    window.addEventListener("beforeprint", syncPrintValues);
    $("geniusScanBtn").addEventListener("click", () => $("geniusTicketInput").click());
    $("geniusTicketInput").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f) scan(f); });

    // Any edit to the screening or ticket makes the proposal stale; verification edits only hide the preview.
    $("geniusForm").addEventListener("input", invalidate);
    $("geniusForm").addEventListener("change", e => {
      const m = e.target.id.match(/^(genius(?:Od|Os)(?:R[123]|Sel|Prev))(Sph|Cyl)$/);
      if (m) Rx.syncRxAxis(m[1], /Prev$/.test(m[1]));
      invalidate();
    });
    $("geniusResults").addEventListener("change", e => {
      const m = e.target.id.match(/^(genius(?:Od|Os)Ref)(Sph|Cyl)$/);
      if (m) Rx.syncRxAxis(m[1], true);
      hidePreview();
    });
    document.addEventListener("segmentchange", e => {
      const id = e.target.id;
      if (id === "geniusGlasses") {
        $("geniusGlassesFields").hidden = e.detail.value !== "yes";
        $("geniusGlassesFields").disabled = e.detail.value !== "yes";
        invalidate();
      } else if (id === "geniusOutcome") {
        toggleRefine(e.detail.value === "refined");
        if (e.detail.value === "refined") prefillRefined();
        hidePreview();
      } else if (["geniusNear", "geniusPlusTest"].includes(id)) {
        hidePreview();
      }
    });
    $("geniusReset").addEventListener("click", () => {
      resetAll();
      $("geniusAge").focus();
    });
  }

  build();
  bind();
  setStep("screen");
  window.OculiGenius = Object.freeze({ MIN_AGE, LARGE_CHANGE_D, buildPdf });
})();
