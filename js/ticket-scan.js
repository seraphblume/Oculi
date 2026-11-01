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

  function signedPower(sign, token) {
    const source = String(token || "").replace(",", ".");
    const magnitude = source.includes(".")
      ? Number(source)
      : (/^\d{3,4}$/.test(source) ? Number(source) / 100 : NaN);
    if (!Number.isFinite(magnitude)) return null;
    return sign === "-" ? -magnitude : magnitude;
  }

  function parseRxLine(line) {
    const source = String(line || "").trim();
    const cleaned = normalizeText(source)
      .replace(/[=]/g, "-")
      .replace(/_/g, " ");
    // Require signed sphere and cylinder values. The compact alternatives
    // recover thermal-printer OCR such as "-250-1.25178 9" without accepting
    // dates, PD lines, or other unrelated numeric text.
    const match = /(?:^|[^0-9])([+\-])\s*(\d{1,2}\.\d{1,2}|\d{3,4})\s*([+\-])\s*(\d{1,2}\.\d{1,2}|\d{3}|1000)\s*[+\-]?\s*(\d{1,3})(?:\s+[+\-]?\s*(\d{1,2}))?[\s>|!}\]]*$/.exec(cleaned);
    if (!match) return null;

    const sphere = signedPower(match[1], match[2]);
    const cylinder = signedPower(match[3], match[4]);
    let axis = Number(match[5]);
    const reliability = match[6] == null ? null : Number(match[6]);

    if (sphere == null || cylinder == null || Math.abs(sphere) > 30 || Math.abs(cylinder) > 10) return null;
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
    const clinical = e === "R" ? "OD" : "OS";
    return new RegExp("<\\s*(?:" + e + "|" + clinical + ")\\s*>").test(s) ||
      new RegExp("^\\s*(?:" + e + "D?|" + clinical + ")\\s+(?:S|SPH)\\b").test(s);
  }

  function metadataStop(line) {
    return /^\s*(?:PD\b|VD\s*=|WD\s*=|NAME\b|\d{1,2}\s*\/)/i.test(String(line || ""));
  }

  function parseRows(rows) {
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

  function parseEye(lines, start, end) {
    const rows = [];
    for (let i = start; i < end; i += 1) {
      const row = parseRxLine(lines[i]);
      if (row) rows.push(row);
    }
    return parseRows(rows);
  }

  function inferredEyeGroups(lines) {
    const entries = lines
      .map((line, index) => ({ index, row: parseRxLine(line) }))
      .filter(entry => entry.row);
    const groups = [];
    let current = [];
    for (const entry of entries) {
      const previous = current[current.length - 1];
      const beginsAfterSelected = previous && previous.row.selected && !entry.row.selected;
      if (previous && (entry.index > previous.index + 1 || beginsAfterSelected)) {
        groups.push(current);
        current = [];
      }
      current.push(entry);
    }
    if (current.length) groups.push(current);

    const viable = groups.filter(group => group.length >= 2);
    if (viable.length === 2) return viable.map(group => group.map(entry => entry.row));
    if (viable.length === 1 && viable[0].length === 8) {
      const rows = viable[0].map(entry => entry.row);
      return [rows.slice(0, 4), rows.slice(4)];
    }
    return null;
  }

  function firstMatch(text, regex) {
    const m = regex.exec(text);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function boundedMatch(text, regex, minimum, maximum) {
    const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
    const matcher = new RegExp(regex.source, flags);
    let match;
    while ((match = matcher.exec(text))) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value >= minimum && value <= maximum) return value;
    }
    return null;
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

    let inferredEyes = false;
    let od;
    let os;
    if (rIndex >= 0 && lIndex >= 0) {
      od = parseEye(lines, rIndex + 1, rEnd);
      os = parseEye(lines, lIndex + 1, lEnd);
    } else {
      const groups = inferredEyeGroups(lines);
      if (groups) {
        od = parseRows(groups[0]);
        os = parseRows(groups[1]);
        inferredEyes = true;
      } else {
        od = rIndex >= 0 ? parseEye(lines, rIndex + 1, rEnd) : { readings: [], selected: null };
        os = lIndex >= 0 ? parseEye(lines, lIndex + 1, lEnd) : { readings: [], selected: null };
      }
    }

    const vertexMm = boundedMatch(text, /\bVD\s*=\s*(\d+(?:\.\d+)?)/i, 0, 25);
    const workingDistanceCm = boundedMatch(text, /\bWD\s*=\s*(\d+(?:\.\d+)?)/i, 10, 100);
    const pdDistanceMm = boundedMatch(text, /\bPD\s*[:=]?\s*(\d+(?:\.\d+)?)/i, 20, 90);
    const pdNearMm = boundedMatch(text, /\bN\s*[:=]?\s*(\d+(?:\.\d+)?)/i, 20, 90);

    const warnings = [];
    if (inferredEyes) {
      warnings.push("Eye labels were unclear; OD/OS were inferred from printed right-then-left order");
    } else {
      if (rIndex < 0) warnings.push("OD section not recognized");
      if (lIndex < 0) warnings.push("OS section not recognized");
    }
    if (!od.selected) warnings.push("OD selected line not recognized");
    if (!os.selected) warnings.push("OS selected line not recognized");
    if (od.selected && od.selected.transposed) warnings.push("OD plus cylinder transposed to minus notation");
    if (os.selected && os.selected.transposed) warnings.push("OS plus cylinder transposed to minus notation");
    if (od.readings.length < 3) warnings.push(`OD: ${od.readings.length}/3 repeat readings recognized`);
    if (os.readings.length < 3) warnings.push(`OS: ${os.readings.length}/3 repeat readings recognized`);
    if (pdDistanceMm != null && pdNearMm == null) warnings.push("Near PD not recognized");
    if (pdDistanceMm == null && pdNearMm != null) warnings.push("Distance PD not recognized");

    return {
      od,
      os,
      instrument: { vertexMm, pdDistanceMm, pdNearMm },
      near: { workingDistanceCm },
      warnings,
      rawText: text,
      eyeLabelsInferred: inferredEyes
    };
  }

  function eyeScore(eye) {
    if (!eye) return -Infinity;
    let score = (eye.selected ? 100 : 0) + (eye.readings || []).length * 10;
    if (eye.selected && eye.readings && eye.readings.length) {
      const distances = eye.readings.map(reading =>
        Math.abs(reading.sphere - eye.selected.sphere) +
        Math.abs(reading.cylinder - eye.selected.cylinder) +
        Math.min(Math.abs(reading.axis - eye.selected.axis), 180 - Math.abs(reading.axis - eye.selected.axis)) / 20
      );
      score -= Math.min(9, distances.reduce((sum, value) => sum + value, 0) / distances.length);
    }
    return score;
  }

  function sameSelected(a, b) {
    if (!a || !b) return true;
    return a.sphere === b.sphere && a.cylinder === b.cylinder && a.axis === b.axis;
  }

  function firstNumber(...values) {
    return values.find(value => value != null && Number.isFinite(Number(value))) ?? null;
  }

  function mergedWarnings(result, primary, secondary) {
    const warnings = [];
    if (primary.eyeLabelsInferred && secondary.eyeLabelsInferred) {
      warnings.push("Eye labels were unclear; OD/OS were inferred from printed right-then-left order");
    }
    if (!result.od.selected) warnings.push("OD selected line not recognized");
    if (!result.os.selected) warnings.push("OS selected line not recognized");
    if (result.od.selected && result.od.selected.transposed) warnings.push("OD plus cylinder transposed to minus notation");
    if (result.os.selected && result.os.selected.transposed) warnings.push("OS plus cylinder transposed to minus notation");
    if (result.od.readings.length < 3) warnings.push("OD: " + result.od.readings.length + "/3 repeat readings recognized");
    if (result.os.readings.length < 3) warnings.push("OS: " + result.os.readings.length + "/3 repeat readings recognized");
    if (!sameSelected(primary.od.selected, secondary.od.selected)) warnings.push("OD selected value differs between OCR passes");
    if (!sameSelected(primary.os.selected, secondary.os.selected)) warnings.push("OS selected value differs between OCR passes");
    if (result.instrument.pdDistanceMm != null && result.instrument.pdNearMm == null) warnings.push("Near PD not recognized");
    if (result.instrument.pdDistanceMm == null && result.instrument.pdNearMm != null) warnings.push("Distance PD not recognized");
    return warnings;
  }

  function mergeParsedTickets(primary, secondary) {
    const od = eyeScore(primary.od) >= eyeScore(secondary.od) ? primary.od : secondary.od;
    const os = eyeScore(primary.os) >= eyeScore(secondary.os) ? primary.os : secondary.os;
    const result = {
      od,
      os,
      instrument: {
        vertexMm: firstNumber(primary.instrument.vertexMm, secondary.instrument.vertexMm),
        pdDistanceMm: firstNumber(primary.instrument.pdDistanceMm, secondary.instrument.pdDistanceMm),
        pdNearMm: firstNumber(primary.instrument.pdNearMm, secondary.instrument.pdNearMm)
      },
      near: {
        workingDistanceCm: firstNumber(primary.near.workingDistanceCm, secondary.near.workingDistanceCm)
      },
      rawText: [primary.rawText, secondary.rawText].filter(Boolean).join("\n\n--- alternate OCR pass ---\n"),
      eyeLabelsInferred: Boolean(primary.eyeLabelsInferred && secondary.eyeLabelsInferred)
    };
    result.warnings = mergedWarnings(result, primary, secondary);
    return result;
  }

  function addMetadata(result, parsed) {
    result.instrument.vertexMm = firstNumber(result.instrument.vertexMm, parsed.instrument.vertexMm);
    result.instrument.pdDistanceMm = firstNumber(result.instrument.pdDistanceMm, parsed.instrument.pdDistanceMm);
    result.instrument.pdNearMm = firstNumber(result.instrument.pdNearMm, parsed.instrument.pdNearMm);
    result.near.workingDistanceCm = firstNumber(result.near.workingDistanceCm, parsed.near.workingDistanceCm);
    result.rawText = [result.rawText, parsed.rawText].filter(Boolean).join("\n\n--- metadata OCR ---\n");
    result.warnings = result.warnings.filter(warning => warning !== "Near PD not recognized" && warning !== "Distance PD not recognized");
    if (result.instrument.pdDistanceMm != null && result.instrument.pdNearMm == null) result.warnings.push("Near PD not recognized");
    if (result.instrument.pdDistanceMm == null && result.instrument.pdNearMm != null) result.warnings.push("Distance PD not recognized");
    return result;
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

  function smoothCounts(values, radius) {
    const prefix = [0];
    for (const value of values) prefix.push(prefix[prefix.length - 1] + value);
    return values.map((_, index) => {
      const start = Math.max(0, index - radius);
      const end = Math.min(values.length, index + radius + 1);
      return (prefix[end] - prefix[start]) / (end - start);
    });
  }

  function longestRange(values, minimum) {
    let best = null;
    let start = -1;
    for (let index = 0; index <= values.length; index += 1) {
      if (index < values.length && values[index] >= minimum) {
        if (start < 0) start = index;
      } else if (start >= 0) {
        if (!best || index - start > best.end - best.start) best = { start, end: index };
        start = -1;
      }
    }
    return best;
  }

  function findPaperBounds(image, width, height) {
    const columns = Array(width).fill(0);
    const rows = Array(height).fill(0);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const at = (y * width + x) * 4;
        const r = image.data[at];
        const g = image.data[at + 1];
        const b = image.data[at + 2];
        const high = Math.max(r, g, b);
        const low = Math.min(r, g, b);
        if (high >= 80 && high - low <= 16) {
          columns[x] += 1;
          rows[y] += 1;
        }
      }
    }
    const columnRange = longestRange(
      smoothCounts(columns, Math.max(3, Math.round(width * 0.015))),
      height * 0.02
    );
    const rowRange = longestRange(
      smoothCounts(rows, Math.max(3, Math.round(height * 0.008))),
      width * 0.02
    );
    if (!columnRange || !rowRange) return { left: 0, top: 0, width, height };

    const padX = Math.round(width * 0.01);
    const padY = Math.round(height * 0.01);
    const left = Math.max(0, columnRange.start - padX);
    const top = Math.max(0, rowRange.start - padY);
    const right = Math.min(width, columnRange.end + padX);
    const bottom = Math.min(height, rowRange.end + padY);
    const found = { left, top, width: right - left, height: bottom - top };
    if (found.width < width * 0.25 || found.height < height * 0.35) {
      return { left: 0, top: 0, width, height };
    }
    return found;
  }

  function otsuThreshold(histogram, total) {
    const sum = histogram.reduce((value, count, index) => value + count * index, 0);
    let backgroundWeight = 0;
    let backgroundSum = 0;
    let bestVariance = -1;
    let threshold = 128;
    for (let value = 0; value < 256; value += 1) {
      backgroundWeight += histogram[value];
      if (!backgroundWeight) continue;
      const foregroundWeight = total - backgroundWeight;
      if (!foregroundWeight) break;
      backgroundSum += value * histogram[value];
      const backgroundMean = backgroundSum / backgroundWeight;
      const foregroundMean = (sum - backgroundSum) / foregroundWeight;
      const variance = backgroundWeight * foregroundWeight * Math.pow(backgroundMean - foregroundMean, 2);
      if (variance > bestVariance) {
        bestVariance = variance;
        threshold = value;
      }
    }
    return Math.max(120, Math.min(190, threshold + 14));
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
      const base = document.createElement("canvas");
      base.width = Math.max(1, Math.round(img.naturalWidth * scale));
      base.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const baseContext = base.getContext("2d", { willReadFrequently: true });
      baseContext.drawImage(img, 0, 0, base.width, base.height);

      const baseImage = baseContext.getImageData(0, 0, base.width, base.height);
      const bounds = findPaperBounds(baseImage, base.width, base.height);
      const outputScale = Math.min(3, maxSide / Math.max(bounds.width, bounds.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bounds.width * outputScale));
      canvas.height = Math.max(1, Math.round(bounds.height * outputScale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(base, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, canvas.width, canvas.height);

      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const histogram = Array(256).fill(0);
      for (let i = 0; i < image.data.length; i += 4) {
        const gray = Math.round(0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]);
        histogram[gray] += 1;
      }
      const threshold = otsuThreshold(histogram, canvas.width * canvas.height);
      for (let i = 0; i < image.data.length; i += 4) {
        const gray = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
        const binary = gray <= threshold ? 0 : 255;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = binary;
      }
      context.putImageData(image, 0, 0);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function scanImage(file, onProgress) {
    if (!file) throw new Error("Choose or photograph an autorefractor ticket first.");
    const Tesseract = await ensureScript(OCR_SCRIPT);
    const primarySource = await preprocessImage(file);
    let progressOffset = 0;
    let progressScale = 0.45;
    const worker = await Tesseract.createWorker("eng", 1, {
      logger(message) {
        if (typeof onProgress !== "function") return;
        if (message.status === "recognizing text" && Number.isFinite(message.progress)) {
          onProgress({ ...message, progress: progressOffset + message.progress * progressScale });
        } else {
          onProgress(message);
        }
      }
    });
    try {
      const primaryResult = await worker.recognize(primarySource);
      progressOffset = 0.45;
      const secondaryResult = await worker.recognize(file);
      const primaryText = primaryResult && primaryResult.data ? primaryResult.data.text : "";
      const secondaryText = secondaryResult && secondaryResult.data ? secondaryResult.data.text : "";
      if (!primaryText.trim() && !secondaryText.trim()) throw new Error("No readable text was found on the ticket.");

      let parsed = mergeParsedTickets(parseTicketText(primaryText), parseTicketText(secondaryText));
      if (parsed.instrument.pdDistanceMm == null || parsed.instrument.pdNearMm == null) {
        progressOffset = 0.9;
        progressScale = 0.05;
        await worker.setParameters({
          tessedit_char_whitelist: "PDN0123456789 .",
          tessedit_pageseg_mode: "6"
        });
        const top = Math.round(primarySource.height * 0.72);
        const height = Math.max(1, Math.round(primarySource.height * 0.2));
        const overlap = Math.round(primarySource.width * 0.12);
        const middle = Math.round(primarySource.width / 2);
        const leftMetadata = await worker.recognize(primarySource, {
          rectangle: { left: 0, top, width: Math.min(primarySource.width, middle + overlap), height }
        });
        progressOffset = 0.95;
        const rightMetadata = await worker.recognize(primarySource, {
          rectangle: { left: Math.max(0, middle - overlap), top, width: Math.min(primarySource.width, middle + overlap), height }
        });
        const metadataText = [leftMetadata.data.text, rightMetadata.data.text].filter(Boolean).join("\n");
        parsed = addMetadata(parsed, parseTicketText(metadataText));
      }

      const confidences = [primaryResult, secondaryResult]
        .map(result => result && result.data ? result.data.confidence : null)
        .filter(Number.isFinite);
      return {
        ...parsed,
        ocr: {
          confidence: confidences.length ? Math.max(...confidences) : null,
          passes: confidences
        }
      };
    } finally {
      await worker.terminate();
    }
  }

  return {
    OCR_SCRIPT,
    normalizeText,
    parseRxLine,
    parseTicketText,
    mergeParsedTickets,
    scanImage
  };
});
