// Genius: guided refraction preview. Screen → propose → verify in a trial frame → one-page preview,
// saved as a PDF or printed. Nothing here is saved, and nothing reaches the Clinical Study.
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const Rx = window.OculiRx;
  const engine = window.OculiEngineBerylV11; // unchanged v0.3.0 rules under the Beryl release identity
  const MODEL_LABEL = "Oculi Model";
  const MIN_AGE = 18;
  const LARGE_CHANGE_D = 0.75;
  const LABS_INDIGO = [21 / 255, 19 / 255, 88 / 255]; // #151358, fixed in every theme
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

  const Vision = window.OculiVisionCompare;
  const VA_SELECTS = ["Dist", "Near"].flatMap(k => ["Sc", "Cc"].flatMap(c => ["Od", "Os", "Ou"].map(e => `geniusVa${k}${c}${e}`)))
    .concat(["geniusPinholeOd", "geniusPinholeOs"]);
  const PINHOLE_NOT_NEEDED = 0.8; // 20/25: pinhole adds nothing for an eye that reads this well
  const DX_THRESHOLD = { myopia: -0.5, hyperopia: 0.5, astigmatism: 0.5, presbyopiaAge: 40 };

  let proposal = null; // { prediction, flags, context }

  // ---------------------------------------------------------------- build

  function build() {
    for (const eye of EYES) {
      $(`genius-ar-${eye.id}`).innerHTML = Rx.arTableHTML(`genius${eye.key}`, eye.short);
      $(`genius-prev-${eye.id}`).innerHTML = Rx.rxRowHTML(`genius${eye.key}Prev`, eye.short, "current glasses");
      $(`genius-ref-${eye.id}`).innerHTML = Rx.rxRowHTML(`genius${eye.key}Ref`, eye.short, "refined");
    }
    ["geniusVaOd", "geniusVaOs", "geniusVaOu"].forEach(id => { $(id).innerHTML = Rx.vaOptionsHTML(); });
    const shortVa = `<option value="">—</option>` + window.DIOPTRA_CONFIG.visualAcuity.map(v => `<option value="${v.snellen}">${v.snellen}</option>`).join("");
    VA_SELECTS.forEach(id => { $(id).innerHTML = shortVa; });
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

  function invalidate(clearCompare = true) {
    proposal = null;
    if (clearCompare === true) clearComparison("Inputs changed · show the comparison again.");
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

  // Monocular PDs. The engine still receives the binocular sums when both eyes are measured.
  function readPd() {
    const pd = {};
    for (const [eye, key] of [["od", "Od"], ["os", "Os"]]) {
      pd[eye] = {
        dist: optionalNumber(`geniusPd${key}Dist`, 20, 45, `${eye.toUpperCase()} distance PD (20–45 mm)`),
        near: optionalNumber(`geniusPd${key}Near`, 18, 43, `${eye.toUpperCase()} near PD (18–43 mm)`)
      };
    }
    const sum = k => pd.od[k] != null && pd.os[k] != null ? pd.od[k] + pd.os[k] : null;
    return { pd, pdDistanceMm: sum("dist"), pdNearMm: sum("near") };
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

  // Whole years between a birthdate and today, or null for an empty or impossible date.
  function ageFromBirthdate(value, today = new Date()) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!m) return null;
    const [y, mo, d] = m.slice(1).map(Number);
    const birth = new Date(y, mo - 1, d);
    if (birth.getMonth() !== mo - 1 || birth > today) return null;
    let age = today.getFullYear() - y;
    if (today.getMonth() < mo - 1 || (today.getMonth() === mo - 1 && today.getDate() < d)) age--;
    return age >= 0 && age <= 120 ? age : null;
  }

  function readAge() {
    const ageText = $("geniusAge").value.trim();
    if (!/^\d{1,3}$/.test(ageText) || Number(ageText) < 1 || Number(ageText) > 120) throw new Error("Enter an age from 1 to 120, or a birthdate.");
    return Number(ageText);
  }

  // Pinhole per eye is not needed once that eye reads 20/25 or better at distance, with or without glasses.
  function syncPinhole() {
    const decimal = snellen => (window.DIOPTRA_CONFIG.visualAcuity.find(v => v.snellen === snellen) || {}).decimal || 0;
    for (const key of ["Od", "Os"]) {
      const best = Math.max(decimal($(`geniusVaDistSc${key}`).value), decimal($(`geniusVaDistCc${key}`).value));
      const ph = $(`geniusPinhole${key}`);
      const off = best >= PINHOLE_NOT_NEEDED - 1e-9;
      ph.disabled = off;
      ph.options[0].textContent = off ? "Not needed" : "—";
      if (off) ph.value = "";
    }
  }

  function syncBirthdate() {
    const value = $("geniusBirthdate").value;
    const age = ageFromBirthdate(value);
    if (age != null) {
      $("geniusAge").value = String(Math.max(age, 0));
      $("geniusAgeNote").textContent = `Age ${age} from the birthdate.`;
    } else {
      $("geniusAgeNote").textContent = value ? "Check the birthdate." : "A birthdate fills in the age.";
    }
  }

  // ---------------------------------------------------------------- pre-diagnosis

  function selectedLine(eye) {
    const r = Rx.readArRow(`genius${eye.key}Sel`);
    return Rx.validRx(r) ? r : null;
  }

  // Suggested boxes from the selected autorefractor lines and age. Boxes the assessor has
  // touched are left as they are.
  function suggestDiagnosis() {
    const lines = EYES.map(selectedLine).filter(Boolean);
    const ageText = $("geniusAge").value.trim();
    const age = /^\d{1,3}$/.test(ageText) ? Number(ageText) : null;
    const dx = { myopia: false, hyperopia: false, astigmatism: false, presbyopia: age != null && age >= DX_THRESHOLD.presbyopiaAge };
    for (const r of lines) {
      const se = r.sphere + (r.cylinder || 0) / 2;
      if (se <= DX_THRESHOLD.myopia + 1e-9) dx.myopia = true;
      if (se >= DX_THRESHOLD.hyperopia - 1e-9) dx.hyperopia = true;
      if (Math.abs(r.cylinder || 0) >= DX_THRESHOLD.astigmatism - 1e-9) dx.astigmatism = true;
    }
    dx.none = lines.length === 2 && !dx.myopia && !dx.hyperopia && !dx.astigmatism && !dx.presbyopia;
    return dx;
  }

  function syncDiagnosis() {
    const dx = suggestDiagnosis();
    document.querySelectorAll("#geniusPrediagnosis input").forEach(cb => {
      if (cb.dataset.manual === "true") return;
      cb.checked = Boolean(dx[cb.dataset.dx]);
      cb.closest(".chip").classList.toggle("on", cb.checked);
    });
  }

  // ---------------------------------------------------------------- vision comparison

  const canvases = () => ({ current: $("geniusCompareCurrent"), true: $("geniusCompareTrue") });

  function clearComparison(message) {
    if (!Vision || $("geniusCompare").hidden) return;
    Vision.clear(canvases());
    $("geniusCompare").hidden = true;
    if (message) $("geniusCompareStatus").textContent = message;
  }

  function outOfFocus(v) {
    return Math.abs(v.m) + Math.hypot(v.j0, v.j45);
  }

  function viewNote(v, lensText) {
    const parts = [lensText];
    const d = outOfFocus(v);
    parts.push(d < 0.125 ? "in focus" : `about ${d.toFixed(2)} D out of focus`);
    if (v.accommodationUsed >= 0.25) parts.push(`focusing ${v.accommodationUsed.toFixed(2)} D`);
    if (v.limited) parts.push("blur capped for display");
    return parts.join(" · ");
  }

  async function showComparison() {
    const status = $("geniusCompareStatus");
    if (!Vision || !window.ZLRetina) { status.textContent = "The comparison is not available in this browser."; return; }
    let input;
    try {
      const age = readAge();
      const od = readEyeTicket(EYES[0]);
      const os = readEyeTicket(EYES[1]);
      const glasses = $("geniusGlasses").dataset.value;
      const current = glasses === "yes" ? readCurrentGlasses() : null;
      const wdMm = optionalNumber("geniusNearWd", 250, 1000, "Working distance (250–1000 mm)");
      const prediction = engine.predictCase({ age, instrument: { vertexMm: 12 }, near: { workingDistanceCm: wdMm == null ? null : wdMm / 10 }, od, os });
      const eyeId = $("geniusCompareEye").dataset.value || "od";
      const scene = $("geniusCompareScene").dataset.value || "distance";
      input = {
        age, scene, eyeId,
        eye: { sphere: prediction[eyeId].sphere, cylinder: prediction[eyeId].cylinder, axis: prediction[eyeId].axis },
        current: current ? current[eyeId] : null,
        currentAdd: current && current.add ? current.add : 0,
        trueAdd: prediction.tentativeAdd > 0 ? prediction.tentativeAdd : 0,
        nearDistanceM: wdMm == null ? 0.4 : wdMm / 1000
      };
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    status.textContent = "Rendering…";
    $("geniusCompareBtn").disabled = true;
    try {
      const views = await Vision.render(canvases(), input);
      if (!views) return;
      $("geniusCompare").hidden = false;
      const eyeName = input.eyeId === "od" ? "Right eye" : "Left eye";
      const where = input.scene === "near" ? `at ${Math.round(input.nearDistanceM * 100)} cm` : "at distance";
      $("geniusCompareCurrentNote").textContent = viewNote(views.current, input.current ? "Current glasses" : "No glasses");
      $("geniusCompareTrueNote").textContent = viewNote(views.true, `Full correction ${Rx.fmtRx(input.eye)}`);
      status.textContent = `${eyeName} ${where}. Correction estimated by Beryl from the autorefractor.`;
    } catch (error) {
      status.textContent = `Could not render the comparison: ${error.message}`;
    } finally {
      $("geniusCompareBtn").disabled = false;
    }
  }

  // ---------------------------------------------------------------- flags

  function engineFlags(prediction) {
    // The engine's standing validation notice stays in its output and exports, not on screen or the card.
    const list = prediction.flags.filter(f => f.code !== "UNVALIDATED").map(f => ({ ...f }));
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
    invalidate(false);
    try {
      const age = readAge();
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
        ...readPd()
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
    $("geniusVersion").textContent = `${p.name || "Beryl"} ${String(p.version).split(".").slice(0, 2).join(".")}`;
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
    for (const [eye, key] of [["od", "Od"], ["os", "Os"]]) {
      const mono = pd.pd ? pd.pd[eye] : {};
      $(`geniusPrescriptionPdDist${key}`).textContent = mono.dist == null ? "—" : String(mono.dist);
      $(`geniusPrescriptionPdNear${key}`).textContent = mono.near == null ? "—" : String(mono.near);
    }
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
    if (!$("geniusPatientName").value.trim()) $("geniusPatientName").value = $("geniusName").value.trim();
    $("rxBackVersion").textContent = `Oculi · ${p.name || "Beryl"} ${String(p.version).split(".").slice(0, 2).join(".")}`;
    if (window.ZLField && !$("rxCoverEmblem").innerHTML) $("rxCoverEmblem").innerHTML = window.ZLField.markSvg(48);
    requestAnimationFrame(() => { syncPrintValues(); fitCard(); });
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
    $("rxCoverPatient").textContent = $("geniusPatientName").value.trim();
    $("rxCoverDate").textContent = previewDate();
  }

  // The card's lower panel holds a variable amount of text: shrink its type until it fits.
  // Past the type floor, the last review notes give way to a count, as in the PDF.
  function fitCard() {
    const box = $("rxFit");
    const card = $("rxCardInside");
    if (!box || $("geniusPrescription").hidden) return;
    syncPrintValues();
    const list = $("geniusPrescriptionFlags");
    list.querySelectorAll(".rx-more").forEach(li => li.remove());
    const notes = [...list.children];
    notes.forEach(li => { li.hidden = false; });
    // Fit both what will print (static values) and what is on screen (editing fields), with 3%
    // headroom: print and other browsers round lines slightly differently.
    const overIn = printed => {
      card.classList.toggle("as-print", printed);
      const last = box.lastElementChild.getBoundingClientRect().bottom - box.getBoundingClientRect().top;
      return last > box.clientHeight * 0.97;
    };
    const over = () => overIn(true) || overIn(false);
    let fit = 1;
    card.style.setProperty("--fit", fit);
    while (fit > 0.75 && over()) {
      fit = Math.round((fit - 0.05) * 100) / 100;
      card.style.setProperty("--fit", fit);
    }
    let dropped = 0;
    const more = document.createElement("li");
    more.className = "rx-more";
    while (over() && dropped < notes.length) {
      notes[notes.length - 1 - dropped].hidden = true;
      dropped++;
      more.textContent = `${dropped} more review note${dropped === 1 ? " is" : "s are"} shown in Oculi.`;
      if (!more.isConnected) list.appendChild(more);
    }
    card.classList.remove("as-print");
  }

  function lensTypes() {
    return [...document.querySelectorAll("#rxCardInside .rx-lenses input")].map(cb => ({ label: cb.dataset.lens, checked: cb.checked }));
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
    return `oculi-rx-card-${previewDate()}.pdf`;
  }

  // The card: 90 × 160 mm, folding to 90 × 80 mm.
  const MM = 72 / 25.4;
  const CARD = { width: 90 * MM, height: 160 * MM };

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
        cells: ["Sphere", "Cylinder", "Axis", "PdDist", "PdNear"].map(c => text(`geniusPrescription${c}${eye.key}`)) })),
      add: text("geniusPrescriptionAdd"), lenses: lensTypes(),
      cover: { title: document.querySelector(".rx-cover-title").textContent.trim(), body: document.querySelector(".rx-cover-body").textContent.trim(),
        back: [...$("rxBackList").children].map(li => li.textContent.trim()), backTitle: document.querySelector(".rx-back-title").textContent.trim(),
        version: text("rxBackVersion") },
      va: text("geniusPrescriptionVa"), outcome: text("geniusPrescriptionOutcome"),
      age: text("geniusPrescriptionAge"), medical: text("geniusPrescriptionMedical"), symptoms: text("geniusPrescriptionSymptoms"),
      flags: [...$("geniusPrescriptionFlags").children].filter(li => !li.classList.contains("rx-more")).map(li => li.textContent.trim()),
      notes: previewNotes(),
      signatory: text("geniusSignatory"), licence: text("geniusLicence"),
      footer: text("geniusPrescriptionVersion")
    };
  }

  // The card in two pages: the inside (Rx above the fold, verification below) and the outside
  // (front cover above the fold, turned 180° so it reads upright once folded; back cover below).
  // labs-indigo on white, hairlines, square corners, no bold. Helvetica stands in for IBM Plex.
  function drawCardInside(pdf, d, k) {
    const W = pdf.width, P = CARD.height / 2, M = 5 * MM, cw = W - 2 * M;
    const ink = LABS_INDIGO, pale = LABS_INDIGO.map(c => 1 - 0.07 * (1 - c));
    const label = (t, x, y, o = {}) => pdf.text(t.toUpperCase(), x, y, { size: 5.2, color: ink, spacing: 0.25, ...o });
    let y = M + 4;

    // ---- above the fold: the Rx
    pdf.rotatedText("NOT INDICATIVE OF THE FINAL PRODUCT", W / 2, P / 2 + 6, 28, { font: "regular", size: 10, color: pale, spacing: 0.6 });
    label("Oculi · Genius", M, y);
    const badge = "NOT INDICATIVE OF THE FINAL PRODUCT", bw = pdf.textWidth(badge, "regular", 5) + 0.25 * (badge.length - 1) + 8;
    pdf.rect(W - M - bw, y - 6.5, bw, 9.5, { stroke: ink, width: 0.5 });
    pdf.text(badge, W - M - bw / 2, y, { size: 5, color: ink, align: "center", spacing: 0.25 });
    y += 14;
    for (const [name, value] of [["Date", d.date], ["Patient", d.name]]) {
      label(name, M, y);
      const lines = pdf.wrap(value, cw - 34, "regular", 7.5).slice(0, 2);
      lines.forEach((line, j) => pdf.text(line, M + 34, y + j * 9, { size: 7.5, color: ink }));
      y += (lines.length - 1) * 9 + 3;
      pdf.line(M + 34, y, W - M, y, { width: 0.4, color: ink });
      y += 10;
    }
    y += 2;
    label(d.caption, M, y, { size: 4.6, spacing: 0.15 });
    y += 4;
    const eyeCol = 22, valCol = (cw - eyeCol) / 5, headH = 13, rowH = 17;
    const cols = [M, M + eyeCol, ...[1, 2, 3, 4].map(i => M + eyeCol + i * valCol), W - M];
    ["", "SPHERE", "CYLINDER", "AXIS", "PD FAR", "PD NEAR"].forEach((h, i) => {
      if (h) pdf.text(h, (cols[i] + cols[i + 1]) / 2, y + headH / 2 + 1.8, { size: 4.6, color: ink, align: "center", spacing: 0.15 });
    });
    d.rows.forEach((row, r) => {
      const top = y + headH + r * rowH;
      pdf.text(row.eye, cols[0] + 5, top + rowH / 2 + 2.6, { size: 7.5, color: ink });
      row.cells.forEach((c, i) => pdf.text(c, (cols[i + 1] + cols[i + 2]) / 2, top + rowH / 2 + 3, { size: i < 3 ? 8.5 : 7.5, color: ink, align: "center" }));
    });
    const tableH = headH + 2 * rowH;
    for (const x of cols) pdf.line(x, y, x, y + tableH, { width: 0.4, color: ink });
    for (const yy of [y, y + headH, y + headH + rowH, y + tableH]) pdf.line(M, yy, W - M, yy, { width: 0.4, color: ink });
    y += tableH + 12;
    label("ADD", M, y);
    pdf.text(d.add, M + 34, y, { size: 8.5, color: ink });
    y += 13;
    // Lens type, two by two, as on the Crizal card's coating row.
    const box = 6.5, colW = cw / 2;
    d.lenses.forEach((lens, i) => {
      const x = M + (i % 2) * colW, yy = y + Math.floor(i / 2) * 12;
      pdf.rect(x, yy - box + 1, box, box, { stroke: ink, width: 0.5 });
      if (lens.checked) pdf.rect(x + 1.6, yy - box + 2.6, box - 3.2, box - 3.2, { fill: ink });
      pdf.text(lens.label, x + box + 4, yy, { size: 7, color: ink });
    });
    y += 24;
    const warn = `${d.warningLead} ${d.warningRest}`;
    pdf.wrap(warn, cw, "regular", 4.8).forEach((line, j) => {
      if (j === 0 && line.startsWith(d.warningLead)) {
        pdf.text(d.warningLead, M, y + j * 6.2, { size: 4.8, color: ink });
        pdf.text(line.slice(d.warningLead.length), M + pdf.textWidth(d.warningLead, "regular", 4.8), y + j * 6.2, { size: 4.8, color: ink });
      } else pdf.text(line, M, y + j * 6.2, { size: 4.8, color: ink });
    });

    // ---- below the fold: verification, context, review notes, notes, signatures
    y = P + M + 4;
    const sz = v => v * k;
    const pair = (items, widths) => {
      const total = widths.reduce((a, b) => a + b, 0);
      let x = M, h = 0;
      items.forEach((it, i) => {
        const w = widths[i] / total * cw - 4;
        label(it.label, x, y, { size: sz(4.8) });
        const lines = pdf.wrap(it.value, w, "regular", sz(6.4));
        lines.forEach((line, j) => pdf.text(line, x, y + sz(8) + j * sz(7.8), { size: sz(6.4), color: ink }));
        h = Math.max(h, sz(8) + (lines.length - 1) * sz(7.8));
        x += widths[i] / total * cw;
      });
      y += h + sz(9);
    };
    pair([{ label: "Verified VA", value: d.va }, { label: "Verification", value: d.outcome }], [1, 1.25]);
    pair([{ label: "Age", value: d.age }, { label: "Medical background", value: d.medical }, { label: "Reported symptoms", value: d.symptoms }], [0.55, 1, 1.25]);
    const sigTop = CARD.height - M - 30;
    if (d.flags.length) {
      label("Review notes", M, y, { size: sz(4.8) });
      y += sz(7);
      const fs = sz(5.4), lh = fs * 1.3;
      for (const f of d.flags) {
        const lines = pdf.wrap(f, cw - 7, "regular", fs);
        pdf.text("•", M + 1, y + fs * 0.8, { size: fs, color: ink });
        lines.forEach((line, j) => pdf.text(line, M + 7, y + fs * 0.8 + j * lh, { size: fs, color: ink }));
        y += lines.length * lh + sz(1);
      }
      y += sz(4);
    }
    label("Notes", M, y, { size: sz(4.8) });
    y += sz(8);
    const notes = pdf.wrap(d.notes || "—", cw, "regular", sz(6.2));
    notes.forEach((line, j) => pdf.text(line, M, y + j * sz(7.6), { size: sz(6.2), color: ink }));
    y += notes.length * sz(7.6);
    const bottom = y;
    const sigW = (cw - 10) / 2;
    [[d.signatory, "Verified by"], [d.licence, "Licence or certification"]].forEach(([value, lab], i) => {
      const x = M + i * (sigW + 10);
      pdf.line(x, sigTop + 8, x + sigW, sigTop + 8, { width: 0.4, color: ink });
      pdf.text(value, x, sigTop + 16, { size: 6.4, color: ink });
      label(lab, x, sigTop + 23, { size: 4.6, spacing: 0.15 });
    });
    pdf.text(d.footer, M, CARD.height - M + 1, { size: 4.6, color: ink });
    return bottom <= sigTop;
  }

  function drawCardOutside(pdf, d) {
    const W = pdf.width, P = CARD.height / 2, M = 6 * MM, cw = W - 2 * M, ink = LABS_INDIGO;
    // Front cover, drawn upright in the top half, then turned so its top meets the fold.
    pdf.rotated180(W / 2, P / 2, () => {
      let y = M + 30;
      pdf.text("Oculi", M, y, { size: 30, color: ink });
      const mark = window.ZLField ? window.ZLField.D.mark : null;
      if (mark) {
        const h = 26, sc = h / mark.height, x0 = W - M - mark.width * sc, y0 = y - 24;
        for (const d0 of mark.paths) {
          const pts = d0.match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g).map(t => t.split(",").map(Number)).map(([x, yy]) => [x0 + x * sc, y0 + yy * sc]);
          pdf.polygon(pts, { fill: ink });
        }
      }
      y += 34;
      pdf.text(d.cover.title, M, y, { size: 11.5, color: ink });
      y += 13;
      pdf.wrap(d.cover.body, cw, "regular", 6.8).forEach((line, j) => pdf.text(line, M, y + j * 9, { size: 6.8, color: ink }));
      const meta = [d.name === "Not provided" ? "" : d.name, d.date].filter(Boolean).join("  ·  ");
      pdf.text(meta, M, P - 18, { size: 6, color: ink });
      pdf.rect(0, P - 6, W, 6, { fill: ink }); // the band at the free edge, after Crizal's
    });
    // Back cover, upright below the fold.
    let y = P + M + 10;
    pdf.text(d.cover.backTitle, M, y, { size: 9.5, color: ink });
    y += 12;
    for (const item of d.cover.back) {
      const lines = pdf.wrap(item, cw - 8, "regular", 6.6);
      pdf.text("•", M + 1, y, { size: 6.6, color: ink });
      lines.forEach((line, j) => pdf.text(line, M + 8, y + j * 8.4, { size: 6.6, color: ink }));
      y += lines.length * 8.4 + 4;
    }
    pdf.line(M, CARD.height - M - 16, W - M, CARD.height - M - 16, { width: 0.4, color: ink });
    pdf.text("ZEPHENIALABS", M, CARD.height - M - 5, { size: 5.2, color: ink, spacing: 0.25 });
    pdf.text(d.cover.version, W - M, CARD.height - M - 5, { size: 5.2, color: ink, align: "right" });
  }

  function buildPdf() {
    const d = previewData();
    // Shrink the lower panel's text until it clears the signatures; past the floor, drop the
    // last review notes and say how many are left out.
    let pdf, data = d, dropped = 0;
    for (;;) {
      let fits = false;
      for (let k = 1; k >= 0.6 - 1e-9; k -= 0.05) {
        pdf = window.OculiPdf.create(CARD.width, CARD.height);
        if (drawCardInside(pdf, data, k)) { fits = true; break; }
      }
      if (fits || !data.flags.length) break;
      dropped++;
      data = { ...d, flags: [...d.flags.slice(0, Math.max(0, d.flags.length - dropped - 1)), `${dropped + 1} more review notes are shown in Oculi.`] };
      if (dropped >= d.flags.length) break;
    }
    pdf.newPage();
    drawCardOutside(pdf, data);
    return pdf.toBytes({ title: `Oculi prescription card ${d.date}` });
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
        await navigator.share({ files: [file], title: "Prescription card" });
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
    segment("geniusCompareEye", "od");
    segment("geniusCompareScene", "distance");
    document.querySelectorAll("#geniusPrediagnosis input").forEach(cb => { delete cb.dataset.manual; });
    document.querySelectorAll("#geniusPanel .cc-row").forEach(row => { row.hidden = true; });
    syncPinhole();
    clearComparison();
    $("geniusCompareStatus").textContent = "Uses the age and the autorefractor lines above.";
    $("geniusAgeNote").textContent = "A birthdate fills in the age.";
    $("geniusGlassesFields").hidden = true;
    $("geniusGlassesFields").disabled = true;
    ["geniusPatientName", "geniusPrescriptionDate", "geniusPrescriptionNotes"].forEach(id => { $(id).value = ""; });
    ["geniusPatientNamePrint", "geniusPrescriptionDatePrint", "geniusPrescriptionNotesPrint", "geniusExportStatus", "rxCoverPatient", "rxCoverDate"].forEach(id => { $(id).textContent = ""; });
    document.querySelectorAll("#rxCardInside .rx-lenses input").forEach(cb => { cb.checked = false; });
    $("geniusScanStatusRow").hidden = true;
    resetVerification();
    syncAxes();
    invalidate();
  }

  function newPatient() {
    resetAll();
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    $("geniusName").focus({ preventScroll: true });
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
      ["geniusPdOdDist", "geniusPdOdNear", "geniusPdOsDist", "geniusPdOsNear", "geniusNearWd"].forEach(id => { $(id).value = ""; });
      // A ticket gives one binocular PD; each eye starts at half of it, rounded to 0.5 mm. Measure monocular PD when it matters.
      const half = v => v == null ? null : Math.round(v) / 2;
      if (result.instrument) {
        for (const key of ["Od", "Os"]) {
          Rx.setPlainField(`geniusPd${key}Dist`, half(result.instrument.pdDistanceMm));
          Rx.setPlainField(`geniusPd${key}Near`, half(result.instrument.pdNearMm));
        }
      }
      if (result.near && result.near.workingDistanceCm != null) Rx.setPlainField("geniusNearWd", result.near.workingDistanceCm * 10);
      syncAxes();
      invalidate();
      syncDiagnosis();
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
    window.addEventListener("beforeprint", () => { syncPrintValues(); fitCard(); });
    $("geniusScanBtn").addEventListener("click", () => $("geniusTicketInput").click());
    $("geniusTicketInput").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f) scan(f); });

    // Any edit to the screening or ticket makes the proposal stale; verification edits only hide the preview.
    // Visual acuity, pre-diagnosis and the comparison controls ([data-keep]) never change the proposal.
    const kept = e => Boolean(e.target.closest("[data-keep]"));
    $("geniusForm").addEventListener("input", e => {
      if (kept(e)) return;
      if (e.target.id === "geniusBirthdate") syncBirthdate();
      invalidate();
      syncDiagnosis();
    });
    $("geniusForm").addEventListener("change", e => {
      if (/^geniusVaDist(Sc|Cc)O[ds]$/.test(e.target.id)) syncPinhole();
      if (e.target.closest("#geniusPrediagnosis")) {
        e.target.dataset.manual = "true";
        return;
      }
      if (kept(e)) return;
      const m = e.target.id.match(/^(genius(?:Od|Os)(?:R[123]|Sel|Prev))(Sph|Cyl)$/);
      if (m) Rx.syncRxAxis(m[1], /Prev$/.test(m[1]));
      if (e.target.id === "geniusBirthdate") syncBirthdate();
      invalidate();
      syncDiagnosis();
    });
    $("geniusCompareBtn").addEventListener("click", showComparison);
    $("geniusPrescription").addEventListener("input", () => { syncPrintValues(); fitCard(); });
    window.addEventListener("resize", fitCard);
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
        document.querySelectorAll("#geniusPanel .cc-row").forEach(row => { row.hidden = e.detail.value !== "yes"; });
        invalidate();
      } else if (id === "geniusCompareEye" || id === "geniusCompareScene") {
        if (!$("geniusCompare").hidden) showComparison();
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
      $("geniusName").focus();
    });
  }

  build();
  bind();
  setStep("screen");
  window.OculiGenius = Object.freeze({ MIN_AGE, LARGE_CHANGE_D, buildPdf, ageFromBirthdate, suggestDiagnosis });
})();
