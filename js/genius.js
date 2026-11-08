// Genius: guided refraction preview. Screen → propose → verify in a trial frame → printable preview.
// Nothing here is saved, and nothing reaches the Clinical Study.
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const Rx = window.OculiRx;
  const engine = window.DioptraEngineV03; // prior offset (−0.25 D); Beryl's fitted offset belongs to one instrument and examiner
  const ENGINE_NOTE = "prior offset";
  const MIN_AGE = 18;
  const LARGE_CHANGE_D = 0.75;
  const EYES = [{ id: "od", key: "Od", short: "OD", name: "Right eye" }, { id: "os", key: "Os", short: "OS", name: "Left eye" }];
  const SYMPTOMS = [["geniusBlurredVision", "Blurred vision"], ["geniusHeadache", "Headache"], ["geniusGlare", "Glare / halos"],
    ["geniusTearing", "Tearing"], ["geniusIrritation", "Burning / irritation"], ["geniusItching", "Itching"],
    ["geniusDischarge", "Discharge"], ["geniusDryEye", "Dry eye"]];
  const MEDICAL = [["geniusDiabetes", "Diabetes"], ["geniusHypertension", "Hypertension"], ["geniusPregnancy", "Pregnancy"]];
  const GENIUS_FLAG_TITLES = {
    GENIUS_PREVIEW: "Development preview",
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
    const flags = [{ code: "GENIUS_PREVIEW", level: "review", message: "Verify in a trial frame before anything is made. The proposal uses the −0.25 D prior, not Beryl's fitted offset." }];
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
      ? `Model v${p.version} (${ENGINE_NOTE}) proposed OD ${Rx.fmtRx(p.od)} · OS ${Rx.fmtRx(p.os)}`
      : `Model v${p.version} · ${ENGINE_NOTE}`;
    if (!$("geniusPrescriptionDate").value) $("geniusPrescriptionDate").value = localDate();
    $("geniusPrescription").hidden = false;
    setStep("verify");
    document.querySelector('#geniusStepper li[data-step="verify"] .step-dot').textContent = "✓";
    $("geniusPrescription").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function print() {
    if ($("geniusPrescription").hidden) return;
    renderContext();
    $("geniusPatientNamePrint").textContent = $("geniusPatientName").value.trim() || "Not provided";
    $("geniusPrescriptionDatePrint").textContent = $("geniusPrescriptionDate").value || localDate();
    $("geniusPrescriptionNotesPrint").textContent = $("geniusPrescriptionNotes").value.trim() || "—";
    window.print();
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
      $("geniusForm").reset();
      $("geniusPanel").querySelectorAll(".chip").forEach(chip => chip.classList.remove("on"));
      $("geniusPanel").querySelectorAll(".field[data-sign]").forEach(el => { el.dataset.sign = "-1"; });
      $("geniusPanel").querySelectorAll(".sign:not(.static)").forEach(b => { b.textContent = Rx.MINUS; });
      segment("geniusGlasses", "");
      $("geniusGlassesFields").hidden = true;
      $("geniusGlassesFields").disabled = true;
      ["geniusPatientName", "geniusPrescriptionDate", "geniusPrescriptionNotes"].forEach(id => { $(id).value = ""; });
      $("geniusScanStatusRow").hidden = true;
      syncAxes();
      invalidate();
      $("geniusAge").focus();
    });
  }

  build();
  bind();
  setStep("screen");
  window.OculiGenius = Object.freeze({ MIN_AGE, LARGE_CHANGE_D });
})();
