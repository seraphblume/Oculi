(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const optics = window.DioptraOptics;
  const tabs = [$("caseTab"), $("geniusTab"), $("calculatorTab")];
  const panels = [$("casePanel"), $("geniusPanel"), $("calculatorPanel")];
  const views = ["case", "genius", "calculator"];
  const scrollPositions = [0, 0, 0];
  let selected = 0;
  let result = null;
  const show$ = window.OculiRx.displayMinus; // typographic minus on screen; copied text stays ASCII

  function selectTab(index) {
    if (selected === index) return;
    scrollPositions[selected] = window.scrollY;
    selected = index;
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    $("actionBar").hidden = index !== 0;
    $("caseActions").hidden = index !== 0;
    document.body.dataset.view = views[index];
    document.querySelector(".skip-link").href = `#${panels[index].id}`;
    window.scrollTo({ top: scrollPositions[index], behavior: "instant" });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(index));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
        : event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
      selectTab(next);
      tabs[next].focus();
    });
  });

  function invalidate() {
    result = null;
    $("calculatorResults").hidden = true;
    $("calculatorEmpty").hidden = false;
    $("calculatorError").textContent = "";
    $("calculatorStatus").textContent = "";
  }
  const eyes = [{ key: "od", suffix: "", label: "Right eye · OD" }, { key: "os", suffix: "Os", label: "Left eye · OS" }];
  const calculatorTabs = [...document.querySelectorAll(".calculator-tabs [role=tab]")];
  let calculatorTool = "conversion";
  const f = optics.formatPower;
  const quarter = x => Math.round((x + Number.EPSILON) * 4) / 4;
  const displayRx = rx => optics.formatRx({ ...rx, sphere: Math.round(rx.sphere * 100) / 100, cylinder: Math.round(rx.cylinder * 100) / 100 });
  function setInputs(rx, suffix = "") {
    $("calcSphere" + suffix).value = f(rx.sphere);
    $("calcCylinder" + suffix).value = f(rx.cylinder);
    $("calcAxis" + suffix).value = rx.axis ?? "";
  }
  function mode() { return $("calcConversion").value; }
  function applyToolVisibility() {
    const conversion = calculatorTool === "conversion";
    $("conversionControls").hidden = !conversion;
    $("vertexControls").hidden = !conversion;
    $("vertexHint").hidden = !conversion;
    $("conversionResults").hidden = !conversion;
    document.querySelectorAll("[data-calculator-result]").forEach(el => {
      el.hidden = el.dataset.calculatorResult !== calculatorTool;
    });
  }
  function selectCalculatorTool(tool, focus = false) {
    calculatorTool = tool;
    const active = calculatorTabs.find(tab => tab.dataset.calculatorTool === tool);
    calculatorTabs.forEach(tab => {
      const on = tab === active;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    $("calculatorToolPanel").setAttribute("aria-labelledby", active.id);
    const config = {
      conversion: { button: "Convert", symbol: "↔", title: "Vertex" },
      se: { button: "Calculate SE", symbol: "¼", title: "Spherical Equivalent" },
      transpose: { button: "Transpose", symbol: "±", title: "Transposition" }
    }[tool];
    $("calculatorSubmit").textContent = config.button;
    $("calculatorEmptySymbol").textContent = config.symbol;
    $("calculatorEmptyTitle").textContent = config.title;
    applyToolVisibility();
    invalidate();
    if (focus) active.focus();
  }
  function configureMode() {
    const m = mode(), reverse = m === "contactsToSpectacles", custom = m === "custom";
    $("calcFromVertex").readOnly = reverse;
    $("calcToVertex").readOnly = !reverse && !custom;
    $("calcFromVertex").value = reverse ? "0" : "12";
    $("calcToVertex").value = reverse ? "12" : "0";
    $("calcFromLabel").textContent = custom ? "Source vertex" : reverse ? "Contact lens plane" : "Spectacle vertex";
    $("calcToLabel").textContent = custom ? "Target vertex" : reverse ? "Spectacle vertex" : "Contact lens plane";
    $("calcInputPlane").textContent = custom ? "Enter powers at the source vertex." : reverse ? "Enter the contact lens power." : "Enter the spectacle prescription.";
    invalidate();
  }
  function readEyes() {
    const next = {};
    for (const eye of eyes) {
      const values = ["calcSphere", "calcCylinder", "calcAxis"].map(id => $(id + eye.suffix).value);
      if (values.every(v => !v.trim())) continue;
      try { next[eye.key] = optics.calculate(...values); }
      catch (error) { throw new Error(`${eye.label}: ${error.message}`); }
    }
    if (!Object.keys(next).length) throw new Error("Enter sphere and cylinder for at least one eye (use 0 cylinder for sphere only).");
    return next;
  }
  function renderEye(eye, next, from, to) {
    const get = id => $(id + eye.suffix);
    const { original: o, transposed: t, se, converted } = next;
    get("calcOriginal").textContent = show$(optics.formatRx(o));
    get("calcTransposed").textContent = show$(optics.formatRx(t));
    get("calcNotation").textContent = t.cylinder === 0 ? "Sphere only · axis not applicable" : t.cylinder < 0 ? "Minus-cylinder notation" : "Plus-cylinder notation";
    get("calcSE").textContent = show$(`${f(next.roundedSE)} D`);
    if (calculatorTool === "conversion") {
      get("calcVertexTitle").textContent = mode() === "custom" ? "Vertex optical equivalent" : mode() === "contactsToSpectacles" ? "Spectacle-plane optical equivalent" : "Contact-plane optical equivalent";
      get("calcVertex").textContent = show$(displayRx(converted));
      get("calcVertexPlanes").textContent = `${Number(from)} mm → ${Number(to)} mm from cornea`;
      get("calcVertexContext").textContent = Number(from) === Number(to) ? "Same plane · no compensation"
        : Math.max(Math.abs(o.sphere), Math.abs(o.sphere + o.cylinder)) >= 4 ? "At least one principal meridian is ±4.00 D or greater." : "Both principal meridians are below ±4.00 D.";
      get("calcVertexMeridians").textContent = show$(`Principal powers: ${converted.sphere.toFixed(2)} D / ${(converted.sphere + converted.cylinder).toFixed(2)} D`);
      get("calcVertexRounded").textContent = show$(optics.formatRx({ ...converted, sphere: quarter(converted.sphere), cylinder: quarter(converted.cylinder) }));
    }
    const rows = calculatorTool === "conversion" ? [
      ["Formula (each meridian)", "F₂ = F₁ / [1 − ((source mm − target mm) / 1000) × F₁]"],
      ["Input principal powers", `${f(o.sphere)} D / ${f(o.sphere + o.cylinder)} D`]
    ] : calculatorTool === "transpose" ? [
      ["Sphere + cylinder", `${f(o.sphere)} + (${f(o.cylinder)}) = ${f(t.sphere)} D`],
      ["Reverse cylinder sign", `${f(o.cylinder)} → ${f(t.cylinder)} D`],
      ["Rotate axis by 90°", o.axis === null ? "Not applicable" : `${o.axis}° → ${t.axis}°`]
    ] : [
      ["Exact spherical equivalent", `${f(o.sphere)} + (${f(o.cylinder)} ÷ 2) = ${f(se)} D`],
      ["Nearest 0.25 D", `${f(se)} D → ${f(next.roundedSE)} D`]
    ];
    get("calculatorMath").replaceChildren(...rows.flatMap(([label, value]) => {
      const dt = document.createElement("dt"); dt.textContent = label;
      const dd = document.createElement("dd"); dd.textContent = show$(value);
      return [dt, dd];
    }));
    get("calculatorRounding").hidden = calculatorTool !== "se";
    get("calculatorRounding").textContent = next.lowerQuarter === next.upperQuarter ? "Exact 0.25 D increment."
      : show$(`Adjacent values: ${f(next.lowerQuarter)} D and ${f(next.upperQuarter)} D.`);
  }
  function show(next) {
    const from = $("calcFromVertex").value.trim().replace(",", "."), to = $("calcToVertex").value.trim().replace(",", ".");
    if (calculatorTool === "conversion") {
      // Validate every entered eye and conversion before revealing any result.
      for (const eye of eyes) if (next[eye.key]) next[eye.key].converted = optics.convertVertex(next[eye.key].original, from, to);
    }
    result = next;
    if (calculatorTool === "conversion") {
      $("calcSummaryTitle").textContent = mode() === "custom" ? "Vertex optical equivalents" : mode() === "contactsToSpectacles" ? "Spectacle-plane optical equivalents" : "Contact-plane optical equivalents";
      $("calcSummaryPlanes").textContent = `${Number(from)} mm → ${Number(to)} mm from cornea`;
    }
    for (const eye of eyes) {
      $("calcSummaryRow" + eye.suffix).hidden = !next[eye.key];
      $("calcEyeResults" + eye.suffix).hidden = !next[eye.key];
      if (next[eye.key]) renderEye(eye, next[eye.key], from, to);
    }
    $("calculatorError").textContent = "";
    $("calculatorStatus").textContent = "";
    $("calculatorEmpty").hidden = true;
    $("calculatorResults").hidden = false;
    applyToolVisibility();
  }
  $("calculatorForm").addEventListener("submit", event => {
    event.preventDefault(); invalidate();
    try { show(readEyes()); } catch (error) { $("calculatorError").textContent = error.message; }
  });
  for (const eye of eyes) for (const id of ["calcSphere", "calcCylinder", "calcAxis"]) $(id + eye.suffix).addEventListener("input", invalidate);
  ["calcFromVertex", "calcToVertex"].forEach(id => $(id).addEventListener("input", invalidate));
  $("calcConversion").addEventListener("change", configureMode);
  calculatorTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectCalculatorTool(tab.dataset.calculatorTool));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? calculatorTabs.length - 1
        : event.key === "ArrowRight" ? (index + 1) % calculatorTabs.length : (index - 1 + calculatorTabs.length) % calculatorTabs.length;
      selectCalculatorTool(calculatorTabs[next].dataset.calculatorTool, true);
    });
  });
  $("calculatorPasteForm").addEventListener("submit", event => {
    event.preventDefault(); $("calculatorPasteError").textContent = "";
    try {
      const parsed = optics.parse($("calculatorPaste").value);
      const eye = eyes.find(e => e.key === $("calculatorPasteEye").value);
      setInputs(parsed.original, eye.suffix); invalidate(); show(readEyes());
    } catch (error) { $("calculatorPasteError").textContent = error.message; }
  });
  $("calculatorReset").addEventListener("click", () => {
    $("calculatorForm").reset(); $("calculatorPasteForm").reset();
    $("calculatorPasteError").textContent = ""; configureMode(); $("calcSphere").focus();
  });
  async function copyText(text, label) {
    try { await navigator.clipboard.writeText(text); $("calculatorStatus").textContent = `${label} copied.`; }
    catch { $("calculatorStatus").textContent = "Clipboard unavailable. Select and copy the displayed result manually."; }
  }
  for (const eye of eyes) {
    $("useTransposed" + eye.suffix).addEventListener("click", () => {
      if (!result?.[eye.key]) return;
      setInputs(result[eye.key].transposed, eye.suffix); invalidate();
      try { show(readEyes()); } catch (error) { $("calculatorError").textContent = error.message; }
    });
    for (const [id, kind] of [["copyTransposed", "rx"], ["copySE", "se"], ["copyVertex", "vertex"]]) $(id + eye.suffix).addEventListener("click", () => {
      const r = result?.[eye.key]; if (!r) return;
      const text = kind === "rx" ? optics.formatRx(r.transposed) : kind === "se" ? `${f(r.roundedSE)} D` : `${eye.label}: ${displayRx(r.converted)} (${$("calcFromVertex").value} mm → ${$("calcToVertex").value} mm)`;
      copyText(text, kind === "rx" ? "Transposed Rx" : kind === "se" ? "Spherical equivalent" : "Conversion");
    });
  }
  $("copyBothVertex").addEventListener("click", () => {
    if (!result) return;
    const plane = `${$("calcFromVertex").value} mm → ${$("calcToVertex").value} mm`;
    const lines = eyes.filter(e => result[e.key]).map(e => `${e.label}: ${displayRx(result[e.key].converted)}`);
    copyText([`Optical equivalents (${plane})`, ...lines].join("\n"), "Conversion results");
  });
  configureMode();
  selectCalculatorTool("conversion");
})();
