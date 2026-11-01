(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.DioptraTicketScan = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const OCR_SCRIPT = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

  function normalizeText(text) {
    return String(text || "")
      .replace(/[−–—]/g, "-")
      .replace(/,/g, ".")
      .replace(/\r/g, "")
      .replace(/[\t\u00a0]+/g, " ")
      .replace(/[ ]{2,}/g, " ");
  }

  function numberTokens(line) {
    const matches = String(line || "").match(/[+\-]?\s*\d+(?:\.\d+)?/g) || [];
    return matches
      .map(token => Number(token.replace(/\s+/g, "")))
      .filter(Number.isFinite);
  }

  function parseRxLine(line) {
    const source = String(line || "").trim();
    const cleaned = source.replace(/^\\s*(?:<\\s*|\\*\\s*)/, "").replace(/>\\s*$/, "").trim();
    if (!/^[+\\-]?\\s*\\d{1,2}\\.\\d{1,2}\\s+[+\\-]?\\s*\\d{1,2}\\.\\d{1,2}\\s+\\d{1,3}(?:\\s+\\d{1,2})?\\s*$/.test(cleaned)) return null;
    const nums = numberTokens(cleaned);
    if (nums.length < 3) return null;

    const sphere = nums[0];
    const cylinder = nums[1];
    let axis = nums[2];
    const reliability = nums.length >= 4 ? nums[3] : null;

    if (Math.abs(sphere) > 30 || Math.abs(cylinder) > 10) return null;
    if (!Number.isInteger(axis) || axis < 1 || axis > 180) return null;
    const transposed = cylinder > 0;
    const normalizedSphere = transposed ? sphere + cylinder : sphere;
    const normalizedCylinder = transposed ? -cylinder : cylinder;
    if (transposed) axis = ((axis + 89) % 180) + 1;

    const selected =
      /<[^>]*>/.test(source) ||
      /^\s*<\s*-/.test(source) ||
      /selected/i.test(source);

    return {
      sphere: normalizedSphere,
      cylinder: normalizedCylinder,
      axis,
      transposed,
      reliability: Number.isFinite(reliability) && reliability >= 0 && reliability <= 99 ? reliability : null,
      selected,
      source
    };
  }

  function eyeHeader(line, eye) {
    const e = eye.toUpperCase();
    const s = String(line || "").trim().toUpperCase();
    return new RegExp("<\\s*" + e + "\\s*>").test(s) ||
      new RegExp("^\\s*" + e + "\\s+(?:S|SPH)\\b").test(s);
  }

  function metadataStop(line) {
    return /^\s*(?:PD\b|VD\s*=|WD\s*=|NAME\b|\d{1,2}\s*\/)/i.test(String(line || ""));
  }

  function parseEye(lines, start, end) {
    const rows = [];
    for (let i = start; i < end; i += 1) {
      const row = parseRxLine(lines[i]);
      if (row) rows.push(row);
    }

    let selected = rows.find(r => r.selected) || null;
    const repeats = rows.filter(r => !r.selected);

    // Typical tickets print three Q-bearing readings followed by the bracketed
    // selected line. OCR can occasionally lose the angle brackets; use a
    // trailing three-value row as a conservative fallback.
    if (!selected && rows.length >= 4) {
      const last = rows[rows.length - 1];
      if (last.reliability == null) {
        selected = last;
        const at = repeats.indexOf(last);
        if (at >= 0) repeats.splice(at, 1);
      }
    }

    return {
      readings: repeats.slice(0, 3).map(r => ({
        sphere: r.sphere,
        cylinder: r.cylinder,
        axis: r.axis,
        reliability: r.reliability
      })),
      selected: selected ? {
        sphere: selected.sphere,
        cylinder: selected.cylinder,
        axis: selected.axis,
        ...(selected.transposed ? { transposed: true } : {})
      } : null
    };
  }

  function firstMatch(text, regex) {
    const m = regex.exec(text);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function parseTicketText(rawText) {
    const text = normalizeText(rawText);
    const lines = text.split("\n").map(s => s.trim()).filter(Boolean);

    const rIndex = lines.findIndex(line => eyeHeader(line, "R"));
    const lIndex = lines.findIndex(line => eyeHeader(line, "L"));

    let rEnd = lIndex > rIndex ? lIndex : lines.length;
    if (rIndex >= 0 && lIndex < 0) {
      const stop = lines.findIndex((line, i) => i > rIndex && metadataStop(line));
      if (stop >= 0) rEnd = stop;
    }

    let lEnd = lines.length;
    if (lIndex >= 0) {
      const stop = lines.findIndex((line, i) => i > lIndex && metadataStop(line));
      if (stop >= 0) lEnd = stop;
    }

    const od = rIndex >= 0 ? parseEye(lines, rIndex + 1, rEnd) : { readings: [], selected: null };
    const os = lIndex >= 0 ? parseEye(lines, lIndex + 1, lEnd) : { readings: [], selected: null };

    const vertexMm = firstMatch(text, /\bVD\s*=\s*(\d+(?:\.\d+)?)/i);
    const workingDistanceCm = firstMatch(text, /\bWD\s*=\s*(\d+(?:\.\d+)?)/i);
    const pdDistanceMm = firstMatch(text, /\bPD\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const pdNearMm = firstMatch(text, /\bN\s*[:=]?\s*(\d+(?:\.\d+)?)/i);

    const warnings = [];
    if (rIndex < 0) warnings.push("OD section not recognized");
    if (lIndex < 0) warnings.push("OS section not recognized");
    if (!od.selected) warnings.push("OD selected line not recognized");
    if (!os.selected) warnings.push("OS selected line not recognized");
    if (od.selected && od.selected.transposed) warnings.push("OD plus cylinder transposed to minus notation");
    if (os.selected && os.selected.transposed) warnings.push("OS plus cylinder transposed to minus notation");
    if (od.readings.length < 3) warnings.push(`OD: ${od.readings.length}/3 repeat readings recognized`);
    if (os.readings.length < 3) warnings.push(`OS: ${os.readings.length}/3 repeat readings recognized`);

    return {
      od,
      os,
      instrument: { vertexMm, pdDistanceMm, pdNearMm },
      near: { workingDistanceCm },
      warnings,
      rawText: text
    };
  }

  function ensureScript(src) {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return Promise.reject(new Error("Ticket OCR is available in the browser only."));
    }
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-dioptra-ocr="${src}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(window.Tesseract), { once: true });
        existing.addEventListener("error", () => reject(new Error("Could not load the OCR engine.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.dioptraOcr = src;
      script.addEventListener("load", () => resolve(window.Tesseract), { once: true });
      script.addEventListener("error", () => reject(new Error("Could not load the OCR engine. Check the connection and use manual entry if needed.")), { once: true });
      document.head.appendChild(script);
    });
  }

  async function preprocessImage(file) {
    if (typeof document === "undefined") return file;
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      const loaded = new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Could not read the selected image."));
      });
      img.src = url;
      await loaded;

      const maxSide = 1800;
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = image.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
        d[i] = d[i + 1] = d[i + 2] = contrasted;
      }
      ctx.putImageData(image, 0, 0);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function scanImage(file, onProgress) {
    if (!file) throw new Error("Choose or photograph an autorefractor ticket first.");
    const Tesseract = await ensureScript(OCR_SCRIPT);
    const source = await preprocessImage(file);
    const result = await Tesseract.recognize(source, "eng", {
      logger(message) {
        if (typeof onProgress === "function") onProgress(message);
      }
    });
    const text = result && result.data ? result.data.text : "";
    if (!text.trim()) throw new Error("No readable text was found on the ticket.");
    return {
      ...parseTicketText(text),
      ocr: {
        confidence: result.data && Number.isFinite(result.data.confidence) ? result.data.confidence : null
      }
    };
  }

  return {
    OCR_SCRIPT,
    normalizeText,
    parseRxLine,
    parseTicketText,
    scanImage
  };
});
