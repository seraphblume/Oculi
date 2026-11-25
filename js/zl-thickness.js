// ZL Thickness for the browser: the lens-geometry part of zl_thickness 0.3.0
// (~/ZepheniaLabs/Workspace/Packages/ZLThickness, src/zl_thickness/lens.py), ported line for line:
// Surface.sag, lens_mesh (rim thickness, centre, volume, mass, prism thinning) and
// boxing_offset. Surface normals, OMA reading and face matching are not needed here and are
// not ported. Millimetres; x nasal, y up; positive sag points toward the eye on both surfaces.
// tests/zl-thickness.test.js checks it against output from the Python package itself.
(function (root) {
  "use strict";

  // numpy.polynomial.legendre.leggauss(8)
  const GL_NODES = [-0.9602898564975362, -0.7966664774136267, -0.525532409916329, -0.18343464249564978, 0.18343464249564978, 0.525532409916329, 0.7966664774136267, 0.9602898564975362];
  const GL_WEIGHTS = [0.10122853629037706, 0.22238103445337443, 0.3137066458778869, 0.36268378337836166, 0.36268378337836166, 0.3137066458778869, 0.22238103445337443, 0.10122853629037706];

  /** Surface(base_d, cross_d, axis_deg, aspheric): signed geometric curvature powers. */
  function surface(baseD, crossD, axisDeg = 0, aspheric = []) {
    return Object.freeze({ baseD, crossD, axisDeg, aspheric: aspheric.slice() });
  }

  // Surface.sag for one point: [sag, onCarrier].
  function sag(s, x, y, index) {
    if (s.aspheric.length > 4 || ![s.baseD, s.crossD, s.axisDeg, index, ...s.aspheric].every(Number.isFinite) || index <= 1) {
      throw new RangeError("invalid surface parameters");
    }
    const r = Math.hypot(x, y);
    const angle = Math.atan2(y, x) - (s.axisDeg * Math.PI) / 180;
    const curvature = (s.baseD + (s.crossD - s.baseD) * Math.sin(angle) ** 2) / (1000 * (index - 1));
    // Continue the sphere on its tangent carrier beyond 98% of critical aperture.
    const inner = Math.min(r, 0.98 / Math.max(Math.abs(curvature), 1e-30));
    const cosine = Math.sqrt(1 - (inner * curvature) ** 2);
    let z = (curvature * inner ** 2) / (1 + cosine) + ((r - inner) * curvature * inner) / cosine;
    s.aspheric.forEach((c, i) => { z += c * r ** (2 * (i + 2)); });
    return [z, inner < r];
  }

  /**
   * lens_mesh. Returns { rim: [[x, y]…360], edgeMm: Float64Array(360), centerMm, volumeMm3,
   * massG, carrierUsed, thinningPrism }. density in g/cm³.
   */
  function lensMesh(radii, front, back, opts = {}) {
    const {
      index = 1.6, density = 1.3, decentration = [0, 0], minCenterMm = 1.5, minEdgeMm = 1.0,
      addD = 0, rings = 20, thinning = "rule", maxThinningPrism = 2.0
    } = opts;
    const r = Array.from(radii, Number);
    const offset = decentration.map(Number);
    if (r.length !== 360 || offset.length !== 2 || !r.every(Number.isFinite) || Math.min(...r) <= 0) {
      throw new RangeError("supply 360 positive radii and a two-component offset");
    }
    if (![...offset, index, density, minCenterMm, minEdgeMm, addD].every(Number.isFinite) || index <= 1
      || Math.min(density, minCenterMm, minEdgeMm) <= 0 || rings < 2) {
      throw new RangeError("invalid material, thickness or mesh sampling");
    }
    if (!["rule", "equalise", "none"].includes(thinning)) throw new RangeError("thinning must be 'rule', 'equalise' or 'none'");
    if (!Number.isFinite(maxThinningPrism) || maxThinningPrism < 0) throw new RangeError("max_thinning_prism must be a non-negative number of prism dioptres");

    const rim = r.map((rad, deg) => [rad * Math.cos((deg * Math.PI) / 180), rad * Math.sin((deg * Math.PI) / 180)]);
    const thick0 = (x, y) => sag(back, x - offset[0], y - offset[1], index)[0] - sag(front, x - offset[0], y - offset[1], index)[0];
    // Thickness changes by P / (100 (n - 1)) mm per mm across P prism dioptres.
    let prism;
    if (thinning === "rule") prism = 0.6 * Math.abs(addD);
    else if (thinning === "equalise") {
      let top = 0, bottom = 0;
      rim.forEach((p, i) => { if (p[1] > rim[top][1]) top = i; if (p[1] < rim[bottom][1]) bottom = i; });
      const height = rim[top][1] - rim[bottom][1];
      const t = thick0(...rim[top]), b = thick0(...rim[bottom]);
      prism = Math.min(maxThinningPrism, Math.max(-maxThinningPrism, (100 * (index - 1) * (t - b)) / height));
    } else prism = 0;
    const wedge = prism / (100 * (index - 1));

    let carrier = false;
    // [front sag, back sag minus wedge] at a lens-frame point
    function surfaces(x, y) {
      const [f, fc] = sag(front, x - offset[0], y - offset[1], index);
      const [b, bc] = sag(back, x - offset[0], y - offset[1], index);
      if (fc || bc) carrier = true;
      return [f, b - wedge * (y - offset[1])]; // the wedge runs from the optical centre, as in Python
    }

    // Rings 0..rings, scale k/rings of the rim; the rim ring sets the centre thickness.
    let minInterior = Infinity, minRim = Infinity;
    const rimDiff = new Float64Array(360);
    for (let k = 0; k <= rings; k++) {
      const s = k / rings;
      for (let i = 0; i < 360; i++) {
        const [f, b] = surfaces(rim[i][0] * s, rim[i][1] * s);
        const d = b - f;
        if (k === rings) { rimDiff[i] = d; minRim = Math.min(minRim, d); }
        minInterior = Math.min(minInterior, d);
      }
    }
    const center = Math.max(minCenterMm, minEdgeMm - minRim);
    if (center + minInterior <= 0) throw new RangeError("surfaces cross within the traced aperture");

    // Duffy mapping of each actual rim triangle. Jacobian = u * |A × B|.
    const nodes = GL_NODES.map(v => (v + 1) / 2), weights = GL_WEIGHTS.map(v => v / 2);
    let volume = 0, minThick = Infinity;
    for (let tri = 0; tri < 360; tri++) {
      const a = rim[tri], nb = rim[(tri + 1) % 360];
      const area2 = a[0] * nb[1] - a[1] * nb[0];
      for (let j = 0; j < 8; j++) {
        const ex = (1 - nodes[j]) * a[0] + nodes[j] * nb[0];
        const ey = (1 - nodes[j]) * a[1] + nodes[j] * nb[1];
        for (let i = 0; i < 8; i++) {
          const [f, b] = surfaces(nodes[i] * ex, nodes[i] * ey);
          const t = center + b - f;
          minThick = Math.min(minThick, t);
          volume += weights[i] * nodes[i] * weights[j] * area2 * t;
        }
      }
    }
    if (minThick <= 0) throw new RangeError("surfaces cross within the traced aperture");
    return {
      rim,
      edgeMm: Float64Array.from(rimDiff, d => center + d),
      centerMm: center,
      volumeMm3: volume,
      massG: (volume * density) / 1000,
      carrierUsed: carrier,
      thinningPrism: prism
    };
  }

  /** boxing_offset: optical-centre decentration from the boxing centre, x nasal, y up. */
  function boxingOffset(widthMm, bridgeMm, heightMm, pdMm, fittingHeightMm) {
    if (![widthMm, bridgeMm, heightMm, pdMm, fittingHeightMm].every(Number.isFinite)
      || Math.min(widthMm, heightMm, pdMm) <= 0 || bridgeMm < 0) {
      throw new RangeError("invalid boxing dimensions");
    }
    return [(widthMm + bridgeMm) / 2 - pdMm, fittingHeightMm - heightMm / 2];
  }

  const api = Object.freeze({ version: "0.3.0", surface, sag, lensMesh, boxingOffset });
  root.ZLThickness = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
