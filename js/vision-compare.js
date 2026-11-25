// Vision comparison for Genius (section 4) and Clarity: the same view through the patient's
// current correction and through a full correction, rendered by ZL Retina. Distance is a photo;
// near is a reading chart.
// Illustrative only. It reads a defensive copy of the numbers it is given and writes
// nothing but two canvases: no storage, no network, no change to any Rx.
(function (root) {
  "use strict";

  const PITCH_ARCMIN = 0.6;          // one scene pixel, in arcminutes of visual angle
  // A photo stands for the central ~9° × 12° of a scene: magnified enough that blur shows on
  // screen, but not so far that a small error smears the whole view.
  const PHOTO_PITCH_ARCMIN = 2.0;
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
    if (typeof scene === "object" && scene) { // a photo, cropped to fill the scene
      const sw = scene.naturalWidth || scene.width, sh = scene.naturalHeight || scene.height;
      const r = Math.max(W / sw, H / sh), dw = sw * r, dh = sh * r;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(scene, (W - dw) / 2, (H - dh) / 2, dw, dh);
      return ctx.getImageData(0, 0, W, H);
    }
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

  function renderVectors(image, vectors, pitch = PITCH_ARCMIN) {
    const opts = { pupilMm: PUPIL_MM, arcminPerPixel: pitch, maxSamples: 512, chromaticDiopters: CHROMATIC };
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

  const blurOf = v => Math.abs(v.m) + Math.hypot(v.j0, v.j45);

  // Distance is always the photo. It loads once; if it can't, the letter chart stands in.
  const DISTANCE_PHOTO = "assets/clarity-distance.jpg";
  let distancePhoto = null;
  function loadDistancePhoto() {
    if (!distancePhoto) {
      const img = new Image();
      img.src = DISTANCE_PHOTO;
      distancePhoto = img.decode().then(() => img).catch(() => { distancePhoto = null; return null; });
    }
    return distancePhoto;
  }

  /**
   * Renders both panels. `input` = { age, eye: {sphere,cylinder,axis}, current: Rx|null,
   * currentAdd, trueAdd, scene: "distance"|"near", nearDistanceM, photo? }.
   * For both eyes, pass `eyes: [{ id, eye, current }, …]` instead of `eye`/`current`: each panel
   * then shows the eye that sees it more sharply, since binocular acuity follows the better eye.
   * Distance shows the photo at PHOTO_PITCH_ARCMIN (`photo` may pass another image); near
   * shows the reading chart.
   * Resolves to { current, true } residuals (each with `eyeId` when both eyes are given), or
   * null when superseded by a newer call.
   */
  async function render(canvases, input) {
    const gen = ++generation;
    const photo = input.scene === "near" ? null : (input.photo || await loadDistancePhoto());
    if (gen !== generation) return null;
    const data = JSON.parse(JSON.stringify({ ...input, photo: null }));
    const vergence = data.scene === "near" ? 1 / (data.nearDistanceM || 0.4) : 0;
    const eyes = data.eyes || [{ id: null, eye: data.eye, current: data.current }];
    const best = (lensOf, add) => {
      const all = eyes.map(e => ({ ...residual({ eye: e.eye, lens: lensOf(e), add, vergence, age: data.age }), eyeId: e.id }));
      const pick = all.reduce((a, b) => (blurOf(b) < blurOf(a) - 1e-9 ? b : a));
      pick.spread = Math.max(...all.map(blurOf)) - blurOf(pick); // how much the other eye trails
      return pick;
    };
    const views = {
      current: best(e => e.current, data.scene === "near" ? data.currentAdd : 0),
      true: best(e => e.eye, data.scene === "near" ? data.trueAdd : 0)
    };
    if (!data.eyes) for (const v of [views.current, views.true]) { delete v.eyeId; delete v.spread; }
    const usePhoto = Boolean(photo);
    const scene = drawScene(document.createElement("canvas"), usePhoto ? photo : data.scene);
    const pitch = usePhoto ? PHOTO_PITCH_ARCMIN : PITCH_ARCMIN;
    const results = await Promise.all([renderVectors(scene, views.current, pitch), renderVectors(scene, views.true, pitch)]);
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

  root.OculiVisionCompare = Object.freeze({ PITCH_ARCMIN, PHOTO_PITCH_ARCMIN, PUPIL_MM, SCENE, LINES, accommodation, residual, render, clear });
  if (typeof module !== "undefined" && module.exports) module.exports = root.OculiVisionCompare;
})(typeof window !== "undefined" ? window : globalThis);
