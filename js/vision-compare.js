// Vision comparison for Genius (section 4): the same letter chart through the patient's
// current correction and through a full correction, rendered by ZL Retina.
// Illustrative only. It reads a defensive copy of the numbers it is given and writes
// nothing but two canvases: no storage, no network, no change to any Rx.
(function (root) {
  "use strict";

  const PITCH_ARCMIN = 0.6;          // one scene pixel, in arcminutes of visual angle
  const PUPIL_MM = 4.0;              // indoor photopic pupil
  const TAIL_ENERGY = 3e-3;          // PSF tail dropped for display speed (zl-retina.js cropPsf)
  // Monochromatic: the eye's chromatic aberration is real but not perceived as colour fringes,
  // so showing it would mislead a patient. zl_retina's documented switch for this.
  const CHROMATIC = [0, 0, 0];
  const SCENE = { width: 280, height: 360 };
  const SLOAN = "CDHKNORSVZ";
  // Letter heights in arcminutes: 20/200 down to 20/20 (5′ per 20/20 letter).
  const LINES = [
    { arcmin: 50, letters: 1, distance: "20/200", near: "4.0M" },
    { arcmin: 25, letters: 2, distance: "20/100", near: "2.0M" },
    { arcmin: 17.5, letters: 3, distance: "20/70", near: "1.4M" },
    { arcmin: 12.5, letters: 4, distance: "20/50", near: "1.0M" },
    { arcmin: 10, letters: 5, distance: "20/40", near: "0.8M" },
    { arcmin: 7.5, letters: 5, distance: "20/30", near: "0.6M" },
    { arcmin: 6.25, letters: 6, distance: "20/25", near: "0.5M" },
    { arcmin: 5, letters: 6, distance: "20/20", near: "0.4M" }
  ];

  const pv = rx => {
    const c = Number(rx && rx.cylinder) || 0, a = ((Number(rx && rx.axis) || 0) * Math.PI) / 90;
    return { m: (Number(rx && rx.sphere) || 0) + c / 2, j0: (-c * Math.cos(a)) / 2, j45: (-c * Math.sin(a)) / 2 };
  };

  // Minimum amplitude of accommodation (Hofstetter): 15 − 0.25 × age, never below zero.
  function accommodation(age) {
    return Math.max(0, 15 - 0.25 * Number(age));
  }

  /**
   * Defocus left on the retina. `eye` is the full correction the eye needs, `lens` what it
   * looks through (null for nothing), `add` the reading addition in that lens, `vergence`
   * 1/viewing distance in dioptres (0 for distance). Plus still needed after the lens is met
   * by accommodation as far as age allows; cylinder never is.
   */
  function residual({ eye, lens = null, add = 0, vergence = 0, age }) {
    const need = pv(eye), have = pv(lens);
    const plus = need.m - have.m + vergence - (Number(add) || 0);
    const used = Math.min(Math.max(plus, 0), accommodation(age));
    return { m: plus - used, j0: need.j0 - have.j0, j45: need.j45 - have.j45, accommodationUsed: used };
  }

  function letterAt(i) {
    return SLOAN[(i * 7 + 3) % SLOAN.length];
  }

  function drawScene(canvas, scene) {
    const { width: W, height: H } = SCENE;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#111111";
    ctx.textBaseline = "alphabetic";
    let y = 14, n = 0;
    for (const line of LINES) {
      const h = line.arcmin / PITCH_ARCMIN;
      ctx.font = `500 ${(h / 0.72).toFixed(2)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      ctx.textAlign = "center";
      const spacing = h * 2;
      const x0 = 150 - ((line.letters - 1) * spacing) / 2;
      y += h;
      for (let i = 0; i < line.letters; i++) ctx.fillText(letterAt(n++), x0 + i * spacing, y);
      ctx.font = `400 9px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(scene === "near" ? line.near : line.distance, 8, y);
      y += Math.max(7, h * 0.5);
    }
    return ctx.getImageData(0, 0, W, H);
  }

  let worker = null, nextId = 1;
  const pending = new Map();

  function getWorker() {
    if (worker !== null) return worker;
    try {
      worker = new Worker("js/zl-retina-worker.js");
      worker.onmessage = e => {
        const job = pending.get(e.data.id);
        if (!job) return;
        pending.delete(e.data.id);
        e.data.error ? job.reject(new Error(e.data.error)) : job.resolve(e.data);
      };
      worker.onerror = () => { worker = false; for (const job of pending.values()) job.reject(new Error("Renderer unavailable")); pending.clear(); };
    } catch {
      worker = false;
    }
    return worker;
  }

  function renderVectors(image, vectors) {
    const opts = { pupilMm: PUPIL_MM, arcminPerPixel: PITCH_ARCMIN, maxSamples: 512, chromaticDiopters: CHROMATIC };
    const w = getWorker();
    if (w) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        w.postMessage({ id, vectors: { m: vectors.m, j0: vectors.j0, j45: vectors.j45 }, opts, image: { width: image.width, height: image.height, data: image.data }, tailEnergy: TAIL_ENERGY });
      });
    }
    // No worker (file:// or blocked): render on the main thread.
    const R = root.ZLRetina;
    return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
      const psf = R.cropPsf(R.retinalPsf({}, { ...opts, vectors }), TAIL_ENERGY);
      return { out: R.simulateRetina(image, psf), scale: 1 };
    });
  }

  function paint(canvas, out) {
    const { width: W, height: H } = SCENE;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(W, H);
    for (let p = 0, q = 0; p < W * H; p++, q += 3) {
      img.data[p * 4] = Math.round(out[q] * 255);
      img.data[p * 4 + 1] = Math.round(out[q + 1] * 255);
      img.data[p * 4 + 2] = Math.round(out[q + 2] * 255);
      img.data[p * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  let generation = 0;

  /**
   * Renders both panels. `input` = { age, eye: {sphere,cylinder,axis}, current: Rx|null,
   * currentAdd, trueAdd, scene: "distance"|"near", nearDistanceM }.
   * Resolves to { current, true } residuals, or null when superseded by a newer call.
   */
  async function render(canvases, input) {
    const gen = ++generation;
    const data = JSON.parse(JSON.stringify(input));
    const vergence = data.scene === "near" ? 1 / (data.nearDistanceM || 0.4) : 0;
    const views = {
      current: residual({ eye: data.eye, lens: data.current, add: data.scene === "near" ? data.currentAdd : 0, vergence, age: data.age }),
      true: residual({ eye: data.eye, lens: data.eye, add: data.scene === "near" ? data.trueAdd : 0, vergence, age: data.age })
    };
    const scene = drawScene(document.createElement("canvas"), data.scene);
    const results = await Promise.all([renderVectors(scene, views.current), renderVectors(scene, views.true)]);
    if (gen !== generation) return null;
    paint(canvases.current, results[0].out);
    paint(canvases.true, results[1].out);
    views.current.limited = results[0].scale < 1;
    views.true.limited = results[1].scale < 1;
    return views;
  }

  function clear(canvases) {
    generation++;
    for (const c of Object.values(canvases)) {
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, c.width, c.height);
    }
  }

  root.OculiVisionCompare = Object.freeze({ PITCH_ARCMIN, PUPIL_MM, SCENE, LINES, accommodation, residual, render, clear });
  if (typeof module !== "undefined" && module.exports) module.exports = root.OculiVisionCompare;
})(typeof window !== "undefined" ? window : globalThis);
