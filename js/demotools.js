// Demotools: True Vision (ZL Retina) and Frame/Lens Preview (ZL Thickness, polycarbonate).
// Both are illustrations for the patient. Nothing here reads or writes storage.
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const Rx = window.OculiRx;
  const Vision = window.OculiVisionCompare;
  const Lens = window.OculiLensPreview;
  const show$ = Rx.displayMinus;
  const SVG = "http://www.w3.org/2000/svg";

  // ---------------------------------------------------------------- build

  document.querySelectorAll("#demoPanel .rx-table[data-rx]").forEach(el => {
    el.innerHTML = Rx.rxRowHTML(el.dataset.rx, el.dataset.eye, el.dataset.rx.startsWith("tvCur") ? "current" : "Rx");
  });
  ["tvCurAdd", "tvFinAdd"].forEach(id => { $(id).innerHTML = Rx.addOptionsHTML(); });

  // ---------------------------------------------------------------- sub-tabs

  const subTabs = [$("demoVisionTab"), $("demoLensTab")];
  const subPanels = [$("demoVisionForm"), $("demoLensForm")];
  function selectTool(index, focus = false) {
    subTabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      subPanels[i].hidden = i !== index;
    });
    if (focus) subTabs[index].focus();
  }
  subTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTool(index));
    tab.addEventListener("keydown", e => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      selectTool(e.key === "Home" ? 0 : e.key === "End" ? 1 : 1 - index, true);
    });
  });

  // Zero or blank cylinder means sphere only, as everywhere else in Oculi.
  $("demoPanel").addEventListener("change", e => {
    const m = e.target.id.match(/^((?:tvCur|tvFin)O[ds]|flRx[AB])(Sph|Cyl)$/);
    if (m) Rx.syncRxAxis(m[1], true);
  });

  // A sign tap changes the Rx without an input event.
  $("demoPanel").addEventListener("click", e => {
    if (!e.target.closest(".sign:not(.static)")) return;
    if (e.target.closest("#demoVisionForm")) clearVision("Inputs changed · show the comparison again.");
    else $("flCompare").hidden = true;
  });

  function readRx(prefix, label, required) {
    const r = Rx.readOptionalCylRx(prefix);
    const blank = r.sphere == null && Rx.rawText(`${prefix}Cyl`) === "";
    if (blank) {
      if (required) throw new Error(`Enter ${label}.`);
      return null;
    }
    if (!Rx.validRx(r)) throw new Error(`${label}: enter sphere, cylinder and an axis from 1 to 180 (or no cylinder).`);
    return r;
  }

  const readAdd = id => { const v = Number($(id).value); return Number.isFinite(v) && v > 0 ? v : 0; };

  // ---------------------------------------------------------------- True Vision

  const tvCanvases = () => ({ current: $("tvCanvasCurrent"), true: $("tvCanvasTrue") });

  function clearVision(message) {
    if (!$("tvCompare").hidden) Vision.clear(tvCanvases());
    $("tvCompare").hidden = true;
    if (message) $("tvStatus").textContent = message;
  }

  function outOfFocus(v) { return Math.abs(v.m) + Math.hypot(v.j0, v.j45); }
  function viewNote(v, lens) {
    const parts = [lens];
    const d = outOfFocus(v);
    parts.push(d < 0.125 ? "in focus" : `about ${d.toFixed(2)} D out of focus`);
    if (v.accommodationUsed >= 0.25) parts.push(`focusing ${v.accommodationUsed.toFixed(2)} D`);
    if (v.limited) parts.push("blur shown at the demo's limit");
    return show$(parts.join(" · "));
  }

  async function showVision(event) {
    event.preventDefault();
    const status = $("tvStatus");
    let input;
    try {
      const ageText = $("tvAge").value.trim();
      if (!/^\d{1,3}$/.test(ageText) || Number(ageText) < 1 || Number(ageText) > 120) throw new Error("Enter an age from 1 to 120.");
      const eyeId = $("tvEye").dataset.value || "od";
      const key = eyeId === "od" ? "Od" : "Os";
      const eyeName = eyeId === "od" ? "right eye · OD" : "left eye · OS";
      const final = readRx(`tvFin${key}`, `the final Rx for the ${eyeName}`, true);
      const wears = $("tvGlasses").dataset.value === "yes";
      const current = wears ? readRx(`tvCur${key}`, `the current glasses for the ${eyeName}`, true) : null;
      input = {
        age: Number(ageText), scene: $("tvScene").dataset.value || "distance", eyeId,
        eye: final, current, currentAdd: wears ? readAdd("tvCurAdd") : 0, trueAdd: readAdd("tvFinAdd"), nearDistanceM: 0.4
      };
    } catch (error) {
      clearVision(error.message);
      return;
    }
    status.textContent = "Rendering…";
    $("tvShow").disabled = true;
    try {
      const views = await Vision.render(tvCanvases(), input);
      if (!views) return;
      $("tvCompare").hidden = false;
      $("tvCurrentNote").textContent = viewNote(views.current, input.current ? `Current glasses ${Rx.fmtRx(input.current)}` : "No glasses");
      $("tvTrueNote").textContent = viewNote(views.true, `Final Rx ${Rx.fmtRx(input.eye)}`);
      status.textContent = `${input.eyeId === "od" ? "Right eye" : "Left eye"} ${input.scene === "near" ? "at 40 cm" : "at distance"}. Nothing entered here is saved.`;
    } catch (error) {
      status.textContent = `Could not render the comparison: ${error.message}`;
    } finally {
      $("tvShow").disabled = false;
    }
  }

  $("demoVisionForm").addEventListener("submit", showVision);
  $("demoVisionForm").addEventListener("input", () => clearVision("Inputs changed · show the comparison again."));
  $("demoVisionForm").addEventListener("segmentchange", e => {
    if (e.target.id === "tvGlasses") {
      const wears = e.detail.value === "yes";
      $("tvCurrentFields").hidden = !wears;
      $("tvCurrentFields").disabled = !wears;
      clearVision("Inputs changed · show the comparison again.");
    } else if (!$("tvCompare").hidden) {
      $("tvShow").click();
    }
  });
  $("tvReset").addEventListener("click", () => {
    resetForm($("demoVisionForm"));
    setSegment("tvGlasses", "none"); setSegment("tvEye", "od"); setSegment("tvScene", "distance");
    $("tvCurrentFields").hidden = true; $("tvCurrentFields").disabled = true;
    clearVision("Works at any age. Nothing entered here is saved.");
    $("tvAge").focus();
  });

  // ---------------------------------------------------------------- Frame/Lens Preview

  function num(id, label) {
    const t = $(id).value.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error(`${label}: enter a number.`);
    return n;
  }

  function el(tag, attrs = {}, text) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
  }

  // The lens as you face the wearer: OD's nasal side to the right, OS's to the left.
  // The band inside the rim is the edge thickness at true scale.
  function frontView(p, scale) {
    const flip = p.eye === "os" ? -1 : 1;
    const pad = 26; // room for the callouts and the nasal mark
    const xs = p.mesh.rim.map(q => q[0]), ys = p.mesh.rim.map(q => q[1]);
    const halfW = Math.max(...xs.map(Math.abs)), top = Math.max(...ys), bottom = Math.min(...ys);
    const width = 2 * halfW * scale + 2 * pad, height = (top - bottom) * scale + 2 * pad;
    const X = x => width / 2 + flip * x * scale, Y = y => pad + (top - y) * scale;
    const size = width;
    const svg = el("svg", { viewBox: `0 0 ${width.toFixed(1)} ${height.toFixed(1)}`, class: "lens-svg", role: "img" });
    const outer = [], inner = [];
    p.mesh.rim.forEach(([x, y], i) => {
      const r = Math.hypot(x, y), t = Math.min(p.mesh.edgeMm[i], r * 0.6);
      outer.push(`${X(x).toFixed(2)},${Y(y).toFixed(2)}`);
      inner.push(`${X(x * (1 - t / r)).toFixed(2)},${Y(y * (1 - t / r)).toFixed(2)}`);
    });
    svg.append(el("path", { d: `M${outer.join("L")}Z M${inner.reverse().join("L")}Z`, class: "lens-band", "fill-rule": "evenodd" }));
    svg.append(el("polygon", { points: outer.reverse().join(" "), class: "lens-rim" }));
    // optical centre
    const [ox, oy] = p.decentration;
    svg.append(el("path", { d: `M${X(ox) - 6},${Y(oy)}H${X(ox) + 6}M${X(ox)},${Y(oy) - 6}V${Y(oy) + 6}`, class: "lens-oc" }));
    // nasal marker
    svg.append(el("text", { x: flip > 0 ? size - 4 : 4, y: Y(0) + 4, class: "lens-tick", "text-anchor": flip > 0 ? "end" : "start" }, "N"));
    // callouts: thickest and thinnest rim points
    for (const [mark, cls] of [[p.thickest, "lens-callout"], [p.thinnest, "lens-callout thin"]]) {
      const [x, y] = p.mesh.rim[mark.deg];
      const r = Math.hypot(x, y), ux = x / r, uy = y / r;
      const x1 = X(x), y1 = Y(y), x2 = X(x + ux * 7), y2 = Y(y + uy * 7);
      svg.append(el("line", { x1, y1, x2, y2, class: cls }));
      svg.append(el("circle", { cx: x1, cy: y1, r: 2.2, class: cls }));
    }
    svg.setAttribute("aria-label", `${p.eye.toUpperCase()} lens front view: edge ${p.thinnest.mm.toFixed(1)} to ${p.thickest.mm.toFixed(1)} mm, centre ${p.mesh.centerMm.toFixed(1)} mm`);
    return svg;
  }

  // Colour fringing through one point of the lens. The prism spreads each point of the letters
  // into a short spectrum, red at one end and blue at the other (Prentice ÷ Abbe gives that spread);
  // each colour channel averages its third of the spectrum. Same scale as the True Vision chart.
  function fringeStrip(prism) {
    const W = 240, H = 46;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    c.className = "fringe-strip";
    const g = c.getContext("2d");
    g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#111111";
    g.font = '500 30px "Helvetica Neue", Helvetica, Arial, sans-serif';
    g.textBaseline = "middle";
    g.fillText("H  N  O  Z  K", 16, H / 2 + 1);
    const spread = (prism * 34.38) / Vision.PITCH_ARCMIN; // px from red to blue: 1 Δ = 34.38′
    const img = g.getImageData(0, 0, W, H), d = img.data;
    const band = [[-0.5, -1 / 6], [-1 / 6, 1 / 6], [1 / 6, 0.5]]; // red, green, blue thirds
    const pad = Math.ceil(spread) + 2;
    const sum = new Float64Array(W + 2 * pad + 1); // prefix sums of the row padded with white
    const out = new Uint8ClampedArray(d.length);
    for (let y = 0; y < H; y++) {
      for (let k = 0; k < W + 2 * pad; k++) {
        const x = k - pad;
        sum[k + 1] = sum[k] + (x < 0 || x >= W ? 255 : d[(y * W + x) * 4]);
      }
      const at = v => { // integral of the padded row from its start to position v (in source px)
        const k = Math.max(0, Math.min(W + 2 * pad, v + pad)), f = Math.floor(k);
        return sum[f] + (f < W + 2 * pad ? (k - f) * (sum[f + 1] - sum[f]) : 0);
      };
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const lo = x + 0.5 + band[ch][0] * spread, hi = x + 0.5 + band[ch][1] * spread;
          out[i + ch] = hi - lo < 1 ? d[i] : (at(hi) - at(lo)) / (hi - lo);
        }
        out[i + 3] = 255;
      }
    }
    img.data.set(out);
    g.putImageData(img, 0, 0);
    c.setAttribute("role", "img");
    c.setAttribute("aria-label", `Letters with ${prism.toFixed(2)} prism dioptres of colour fringing`);
    return c;
  }

  const fmtMm = v => `${v.toFixed(1)} mm`;
  function figureFor(target, name, p, scale) {
    target.replaceChildren();
    const head = document.createElement("figcaption");
    head.innerHTML = `<strong></strong><span></span>`;
    head.firstChild.textContent = name;
    head.lastChild.textContent = show$(`${Rx.fmtRx(p.rx)} · ${p.eye.toUpperCase()}`);
    target.append(head, frontView(p, scale));
    const dl = document.createElement("dl");
    dl.className = "lens-figures";
    const rows = [
      ["Centre", fmtMm(p.mesh.centerMm)],
      ["Thickest edge", `${fmtMm(p.thickest.mm)} · ${p.thickest.where}`],
      ["Thinnest edge", `${fmtMm(p.thinnest.mm)} · ${p.thinnest.where}`],
      ["Weight · one lens", `${p.mesh.massG.toFixed(1)} g`],
      ["Front base curve", `${p.base.toFixed(p.base % 1 ? 2 : 0)} D`],
      ["Colour fringing · 10 mm", `${p.fringe.at10mm.toFixed(2)} Δ`],
      ["Colour fringing · edge", `${p.fringe.atRim.toFixed(2)} Δ${p.fringe.atRim >= p.fringe.threshold ? " · noticeable" : ""}`]
    ];
    for (const [k, v] of rows) {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = show$(v);
      dl.append(dt, dd);
    }
    target.append(dl);
    const strips = document.createElement("div");
    strips.className = "fringe-strips";
    for (const [label, prism] of [["10 mm from centre", p.fringe.at10mm], ["At the edge", p.fringe.atRim]]) {
      const wrap = document.createElement("div");
      const cap = document.createElement("span"); cap.className = "fringe-label"; cap.textContent = label;
      wrap.append(cap, fringeStrip(prism));
      strips.append(wrap);
    }
    target.append(strips);
    if (p.mesh.carrierUsed) {
      const note = document.createElement("p");
      note.className = "group-footer";
      note.textContent = "This Rx is beyond what a single curve can make across this frame; the edge is an estimate.";
      target.append(note);
    }
  }

  function showLenses(event) {
    event.preventDefault();
    $("flError").textContent = "";
    try {
      const frame = {
        shape: $("flShape").value,
        a: num("flA", "Lens width"), b: num("flB", "Lens height"), dbl: num("flDbl", "Bridge"),
        pd: num("flPd", "Monocular PD"), fittingHeight: num("flFh", "Fitting height")
      };
      if ([frame.a, frame.b, frame.dbl, frame.pd].some(v => v == null)) throw new Error("Enter A, B, DBL and the monocular PD.");
      const eye = $("flEye").dataset.value || "od";
      const a = readRx("flRxA", "Rx A", true), b = readRx("flRxB", "Rx B", true);
      const pa = Lens.preview(a, frame, eye), pb = Lens.preview(b, frame, eye);
      const scale = 3; // px per mm, the same for both so the bands compare
      figureFor($("flFigA"), $("flNameA").value.trim() || "Rx A", pa, scale);
      figureFor($("flFigB"), $("flNameB").value.trim() || "Rx B", pb, scale);
      $("flCompare").hidden = false;
      $("flNotes").hidden = false;
    } catch (error) {
      $("flCompare").hidden = true;
      $("flError").textContent = error.message;
    }
  }

  $("demoLensForm").addEventListener("submit", showLenses);
  $("demoLensForm").addEventListener("input", () => { $("flCompare").hidden = true; });
  $("demoLensForm").addEventListener("segmentchange", () => { if (!$("flCompare").hidden) $("flShow").click(); });
  $("flReset").addEventListener("click", () => {
    resetForm($("demoLensForm"));
    setSegment("flEye", "od");
    $("flCompare").hidden = true; $("flNotes").hidden = true; $("flError").textContent = "";
  });

  // ---------------------------------------------------------------- helpers

  function setSegment(id, value) {
    const seg = $(id);
    seg.dataset.value = value;
    seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.value === value)));
  }

  function resetForm(form) {
    form.reset();
    form.querySelectorAll(".field[data-sign]").forEach(f => { f.dataset.sign = "-1"; });
    form.querySelectorAll(".sign:not(.static)").forEach(b => { b.textContent = Rx.MINUS; });
    form.querySelectorAll("select.field[id$='Ax']").forEach(s => { s.disabled = false; });
  }

  window.OculiDemotools = Object.freeze({ selectTool });
})();
