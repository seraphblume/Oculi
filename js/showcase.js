// Showcase: Clarity (ZL Retina) and Lens Studio (ZL Thickness, polycarbonate).
// Both are illustrations for the patient. Nothing here reads or writes storage.
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const Rx = window.OculiRx;
  const Vision = window.OculiVisionCompare;
  const Lens = window.OculiLensStudio;
  const show$ = Rx.displayMinus;
  const SVG = "http://www.w3.org/2000/svg";

  // ---------------------------------------------------------------- build

  document.querySelectorAll("#showcasePanel .rx-table[data-rx]").forEach(el => {
    el.innerHTML = Rx.rxRowHTML(el.dataset.rx, el.dataset.eye, el.dataset.rx.startsWith("tvCur") ? "current" : "Rx");
  });
  // Lens Studio: one table per Rx with an OD and an OS row under a single header.
  document.querySelectorAll("#showcasePanel .rx-table[data-rx-pair]").forEach(el => {
    const p = el.dataset.rxPair, kind = p.endsWith("A") ? "Rx A" : "Rx B";
    const os = Rx.rxRowHTML(`${p}Os`, "OS", kind);
    el.innerHTML = Rx.rxRowHTML(`${p}Od`, "OD", kind) + os.slice(os.indexOf('<div class="rx-row">'));
  });
  ["tvCurAdd", "tvFinAdd"].forEach(id => { $(id).innerHTML = Rx.addOptionsHTML(); });

  // ---------------------------------------------------------------- sub-tabs

  const subTabs = [$("clarityTab"), $("lensStudioTab")];
  const subPanels = [$("clarityForm"), $("lensStudioForm")];
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
  $("showcasePanel").addEventListener("change", e => {
    const m = e.target.id.match(/^((?:tvCur|tvFin|flRxA|flRxB)O[ds])(Sph|Cyl)$/);
    if (m) Rx.syncRxAxis(m[1], true);
  });

  // A sign tap changes the Rx without an input event.
  $("showcasePanel").addEventListener("click", e => {
    if (!e.target.closest(".sign:not(.static)")) return;
    if (e.target.closest("#clarityForm")) clearVision("Inputs changed · show the comparison again.");
    else $("flCompare").hidden = true;
  });

  function readRx(prefix, label, required) {
    const r = Rx.readOptionalCylRx(prefix);
    const blank = r.sphere == null && Rx.rawText(`${prefix}Cyl`) === "";
    if (blank) {
      if (required) throw new Error(`Enter ${label}.`);
      return null;
    }
    if (!Rx.validRx(r)) throw new Error(`${label}: complete the sphere, cylinder and axis.`);
    return r;
  }

  const readAdd = id => { const v = Number($(id).value); return Number.isFinite(v) && v > 0 ? v : 0; };

  // ---------------------------------------------------------------- Clarity

  const tvCanvases = () => ({ current: $("tvCanvasCurrent"), true: $("tvCanvasTrue") });

  // The distance view is a photo; it loads once, on the first distance render.
  let photo = null;
  function distancePhoto() {
    if (!photo) {
      const img = new Image();
      img.src = "assets/clarity-distance.jpg";
      photo = img.decode().then(() => img).catch(() => { photo = null; return null; });
    }
    return photo;
  }
  const EYE_NAMES = { od: "right eye · OD", os: "left eye · OS" };

  function clearVision(message) {
    if (!$("tvCompare").hidden) Vision.clear(tvCanvases());
    $("tvCompare").hidden = true;
    if (message) $("tvStatus").textContent = message;
  }

  function outOfFocus(v) { return Math.abs(v.m) + Math.hypot(v.j0, v.j45); }
  function viewNote(v, lens) {
    const parts = [lens];
    if (v.eyeId) parts.push(v.spread < 0.125 ? "both eyes alike" : `${v.eyeId.toUpperCase()} sharper`);
    const d = outOfFocus(v);
    parts.push(d < 0.125 ? "in focus" : `about ${d.toFixed(2)} D out of focus`);
    if (v.accommodationUsed >= 0.25) parts.push(`focusing ${v.accommodationUsed.toFixed(2)} D`);
    if (v.limited) parts.push("blur capped for display");
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
      const wears = $("tvGlasses").dataset.value === "yes";
      const read = id => {
        const key = id === "od" ? "Od" : "Os";
        return {
          id, eye: readRx(`tvFin${key}`, `the final Rx for the ${EYE_NAMES[id]}`, true),
          current: wears ? readRx(`tvCur${key}`, `the current glasses for the ${EYE_NAMES[id]}`, true) : null
        };
      };
      const shown = eyeId === "ou" ? [read("od"), read("os")] : [read(eyeId)];
      const scene = $("tvScene").dataset.value || "distance";
      input = {
        age: Number(ageText), scene, eyeId,
        currentAdd: wears ? readAdd("tvCurAdd") : 0, trueAdd: readAdd("tvFinAdd"), nearDistanceM: 0.4,
        ...(eyeId === "ou" ? { eyes: shown } : { eye: shown[0].eye, current: shown[0].current })
      };
      input.rx = Object.fromEntries(shown.map(e => [e.id, e]));
    } catch (error) {
      clearVision(error.message);
      return;
    }
    status.textContent = "Rendering…";
    $("tvShow").disabled = true;
    try {
      if (input.scene !== "near") input.photo = await distancePhoto();
      const views = await Vision.render(tvCanvases(), input);
      if (!views) return;
      $("tvCompare").hidden = false;
      // One eye: name its Rx. Both eyes: the note says which eye leads instead.
      const rxText = key => (input.eyes ? "" : ` ${Rx.fmtRx(input.rx[input.eyeId][key])}`);
      const wearing = $("tvGlasses").dataset.value === "yes";
      $("tvCurrentNote").textContent = viewNote(views.current, wearing ? `Current glasses${rxText("current")}` : "No glasses");
      $("tvTrueNote").textContent = viewNote(views.true, `Final Rx${rxText("eye")}`);
      const who = { od: "Right eye", os: "Left eye", ou: "Both eyes" }[input.eyeId];
      status.textContent = `${who} · ${input.scene === "near" ? "near, 40 cm" : "distance"}`;
    } catch (error) {
      status.textContent = `Could not render the comparison: ${error.message}`;
    } finally {
      $("tvShow").disabled = false;
    }
  }

  $("clarityForm").addEventListener("submit", showVision);
  $("clarityForm").addEventListener("input", () => clearVision("Inputs changed · show the comparison again."));
  $("clarityForm").addEventListener("segmentchange", e => {
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
    resetForm($("clarityForm"));
    setSegment("tvGlasses", "none"); setSegment("tvEye", "od"); setSegment("tvScene", "distance");
    $("tvCurrentFields").hidden = true; $("tvCurrentFields").disabled = true;
    clearVision("Nothing here is saved.");
    $("tvAge").focus();
  });

  // ---------------------------------------------------------------- Lens Studio

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

  // The whole frame as you face the wearer: OD on the left with its nasal side towards the bridge,
  // OS on the right. Drawn in millimetres, so both frames share one scale; the band inside each
  // rim is the edge thickness at true scale.
  function frameView(pair, frame) {
    const half = (frame.a + frame.dbl) / 2; // boxing centre of each lens from the bridge centre
    const padX = 9, padTop = 7, padBottom = 10;
    const top = frame.b / 2 + padTop, width = 2 * (half + frame.a / 2 + padX), height = frame.b + padTop + padBottom;
    const svg = el("svg", { viewBox: `${-width / 2} ${-top} ${width} ${height}`, class: "frame-svg", role: "img" });
    const lenses = [[pair.od, -half, 1], [pair.os, half, -1]]; // [preview, centre x, nasal direction]
    const at = (cx, dir, x, y) => [cx + dir * x, -y];
    for (const [p, cx, dir] of lenses) {
      const outer = [], inner = [];
      p.mesh.rim.forEach(([x, y], i) => {
        const r = Math.hypot(x, y), t = Math.min(p.mesh.edgeMm[i], r * 0.6);
        outer.push(at(cx, dir, x, y).map(v => v.toFixed(2)).join(","));
        inner.push(at(cx, dir, x * (1 - t / r), y * (1 - t / r)).map(v => v.toFixed(2)).join(","));
      });
      svg.append(el("path", { d: `M${outer.join("L")}Z M${inner.reverse().join("L")}Z`, class: "lens-band", "fill-rule": "evenodd" }));
      svg.append(el("polygon", { points: outer.join(" "), class: "lens-rim" }));
      const [ox, oy] = at(cx, dir, p.decentration[0], p.decentration[1]);
      svg.append(el("path", { d: `M${ox - 2},${oy}H${ox + 2}M${ox},${oy - 2}V${oy + 2}`, class: "lens-oc" }));
      for (const [mark, cls] of [[p.thickest, "lens-callout"], [p.thinnest, "lens-callout thin"]]) {
        const [x, y] = p.mesh.rim[mark.deg];
        const r = Math.hypot(x, y);
        const [x1, y1] = at(cx, dir, x, y), [x2, y2] = at(cx, dir, x + (x / r) * 4, y + (y / r) * 4);
        svg.append(el("line", { x1, y1, x2, y2, class: cls }));
        svg.append(el("circle", { cx: x1, cy: y1, r: 0.9, class: cls }));
      }
      svg.append(el("text", { x: cx, y: frame.b / 2 + 7, class: "lens-tick", "text-anchor": "middle" }, p.eye.toUpperCase()));
    }
    // bridge, from just above each lens's nasal edge
    const [nx, ny] = pair.od.mesh.rim[25];
    const [bx1, by1] = at(-half, 1, nx, ny), [bx2] = at(half, -1, nx, ny);
    svg.append(el("path", { d: `M${bx1},${by1} Q0,${by1 - 4} ${bx2},${by1}`, class: "frame-bridge" }));
    const pairMass = pair.od.mesh.massG + pair.os.mesh.massG;
    svg.setAttribute("aria-label", `Frame front view. OD edge ${pair.od.thinnest.mm.toFixed(1)} to ${pair.od.thickest.mm.toFixed(1)} mm, OS edge ${pair.os.thinnest.mm.toFixed(1)} to ${pair.os.thickest.mm.toFixed(1)} mm, ${pairMass.toFixed(1)} g for the pair`);
    return svg;
  }

  // Colour fringing through one point of the lens. The prism spreads each point of the letters
  // into a short spectrum, red at one end and blue at the other (Prentice ÷ Abbe gives that spread);
  // each colour channel averages its third of the spectrum. Same scale as the Clarity chart.
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
  const fmtPrism = (v, threshold) => ({ text: `${v.toFixed(2)} Δ`, notice: v >= threshold });

  function caption(name, pair) {
    const cap = document.createElement("figcaption");
    const strong = document.createElement("strong"); strong.textContent = name;
    const line = document.createElement("span");
    line.textContent = show$(`OD ${Rx.fmtRx(pair.od.rx)} · OS ${Rx.fmtRx(pair.os.rx)}`);
    cap.append(strong, line);
    return cap;
  }

  function figureFor(target, name, pair, frame) {
    target.replaceChildren(caption(name, pair), frameView(pair, frame));
  }

  function dataFor(target, name, pair) {
    target.replaceChildren();
    const head = document.createElement("h3");
    head.className = "frame-data-title";
    head.textContent = name;
    const table = document.createElement("table");
    table.className = "lens-table";
    table.innerHTML = "<thead><tr><th scope=\"col\"><span class=\"visually-hidden\">Figure</span></th><th scope=\"col\">OD</th><th scope=\"col\">OS</th></tr></thead><tbody></tbody>";
    const rows = [
      ["Centre", p => fmtMm(p.mesh.centerMm)],
      ["Thickest edge", p => fmtMm(p.thickest.mm)],
      ["Thinnest edge", p => fmtMm(p.thinnest.mm)],
      ["Weight", p => `${p.mesh.massG.toFixed(1)} g`],
      ["Base curve", p => `${p.base.toFixed(p.base % 1 ? 2 : 0)} D`],
      ["Fringing · 10 mm", p => fmtPrism(p.fringe.at10mm, p.fringe.threshold)],
      ["Fringing · edge", p => fmtPrism(p.fringe.atRim, p.fringe.threshold)]
    ];
    const body = table.tBodies[0];
    for (const [label, value] of rows) {
      const tr = body.insertRow();
      const th = document.createElement("th"); th.scope = "row"; th.textContent = label; tr.append(th);
      for (const p of [pair.od, pair.os]) {
        const v = value(p), td = tr.insertCell();
        if (typeof v === "string") td.textContent = v;
        else {
          td.textContent = v.text;
          if (v.notice) { td.classList.add("notice"); td.title = "A wearer may notice this fringing"; }
        }
      }
    }
    const total = body.insertRow();
    const th = document.createElement("th"); th.scope = "row"; th.textContent = "Pair"; total.append(th);
    const cell = total.insertCell(); cell.colSpan = 2;
    cell.textContent = `${(pair.od.mesh.massG + pair.os.mesh.massG).toFixed(1)} g`;
    const strips = document.createElement("div");
    strips.className = "fringe-strips";
    for (const [where, key] of [["10 mm", "at10mm"], ["edge", "atRim"]]) {
      for (const p of [pair.od, pair.os]) {
        const wrap = document.createElement("div");
        const cap = document.createElement("span"); cap.className = "fringe-label"; cap.textContent = `${p.eye.toUpperCase()} · ${where}`;
        wrap.append(cap, fringeStrip(p.fringe[key]));
        strips.append(wrap);
      }
    }
    target.append(head, table, strips);
    if (pair.od.mesh.carrierUsed || pair.os.mesh.carrierUsed) {
      const note = document.createElement("p");
      note.className = "group-footer";
      note.textContent = "Too strong for a single curve across this frame; the edge is approximate.";
      target.append(note);
    }
  }

  function readPair(prefix, name) {
    return { od: readRx(`${prefix}Od`, `${name} · OD`, true), os: readRx(`${prefix}Os`, `${name} · OS`, true) };
  }

  function showLenses(event) {
    event.preventDefault();
    $("flError").textContent = "";
    try {
      const frame = {
        shape: $("flShape").value,
        a: num("flA", "Lens width"), b: num("flB", "Lens height"), dbl: num("flDbl", "Bridge"),
        fittingHeight: num("flFh", "Fitting height")
      };
      const pd = { od: num("flPdOd", "PD · OD"), os: num("flPdOs", "PD · OS") };
      if ([frame.a, frame.b, frame.dbl, pd.od, pd.os].some(v => v == null)) throw new Error("Enter A, B, DBL and the PD for each eye.");
      for (const eye of ["od", "os"]) if (!(pd[eye] >= 20 && pd[eye] <= 45)) throw new Error(`PD · ${eye.toUpperCase()}: from 20 to 45 mm.`);
      const nameA = $("flNameA").value.trim() || "Rx A", nameB = $("flNameB").value.trim() || "Rx B";
      const rxA = readPair("flRxA", nameA), rxB = readPair("flRxB", nameB);
      const edge = (pairRx) => ({
        od: Lens.preview(pairRx.od, { ...frame, pd: pd.od }, "od"),
        os: Lens.preview(pairRx.os, { ...frame, pd: pd.os }, "os")
      });
      const pa = edge(rxA), pb = edge(rxB);
      figureFor($("flFigA"), nameA, pa, frame);
      figureFor($("flFigB"), nameB, pb, frame);
      dataFor($("flDataA"), nameA, pa);
      dataFor($("flDataB"), nameB, pb);
      $("flCompare").hidden = false;
      $("flNotes").hidden = false;
    } catch (error) {
      $("flCompare").hidden = true;
      $("flError").textContent = error.message;
    }
  }

  $("lensStudioForm").addEventListener("submit", showLenses);
  $("lensStudioForm").addEventListener("input", () => { $("flCompare").hidden = true; });
  $("flReset").addEventListener("click", () => {
    resetForm($("lensStudioForm"));
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

  window.OculiShowcase = Object.freeze({ selectTool });
})();
