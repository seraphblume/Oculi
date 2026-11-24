// ZL Retina for the browser: a line-for-line port of zl_retina 0.1.0
// (~/ZepheniaLabs/Workspace/Packages/ZLRetina, src/zl_retina/optics.py).
// Scalar diffraction through a circular pupil, three wavelengths, convolved in linear light.
// Pure functions only: no DOM, no storage, no network. tests/zl-retina.test.js checks it
// against reference output from the Python package.
(function (root) {
  "use strict";

  const SQRT3 = Math.sqrt(3), SQRT5 = Math.sqrt(5), SQRT6 = Math.sqrt(6), SQRT8 = Math.sqrt(8);

  // Clinical notation to power vectors (M, J0, J45), as Prescription.power_vectors.
  function powerVectors(rx) {
    const sphere = Number(rx.sphere ?? 0), cylinder = Number(rx.cylinder ?? 0), axis = Number(rx.axis ?? 0);
    const angle = (2 * axis * Math.PI) / 180;
    return { m: sphere + cylinder / 2, j0: (-cylinder * Math.cos(angle)) / 2, j45: (-cylinder * Math.sin(angle)) / 2 };
  }

  // Minus-cylinder notation from power vectors. Axis 1–180; zero cylinder reports axis 180.
  function fromPowerVectors({ m, j0, j45 }) {
    const half = Math.hypot(j0, j45);
    const cylinder = -2 * half;
    let axis = half < 1e-12 ? 180 : (Math.atan2(j45, j0) * 90) / Math.PI;
    if (axis <= 0) axis += 180;
    return { sphere: m - cylinder / 2, cylinder, axis };
  }

  const basisCache = new Map();
  function basis(size) {
    if (basisCache.has(size)) return basisCache.get(size);
    const n = size * size;
    const mask = new Uint8Array(n);
    const modes = Array.from({ length: 6 }, () => new Float64Array(n));
    for (let i = 0; i < size; i++) {
      const y = -((i - (size - 1) / 2) * (2 / size));
      for (let j = 0; j < size; j++) {
        const x = (j - (size - 1) / 2) * (2 / size);
        const r2 = x * x + y * y, k = i * size + j;
        mask[k] = r2 <= 1 ? 1 : 0;
        modes[0][k] = SQRT3 * (2 * r2 - 1);
        modes[1][k] = SQRT6 * (x * x - y * y);
        modes[2][k] = SQRT6 * 2 * x * y;
        modes[3][k] = SQRT8 * x * (3 * r2 - 2);
        modes[4][k] = SQRT8 * y * (3 * r2 - 2);
        modes[5][k] = SQRT5 * (6 * r2 * r2 - 6 * r2 + 1);
      }
    }
    if (basisCache.size >= 2) basisCache.delete(basisCache.keys().next().value);
    const out = { mask, modes };
    basisCache.set(size, out);
    return out;
  }

  // Iterative radix-2 FFT over contiguous lines, with a twiddle table per length.
  const twiddles = new Map();
  function table(n) {
    if (!twiddles.has(n)) {
      const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2), rev = new Uint32Array(n);
      for (let k = 0; k < n / 2; k++) { cos[k] = Math.cos((2 * Math.PI * k) / n); sin[k] = Math.sin((2 * Math.PI * k) / n); }
      for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        rev[i] = j;
      }
      twiddles.set(n, { cos, sin, rev });
    }
    return twiddles.get(n);
  }

  function fftLines(re, im, lines, n, inverse) {
    const { cos, sin, rev } = table(n);
    const sign = inverse ? 1 : -1;
    for (let line = 0; line < lines; line++) {
      const o = line * n;
      for (let i = 1; i < n; i++) {
        const j = rev[i];
        if (i < j) {
          let t = re[o + i]; re[o + i] = re[o + j]; re[o + j] = t;
          t = im[o + i]; im[o + i] = im[o + j]; im[o + j] = t;
        }
      }
      for (let len = 2; len <= n; len <<= 1) {
        const halfLen = len >> 1, step = n / len;
        for (let i = 0; i < n; i += len) {
          for (let k = 0; k < halfLen; k++) {
            const wr = cos[k * step], wi = sign * sin[k * step];
            const a = o + i + k, b = a + halfLen;
            const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
            re[b] = re[a] - xr; im[b] = im[a] - xi;
            re[a] += xr; im[a] += xi;
          }
        }
      }
    }
  }

  function transpose(src, rows, cols, dst) {
    const B = 32;
    for (let i0 = 0; i0 < rows; i0 += B) for (let j0 = 0; j0 < cols; j0 += B) {
      const i1 = Math.min(rows, i0 + B), j1 = Math.min(cols, j0 + B);
      for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) dst[j * rows + i] = src[i * cols + j];
    }
  }

  // 2-D FFT of a rows × cols array (both powers of two), in place.
  function fft2d(re, im, rows, cols, inverse = false) {
    fftLines(re, im, rows, cols, inverse);
    const tr = new Float64Array(re.length), ti = new Float64Array(im.length);
    transpose(re, rows, cols, tr); transpose(im, rows, cols, ti);
    fftLines(tr, ti, cols, rows, inverse);
    transpose(tr, cols, rows, re); transpose(ti, cols, rows, im);
    if (inverse) { const n = rows * cols; for (let p = 0; p < n; p++) { re[p] /= n; im[p] /= n; } }
  }

  // numpy.interp: linear, clamped to the end values outside xp.
  function interp(x, xp, fp, out) {
    const n = xp.length;
    let j = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (v <= xp[0]) { out[i] = fp[0]; continue; }
      if (v >= xp[n - 1]) { out[i] = fp[n - 1]; continue; }
      while (j > 0 && xp[j] > v) j--;
      while (j < n - 2 && xp[j + 1] <= v) j++;
      const t = (v - xp[j]) / (xp[j + 1] - xp[j]);
      out[i] = fp[j] + t * (fp[j + 1] - fp[j]);
    }
    return out;
  }

  // One pass of the separable area-overlap redistribution: rows of `src` (rows × cols) are
  // resampled from `bounds` to `edges` and the result is returned transposed (dest × rows).
  function redistribute(src, rows, cols, bounds, edges) {
    const dest = edges.length - 1;
    const out = new Float64Array(dest * rows);
    const cumulative = new Float64Array(cols + 1);
    const at = new Float64Array(edges.length);
    for (let r = 0; r < rows; r++) {
      cumulative[0] = 0;
      for (let c = 0; c < cols; c++) cumulative[c + 1] = cumulative[c] + src[r * cols + c];
      interp(edges, bounds, cumulative, at);
      for (let d = 0; d < dest; d++) out[d * rows + r] = at[d + 1] - at[d];
    }
    return out;
  }

  /**
   * retinal_psf. `rx` is { sphere, cylinder, axis } in dioptres and degrees, or pass
   * `vectors: { m, j0, j45 }` instead. Options mirror the Python keyword arguments.
   * Returns { kernels: [Float64Array ×3], side, arcminPerPixel, pupilSamples }.
   */
  function retinalPsf(rx = {}, opts = {}) {
    const {
      pupilMm = 4.0,
      viewingM = Infinity,
      wavelengthsNm = [650, 550, 450],
      chromaticDiopters = null,
      higherOrderUm = [0, 0, 0],
      pupilSamples = 128,
      maxSamples = 1024,
      arcminPerPixel = null,
      vectors = null
    } = opts;
    const waves = wavelengthsNm.map(w => Number(w) * 1e-9);
    let shifts;
    if (chromaticDiopters == null) {
      if (waves.some(w => w < 399.99e-9 || w > 700.01e-9)) throw new RangeError("supply chromatic offsets outside 400–700 nm");
      shifts = waves.map(w => 633.46 * (1 / (550.0 - 214.102) - 1 / (w * 1e9 - 214.102)));
    } else {
      shifts = chromaticDiopters.map(Number);
    }
    const higher = higherOrderUm.map(v => Number(v) * 1e-6);
    if ([waves, shifts, higher].some(a => a.length !== 3 || !a.every(Number.isFinite))) {
      throw new RangeError("supply three finite wavelengths, offsets and higher-order terms");
    }
    if (!Number.isFinite(pupilMm) || pupilMm <= 0 || waves.some(w => w <= 0) || !(viewingM > 0)) {
      throw new RangeError("pupil, wavelengths and viewing distance must be positive");
    }
    if (!Number.isInteger(pupilSamples) || !Number.isInteger(maxSamples) || !(pupilSamples >= 16 && pupilSamples <= maxSamples)) {
      throw new RangeError("require 16 <= pupil_samples <= max_samples");
    }
    const { m, j0, j45 } = vectors || powerVectors(rx);
    const radius = pupilMm / 2000;
    const pitch = arcminPerPixel == null ? Math.max(...waves) / (2 * radius) : ((arcminPerPixel / 60) * Math.PI) / 180;
    if (![pitch, m, j0, j45].every(Number.isFinite) || pitch <= 0) throw new RangeError("invalid sampling pitch or prescription");

    let size = pupilSamples, pupils;
    for (;;) {
      const { mask, modes } = basis(size);
      pupils = [];
      let aliased = false;
      for (let w = 0; w < 3; w++) {
        const coeff = [
          (-(m + shifts[w] + 1 / viewingM) * radius ** 2) / (4 * SQRT3),
          (-j0 * radius ** 2) / (2 * SQRT6),
          (-j45 * radius ** 2) / (2 * SQRT6),
          ...higher
        ];
        const k = (2 * Math.PI) / waves[w];
        const n = size * size;
        const phase = new Float64Array(n);
        for (let p = 0; p < n; p++) {
          let s = 0;
          for (let b = 0; b < 6; b++) s += coeff[b] * modes[b][p];
          phase[p] = k * s;
        }
        let maxStep = 0;
        for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
          const p = i * size + j;
          if (!mask[p]) continue;
          if (i + 1 < size && mask[p + size]) maxStep = Math.max(maxStep, Math.abs(phase[p + size] - phase[p]));
          if (j + 1 < size && mask[p + 1]) maxStep = Math.max(maxStep, Math.abs(phase[p + 1] - phase[p]));
        }
        if (maxStep >= Math.PI) aliased = true;
        pupils.push({ phase, mask });
      }
      if (!aliased) break;
      if (size >= maxSamples) throw new RangeError("phase gradient exceeds Nyquist at max_samples");
      size = Math.min(maxSamples, 2 * size);
    }

    const fftSize = 2 * size;
    const native = waves.map(w => w / (4 * radius));
    const half = Math.ceil(((size + 0.5) * Math.max(...native)) / pitch);
    if (half > 2048) throw new RangeError("requested angular grid exceeds 4097 samples across");
    const side = 2 * half + 1;
    const edges = new Float64Array(side + 1);
    for (let d = 0; d <= side; d++) edges[d] = (d - half) * pitch - pitch / 2;

    const kernels = pupils.map(({ phase, mask }, w) => {
      const n2 = fftSize * fftSize;
      const re = new Float64Array(n2), im = new Float64Array(n2);
      for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
        const p = i * size + j;
        if (!mask[p]) continue;
        re[i * fftSize + j] = Math.cos(phase[p]);
        im[i * fftSize + j] = Math.sin(phase[p]);
      }
      fft2d(re, im, fftSize, fftSize);
      // |fftshift(F)|²
      const intensity = new Float64Array(n2);
      const h = fftSize / 2;
      for (let i = 0; i < fftSize; i++) for (let j = 0; j < fftSize; j++) {
        const s = ((i + h) % fftSize) * fftSize + ((j + h) % fftSize);
        intensity[i * fftSize + j] = re[s] * re[s] + im[s] * im[s];
      }
      const step = native[w];
      const bounds = new Float64Array(fftSize + 1);
      for (let b = 0; b <= fftSize; b++) bounds[b] = (b - size) * step - step / 2;
      const pass1 = redistribute(intensity, fftSize, fftSize, bounds, edges); // side × fftSize
      const kernel = redistribute(pass1, side, fftSize, bounds, edges);       // side × side
      let total = 0;
      for (let p = 0; p < kernel.length; p++) total += kernel[p];
      for (let p = 0; p < kernel.length; p++) kernel[p] /= total;
      return kernel;
    });
    return { kernels, side, arcminPerPixel: (pitch * 180 * 60) / Math.PI, pupilSamples: size };
  }

  // Not in the Python package: drop the outer ring of the kernels that holds less than
  // `tailEnergy` of the light, then renormalise. A display-speed measure only.
  function cropPsf(psf, tailEnergy = 1e-4) {
    const { kernels, side } = psf;
    const c = (side - 1) / 2;
    let r = c;
    const ringOutside = rr => {
      let worst = 0;
      for (const k of kernels) {
        let inside = 0;
        for (let i = c - rr; i <= c + rr; i++) for (let j = c - rr; j <= c + rr; j++) inside += k[i * side + j];
        worst = Math.max(worst, 1 - inside);
      }
      return worst;
    };
    while (r > 0 && ringOutside(r - 1) <= tailEnergy) r--;
    if (r === c) return psf;
    const s = 2 * r + 1;
    const cropped = kernels.map(k => {
      const out = new Float64Array(s * s);
      let total = 0;
      for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) {
        const v = k[(i + c - r) * side + (j + c - r)];
        out[i * s + j] = v; total += v;
      }
      for (let p = 0; p < out.length; p++) out[p] /= total;
      return out;
    });
    return { ...psf, kernels: cropped, side: s };
  }

  const nextPow2 = n => 1 << Math.ceil(Math.log2(Math.max(1, n)));
  const toLinear = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const toSrgb = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

  /**
   * simulate_retina. `image` is { width, height, data } with RGB or RGBA bytes (ImageData works),
   * or floats in [0, 1] when `image.float` is true. Returns a Float32Array of sRGB in [0, 1],
   * three channels per pixel.
   */
  function simulateRetina(image, psf) {
    const { width: W, height: H, data } = image;
    const stride = data.length / (W * H);
    if (!(W > 0 && H > 0) || (stride !== 3 && stride !== 4)) throw new RangeError("expected an H×W×3 sRGB image");
    const scale = image.float ? 1 : data instanceof Uint16Array ? 65535 : 255;
    const k = psf.side, pad = (k - 1) / 2;
    const ph = H + 2 * pad, pw = W + 2 * pad;
    const P = nextPow2(ph + k - 1), Q = nextPow2(pw + k - 1);
    const out = new Float32Array(W * H * 3);
    for (let ch = 0; ch < 3; ch++) {
      const re = new Float64Array(P * Q), im = new Float64Array(P * Q);
      for (let i = 0; i < ph; i++) {
        const y = Math.min(H - 1, Math.max(0, i - pad));
        for (let j = 0; j < pw; j++) {
          const x = Math.min(W - 1, Math.max(0, j - pad));
          const v = data[(y * W + x) * stride + ch] / scale;
          if (!(v >= 0 && v <= 1)) throw new RangeError("expected a finite sRGB image in [0, 1]");
          re[i * Q + j] = toLinear(v);
        }
      }
      const kr = new Float64Array(P * Q), ki = new Float64Array(P * Q);
      const kernel = psf.kernels[ch];
      for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) kr[i * Q + j] = kernel[i * k + j];
      fft2d(re, im, P, Q);
      fft2d(kr, ki, P, Q);
      for (let p = 0; p < P * Q; p++) {
        const a = re[p], b = im[p];
        re[p] = a * kr[p] - b * ki[p];
        im[p] = a * ki[p] + b * kr[p];
      }
      fft2d(re, im, P, Q, true);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = Math.min(1, Math.max(0, re[(y + k - 1) * Q + (x + k - 1)]));
        out[(y * W + x) * 3 + ch] = toSrgb(v);
      }
    }
    return out;
  }

  function lightAdaptedPupil(luminanceCdM2, fieldAreaDeg2) {
    if (![luminanceCdM2, fieldAreaDeg2].every(Number.isFinite) || luminanceCdM2 < 0 || fieldAreaDeg2 <= 0) {
      throw new RangeError("supply nonnegative luminance and positive angular area");
    }
    const flux = ((luminanceCdM2 * fieldAreaDeg2) / 846.0) ** 0.41;
    return 7.75 - (5.75 * flux) / (flux + 2.0);
  }

  const api = Object.freeze({ version: "0.1.0", powerVectors, fromPowerVectors, retinalPsf, cropPsf, simulateRetina, lightAdaptedPupil });
  root.ZLRetina = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
