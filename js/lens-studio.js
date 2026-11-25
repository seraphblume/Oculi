// Lens Studio: an Rx edged into a frame in polycarbonate, through ZL Thickness.
// Pure geometry and figures; the drawing lives in showcase.js. Nothing is stored.
(function (root) {
  "use strict";
  const T = root.ZLThickness || (typeof require !== "undefined" ? require("./zl-thickness.js") : null);

  // Polycarbonate as a lab would quote it. Minimum thicknesses are typical safety values for
  // polycarbonate dress lenses; drilled or rimless mounts need more.
  const POLYCARBONATE = Object.freeze({ name: "Polycarbonate", index: 1.586, density: 1.2, abbe: 30, minCenterMm: 1.0, minEdgeMm: 1.0 });
  // Front base curves stocked for polycarbonate single-vision blanks, in dioptres.
  const BASES = [0.5, 1, 2, 3, 4, 5, 6, 7, 8];
  const SHAPES = Object.freeze({
    rectangle: "Rectangle", oval: "Oval", round: "Round", aviator: "Aviator", cateye: "Cat-eye"
  });

  // Vogel's rule on the spherical equivalent, rounded to the nearest stocked base.
  function baseCurve(rx) {
    const se = rx.sphere + rx.cylinder / 2;
    const ideal = se >= 0 ? se + 6 : se / 2 + 6;
    return BASES.reduce((best, b) => (Math.abs(b - ideal) < Math.abs(best - ideal) ? b : best), BASES[0]);
  }

  // ---------------------------------------------------------------- frame shapes

  // A closed outline in the nasal frame (x nasal, y up), before sizing. Each shape is a
  // superellipse shaped by smooth angular bumps, so no outline has a kink.
  const bump = (t, centreDeg, width) => {
    const d = Math.atan2(Math.sin(t - (centreDeg * Math.PI) / 180), Math.cos(t - (centreDeg * Math.PI) / 180));
    return Math.exp(-((d / width) ** 2));
  };
  function outline(shape, n = 720) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (2 * Math.PI * i) / n;
      const c = Math.cos(t), s = Math.sin(t);
      const superellipse = p => Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), -1 / p);
      let r;
      switch (shape) {
        case "rectangle": r = superellipse(5); break;
        case "round": r = 1; break;
        case "oval": r = superellipse(2.6) * (1 - 0.05 * bump(t, 90, 0.9) - 0.05 * bump(t, 270, 0.9)); break;
        case "aviator": // teardrop: a flat brow and a bowl that hangs lowest towards the nose
          r = superellipse(2.8) * (1 + 0.2 * bump(t, -62, 0.75)) * (1 - 0.05 * bump(t, 90, 0.7)); break;
        case "cateye": // swept up at the temple, tapering towards the lower nose
          r = superellipse(3) * (1 + 0.2 * bump(t, 148, 0.65)) * (1 - 0.1 * bump(t, -40, 0.8)); break;
        default: throw new RangeError(`unknown frame shape ${shape}`);
      }
      pts.push([r * c, r * s]);
    }
    return pts;
  }

  // 360 radii about the boxing centre for a shape sized to A × B: ZL Thickness's frame input.
  function frameRadii(shape, aMm, bMm) {
    if (!(aMm >= 25 && aMm <= 75 && bMm >= 15 && bMm <= 65)) throw new RangeError("Lens size: A from 25 to 75 mm, B from 15 to 65 mm.");
    const raw = outline(shape);
    const xs = raw.map(p => p[0]), ys = raw.map(p => p[1]);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const sx = aMm / (Math.max(...xs) - Math.min(...xs)), sy = bMm / (Math.max(...ys) - Math.min(...ys));
    const poly = raw.map(([x, y]) => [(x - cx) * sx, (y - cy) * sy]);
    const radii = new Float64Array(360);
    for (let deg = 0; deg < 360; deg++) {
      const dx = Math.cos((deg * Math.PI) / 180), dy = Math.sin((deg * Math.PI) / 180);
      let best = Infinity;
      for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
        const ex = x2 - x1, ey = y2 - y1;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = (x1 * ey - y1 * ex) / den, u = (x1 * dy - y1 * dx) / den;
        if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
      }
      if (!Number.isFinite(best)) throw new Error(`frame outline has no edge at ${deg}°`);
      radii[deg] = best;
    }
    return radii;
  }

  // ---------------------------------------------------------------- the lens

  // TABO axis in the nasal lens frame: unchanged for OD, mirrored for OS.
  const lensAxis = (axis, eye) => (eye === "os" ? (180 - axis) % 180 : axis % 180);

  /**
   * One lens. rx = { sphere, cylinder (minus), axis }; frame = { shape, a, b, dbl, pd, fittingHeight };
   * eye = "od" | "os". Back surface solved for the back-vertex power through the actual centre
   * thickness (two passes). Returns the mesh plus the figures shown.
   */
  function preview(rx, frame, eye = "od", material = POLYCARBONATE) {
    const { shape, a, b, dbl, pd } = frame;
    const fh = frame.fittingHeight == null ? b / 2 : frame.fittingHeight;
    if (!(pd >= 20 && pd <= 45)) throw new RangeError("Monocular PD from 20 to 45 mm.");
    if (!(dbl >= 8 && dbl <= 30)) throw new RangeError("Bridge (DBL) from 8 to 30 mm.");
    if (!(fh >= 5 && fh <= b - 3)) throw new RangeError(`Fitting height from 5 mm to ${b - 3} mm.`);
    const radii = frameRadii(shape, a, b);
    const decentration = T.boxingOffset(a, dbl, b, pd, fh);
    const base = baseCurve(rx);
    const n = material.index;
    const axis = lensAxis(rx.axis || 0, eye);
    let center = material.minCenterMm, mesh = null;
    for (let pass = 0; pass < 3; pass++) {
      // Front power F1 = base; back power per principal meridian so that the back-vertex power
      // F1 / (1 − (t / n) F1) + F2 equals the Rx in that meridian.
      const effective = base / (1 - (center / 1000 / n) * base);
      const backAlongAxis = -(rx.sphere - effective);
      const backAcross = -((rx.sphere + rx.cylinder) - effective);
      mesh = T.lensMesh(radii, T.surface(base, base, 0), T.surface(backAlongAxis, backAcross, axis), {
        index: n, density: material.density, decentration, minCenterMm: material.minCenterMm,
        minEdgeMm: material.minEdgeMm, thinning: "none"
      });
      if (Math.abs(mesh.centerMm - center) < 0.005) break;
      center = mesh.centerMm;
    }
    let thick = 0, thin = 0;
    for (let i = 1; i < 360; i++) {
      if (mesh.edgeMm[i] > mesh.edgeMm[thick]) thick = i;
      if (mesh.edgeMm[i] < mesh.edgeMm[thin]) thin = i;
    }
    return {
      rx, eye, frame: { ...frame, fittingHeight: fh }, material, base, decentration, radii, mesh,
      thickest: { deg: thick, mm: mesh.edgeMm[thick], where: compass(thick) },
      thinnest: { deg: thin, mm: mesh.edgeMm[thin], where: compass(thin) },
      fringe: fringing(rx, axis, mesh.rim, decentration, material.abbe)
    };
  }

  function compass(deg) {
    const names = ["nasal", "upper nasal", "top", "upper temporal", "temporal", "lower temporal", "bottom", "lower nasal"];
    return names[Math.round(deg / 45) % 8];
  }

  /**
   * Transverse chromatic aberration (Prentice prism ÷ Abbe number), in prism dioptres:
   * 10 mm from the optical centre in the strongest meridian, and at the worst rim point.
   * About 0.1 Δ is where colour fringes start to be noticed.
   */
  function fringing(rx, axisLens, rim, decentration, abbe) {
    const c = rx.cylinder, a2 = (2 * axisLens * Math.PI) / 180;
    const m = rx.sphere + c / 2, j0 = (-c / 2) * Math.cos(a2), j45 = (-c / 2) * Math.sin(a2);
    const F = [[m + j0, j45], [j45, m - j0]];
    const prismAt = (dx, dy) => Math.hypot(F[0][0] * dx + F[0][1] * dy, F[1][0] * dx + F[1][1] * dy) / 10;
    const strongest = Math.max(Math.abs(rx.sphere), Math.abs(rx.sphere + rx.cylinder));
    let rimPrism = 0;
    for (const [x, y] of rim) rimPrism = Math.max(rimPrism, prismAt(x - decentration[0], y - decentration[1]));
    return { at10mm: strongest / abbe, atRim: rimPrism / abbe, threshold: 0.1 };
  }

  const api = Object.freeze({ POLYCARBONATE, SHAPES, BASES, baseCurve, frameRadii, lensAxis, preview, fringing });
  root.OculiLensStudio = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
