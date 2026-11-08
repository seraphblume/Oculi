// A small, dependency-free PDF writer for one-page documents: text in the standard
// Helvetica/Times fonts (WinAnsi), lines, rectangles and rotated text. Coordinates are
// in points from the top-left corner. Used for the Genius preview so saving a PDF does
// not depend on the browser's print support (unreliable in home-screen web apps).
(function () {
  "use strict";

  const FONTS = {
    regular: { key: "F1", base: "Helvetica", css: "Helvetica, Arial, sans-serif", weight: "400" },
    bold: { key: "F2", base: "Helvetica-Bold", css: "Helvetica, Arial, sans-serif", weight: "700" },
    serif: { key: "F3", base: "Times-Roman", css: '"Times New Roman", Times, serif', weight: "400" }
  };

  // Unicode → WinAnsiEncoding for characters outside Latin-1. The minus sign maps to
  // the en dash, which has figure width in Helvetica.
  const WIN_ANSI = {
    0x2212: 0x96, 0x2013: 0x96, 0x2014: 0x97, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94,
    0x2022: 0x95, 0x2026: 0x85, 0x2039: 0x8B, 0x203A: 0x9B, 0x20AC: 0x80
  };

  function toBytes(text) {
    const out = [];
    for (const ch of String(text)) {
      const c = ch.codePointAt(0);
      if (c === 9) out.push(32);
      else if (c >= 32 && c < 127) out.push(c);
      else if (c >= 160 && c <= 255) out.push(c);
      else out.push(WIN_ANSI[c] || 63);
    }
    return out;
  }

  // Literal PDF string, ASCII-only (octal escapes), so string length equals byte length.
  function pdfString(text) {
    return "(" + toBytes(text).map(b => {
      if (b === 40 || b === 41 || b === 92) return "\\" + String.fromCharCode(b);
      if (b < 32 || b > 126) return "\\" + b.toString(8).padStart(3, "0");
      return String.fromCharCode(b);
    }).join("") + ")";
  }

  let measureCtx = null;
  function textWidth(text, font, size) {
    const f = FONTS[font] || FONTS.regular;
    const display = String(text).replace(/−/g, "–");
    if (typeof document !== "undefined") {
      measureCtx = measureCtx || document.createElement("canvas").getContext("2d");
      if (measureCtx) {
        measureCtx.font = `${f.weight} 100px ${f.css}`;
        return measureCtx.measureText(display).width * size / 100;
      }
    }
    return display.length * size * (font === "bold" ? 0.58 : 0.52);
  }

  const n = v => (Math.round(v * 100) / 100).toString();

  function create(width = 612, height = 792) {
    const ops = [];
    const doc = {
      width, height,
      textWidth,
      text(str, x, y, opts = {}) {
        const { font = "regular", size = 10, color = 0, align = "left", spacing = 0 } = opts;
        if (str == null || str === "") return;
        const f = FONTS[font] || FONTS.regular;
        let w = textWidth(str, font, size) + spacing * Math.max(0, [...String(str)].length - 1);
        let sx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
        ops.push(`BT /${f.key} ${n(size)} Tf ${n(color)} g ${n(spacing)} Tc 1 0 0 1 ${n(sx)} ${n(height - y)} Tm ${pdfString(str)} Tj ET`);
      },
      rotatedText(str, cx, cy, degrees, opts = {}) {
        const { font = "bold", size = 48, color = 0.9, spacing = 0 } = opts;
        const f = FONTS[font] || FONTS.regular;
        const w = textWidth(str, font, size) + spacing * Math.max(0, [...String(str)].length - 1);
        const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
        // Start so the text's centre line passes through (cx, cy).
        const x = cx - (w / 2) * c + (size * 0.35) * s;
        const y = (height - cy) - (w / 2) * s - (size * 0.35) * c;
        ops.push(`BT /${f.key} ${n(size)} Tf ${n(color)} g ${n(spacing)} Tc ${n(c)} ${n(s)} ${n(-s)} ${n(c)} ${n(x)} ${n(y)} Tm ${pdfString(str)} Tj ET`);
      },
      line(x1, y1, x2, y2, opts = {}) {
        const { width: lw = 0.5, color = 0.6 } = opts;
        ops.push(`${n(lw)} w ${n(color)} G ${n(x1)} ${n(height - y1)} m ${n(x2)} ${n(height - y2)} l S`);
      },
      rect(x, y, w, h, opts = {}) {
        const { fill = null, stroke = null, width: lw = 0.5, radius = 0 } = opts;
        let path = `${n(x)} ${n(height - y - h)} ${n(w)} ${n(h)} re`;
        if (radius > 0) {
          // Rounded rectangle from four cubic Bézier corners (k ≈ 0.5523 approximates a quarter circle).
          const r = Math.min(radius, w / 2, h / 2), k = r * 0.4477;
          const L = x, R = x + w, T = height - y, B = height - y - h;
          path = [`${n(L + r)} ${n(T)} m`, `${n(R - r)} ${n(T)} l`, `${n(R - k)} ${n(T)} ${n(R)} ${n(T - k)} ${n(R)} ${n(T - r)} c`,
            `${n(R)} ${n(B + r)} l`, `${n(R)} ${n(B + k)} ${n(R - k)} ${n(B)} ${n(R - r)} ${n(B)} c`,
            `${n(L + r)} ${n(B)} l`, `${n(L + k)} ${n(B)} ${n(L)} ${n(B + k)} ${n(L)} ${n(B + r)} c`,
            `${n(L)} ${n(T - r)} l`, `${n(L)} ${n(T - k)} ${n(L + k)} ${n(T)} ${n(L + r)} ${n(T)} c h`].join(" ");
        }
        if (fill != null && stroke != null) ops.push(`${n(lw)} w ${n(fill)} g ${n(stroke)} G ${path} B`);
        else if (fill != null) ops.push(`${n(fill)} g ${path} f`);
        else if (stroke != null) ops.push(`${n(lw)} w ${n(stroke)} G ${path} S`);
      },
      // Greedy word wrap with the same metrics used for drawing.
      wrap(str, maxWidth, font = "regular", size = 10) {
        const lines = [];
        for (const paragraph of String(str || "").split(/\n/)) {
          let line = "";
          for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            const next = line ? line + " " + word : word;
            if (!line || textWidth(next, font, size) <= maxWidth) { line = next; continue; }
            lines.push(line);
            line = word;
          }
          lines.push(line);
        }
        return lines;
      },
      toBytes(info = {}) {
        const content = ops.join("\n");
        const objects = [
          "<< /Type /Catalog /Pages 2 0 R >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(width)} ${n(height)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>`,
          ...["regular", "bold", "serif"].map(k => `<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[k].base} /Encoding /WinAnsiEncoding >>`),
          `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
          `<< /Title ${pdfString(info.title || "")} /Producer (Oculi) /Creator (Oculi) >>`
        ];
        let out = "%PDF-1.4\n";
        const offsets = [];
        objects.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
        const xref = out.length;
        out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
        out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
        const bytes = new Uint8Array(out.length);
        for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
        return bytes;
      }
    };
    return doc;
  }

  const api = Object.freeze({ create, toBytes, pdfString });
  if (typeof window !== "undefined") window.OculiPdf = api;
  if (typeof module !== "undefined") module.exports = api;
})();
