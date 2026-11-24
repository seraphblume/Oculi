// The first-run splash, the About sheet and the viewer's theme (palette × appearance).
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const ZL = window.ZLField;
  const engines = window.DioptraEngines;
  const SPLASH_KEY = "oculi-zl-first-run";
  const PALETTE_KEY = "oculi-zl-palette";
  const APPEARANCE_KEY = "oculi-zl-appearance";
  const PALETTES = ["zephyr", "boreas", "harukaze"];

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode: the choice lasts this visit */ } }
  };

  function releaseName() {
    const id = engines.primaryId(), e = engines.ENGINES[id];
    return `${e.label} ${e.version().split(".").slice(0, 2).join(".")}`;
  }

  // A field at `width` px, or the vector emblem where the glyphs would fall under their minimum.
  function startField(canvas, width, arrival) {
    if (!ZL || !canvas) return null;
    canvas.setAttribute("aria-label", ZL.MOTTO_LABEL);
    const field = new ZL.Field(canvas, { width, columns: 137, arrival, interactive: true });
    field.start();
    return field;
  }

  // ---------------------------------------------------------------- splash

  let splashField = null;

  function showSplash() {
    $("zlSplashVersion").textContent = releaseName();
    $("zlSplash").hidden = false;
    const width = Math.round(Math.min(320, window.innerWidth * 0.62, window.innerHeight * 0.42));
    splashField = startField($("zlSplashField"), width, "centreOut");
    $("zlSplashContinue").focus();
  }

  function closeSplash() {
    store.set(SPLASH_KEY, releaseName());
    if (splashField) splashField.stop();
    splashField = null;
    $("zlSplash").hidden = true;
  }

  // ---------------------------------------------------------------- About

  let aboutField = null;

  function engineRows() {
    const rows = [
      [releaseName(), "Primary · v0.3.0 rules"],
      [(() => { const e = engines.ENGINES[engines.shadowId()]; return `${e.label} ${e.version().split(".").slice(0, 2).join(".")}`; })(), "Comparison · former Beryl 1.0"],
      ["Goshenite 1.0", "Flagship · collecting outcomes, not trained"],
      [`ZL Retina ${window.ZLRetina ? window.ZLRetina.version : ""}`.trim(), "Vision comparison in Genius"]
    ];
    return rows.map(([name, role]) => `<div class="row"><span class="row-label">${name}</span><span class="row-detail">${role}</span></div>`).join("");
  }

  function openAbout() {
    $("aboutVersion").textContent = `${releaseName()} · ZepheniaLabs`;
    $("aboutEngines").innerHTML = engineRows();
    $("aboutPalette").value = document.documentElement.dataset.palette || "zephyr";
    $("aboutAppearance").value = document.documentElement.dataset.theme || "device";
    $("aboutDialog").showModal();
    if (!aboutField) aboutField = startField($("aboutField"), 200, "none");
  }

  function closeAbout() {
    if (aboutField) aboutField.stop();
    aboutField = null;
  }

  function setPalette(id) {
    if (!PALETTES.includes(id)) return;
    if (id === "zephyr") delete document.documentElement.dataset.palette;
    else document.documentElement.dataset.palette = id;
    store.set(PALETTE_KEY, id);
  }

  function setAppearance(mode) {
    if (mode === "light" || mode === "dark") document.documentElement.dataset.theme = mode;
    else delete document.documentElement.dataset.theme;
    store.set(APPEARANCE_KEY, mode);
  }

  $("aboutBtn").addEventListener("click", openAbout);
  $("aboutDialog").addEventListener("close", closeAbout);
  $("aboutPalette").addEventListener("change", e => setPalette(e.target.value));
  $("aboutAppearance").addEventListener("change", e => setAppearance(e.target.value));
  $("zlSplashContinue").addEventListener("click", closeSplash);
  $("zlSplash").addEventListener("keydown", e => { if (e.key === "Escape" || e.key === "Enter") closeSplash(); });

  if (!store.get(SPLASH_KEY)) showSplash();

  window.OculiStudio = Object.freeze({ SPLASH_KEY, PALETTE_KEY, APPEARANCE_KEY, showSplash, openAbout });
})();
