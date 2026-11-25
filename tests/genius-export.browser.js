#!/usr/bin/env node
// Genius prescription card: printed and saved as a 90 × 160 mm folding card in two pages (inside,
// outside), on desktop (download) and on phones (share sheet), the iOS home-screen fallback, and
// New Patient. Synthetic data only.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json" };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});

// Page count from the page tree, so the check needs no PDF library. pdfinfo, when present, confirms it.
function pageCount(bytes, label) {
  const text = Buffer.from(bytes).toString("latin1");
  const counted = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
  try {
    const dir = require("node:fs").mkdtempSync(path.join(os.tmpdir(), "oculi-pdf-"));
    const file = path.join(dir, "out.pdf");
    require("node:fs").writeFileSync(file, bytes);
    const info = execFileSync("pdfinfo", [file], { encoding: "utf8" });
    const pages = Number(/Pages:\s+(\d+)/.exec(info)[1]);
    assert.equal(pages, counted, `${label}: page tree and pdfinfo agree`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return counted;
}

// Structural checks on Oculi's own PDF writer output: header, xref offsets, trailer.
function checkOculiPdf(bytes) {
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4\n"), "PDF header");
  assert.ok(text.trimEnd().endsWith("%%EOF"), "PDF trailer");
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)[1]);
  assert.ok(text.slice(startxref).startsWith("xref\n"), "startxref points at the xref table");
  const entries = text.slice(startxref).split("\n").slice(2).filter(l => / 00000 n $/.test(l)).map(l => Number(l.slice(0, 10)));
  entries.forEach((offset, i) => assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`), `xref entry ${i + 1}`));
  return text;
}

async function genius(page, worst) {
  await page.locator("#geniusTab").click();
  const pick = async (values) => { for (const [id, value] of Object.entries(values)) await page.locator(`#${id}`).selectOption(value); };
  await page.locator("#geniusAge").fill(worst ? "52" : "42");
  await page.getByRole("radio", { name: "Wears glasses", exact: true }).click();
  await pick({ geniusOdPrevSph: "1.00", geniusOsPrevSph: "0.75" });
  await pick({ geniusOdSelSph: "2.00", geniusOdSelCyl: "1.00", geniusOdSelAx: "180", geniusOsSelSph: "1.00", geniusOsSelCyl: "0.50", geniusOsSelAx: "90" });
  if (worst) {
    await pick({ geniusOdSelSph: "5.00", geniusOdSelCyl: "2.00", geniusOdSelAx: "45", geniusOsSelSph: "4.00", geniusOsSelCyl: "1.75", geniusOsSelAx: "135",
      geniusOdR1Sph: "5.75", geniusOdR1Cyl: "2.75", geniusOdR1Ax: "30", geniusOdR2Sph: "4.25", geniusOdR2Cyl: "1.00", geniusOdR2Ax: "60",
      geniusOsR1Sph: "4.75", geniusOsR1Cyl: "2.50", geniusOsR1Ax: "120", geniusOsR2Sph: "3.25", geniusOsR2Cyl: "0.75", geniusOsR2Ax: "150" });
    for (const id of ["geniusDiabetes", "geniusHypertension", "geniusPregnancy", "geniusBlurredVision", "geniusHeadache", "geniusGlare", "geniusTearing",
      "geniusIrritation", "geniusItching", "geniusDischarge", "geniusDryEye"]) await page.locator(`label:has(#${id})`).click();
    await page.locator("#geniusOtherSymptoms").fill("Intermittent blur late in the day after long screen sessions and night driving");
    for (const [id, v] of Object.entries({ geniusPdOdDist: "31.5", geniusPdOsDist: "31.5", geniusPdOdNear: "30", geniusPdOsNear: "30" })) await page.locator(`#${id}`).fill(v);
    await page.locator("#geniusNearWd").fill("400");
  } else {
    await page.getByRole("button", { name: "Toggle OS selected sphere sign" }).click();
    await page.getByRole("button", { name: "Toggle OS current glasses sphere sign" }).click();
  }
  await page.locator("#geniusForm button[type=submit]").click();
  assert.equal(await page.locator("#geniusResults").isVisible(), true, await page.locator("#geniusError").innerText());
  await page.locator("#geniusVaOd").selectOption("20/20");
  await page.locator("#geniusVaOs").selectOption("20/25");
  await page.locator("#geniusVaOu").selectOption("20/20");
  await page.getByRole("radio", { name: "Comfortable", exact: true }).click();
  await page.getByRole("radio", { name: "Holds line", exact: true }).click();
  await page.getByRole("radio", { name: "Refined", exact: true }).click();
  await page.locator("#geniusPreview").click();
  assert.equal(await page.locator("#geniusPrescription").isVisible(), true, await page.locator("#geniusVerifyError").innerText());
  if (worst) {
    await page.locator("#geniusPatientName").fill("Maria Fernanda de los Angeles Gutierrez Villasenor y Montes de Oca, preview patient");
    await page.locator("#geniusPrescriptionNotes").fill("Long note. ".repeat(45).trim());
    await page.locator("#rxCardInside .rx-lenses label:has([data-lens=Progressive])").click();
  } else {
    await page.locator("#geniusPatientName").fill("Preview patient");
    await page.locator("#geniusPrescriptionNotes").fill("Test output only");
  }
}

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  if (process.env.DIOPTRA_SCREENSHOT_DIR) await fs.mkdir(process.env.DIOPTRA_SCREENSHOT_DIR, { recursive: true });
  const url = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.DIOPTRA_BROWSER_CHANNEL ? { channel: process.env.DIOPTRA_BROWSER_CHANNEL } : {}) });

    // ------------------------------------------------------------ desktop
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", acceptDownloads: true, locale: "es-MX" });
    await desktop.addInitScript(() => localStorage.setItem("oculi-zl-first-run", "seen"));
    const page = await desktop.newPage();
    const errors = [];
    page.on("pageerror", err => errors.push(err.message));
    await page.goto(url);
    await genius(page, false);

    // Placeholders and footer.
    assert.equal(await page.locator("#geniusSignatory").innerText(), "Valeria Luxe");
    assert.equal(await page.locator("#geniusLicence").innerText(), "Pending certification");
    assert.match(await page.locator("#geniusPrescriptionVersion").innerText(), /^Oculi Model · proposed OD −2\.25 −1\.00 × 180°/);
    const previewText = await page.locator("#geniusPrescription").innerText();
    assert.doesNotMatch(previewText, /research prototype|Model v0\.3/i);
    assert.doesNotMatch(await page.locator("#geniusFlags").innerText(), /Not indicative|unvalidated|Not clinically validated|fitted offset/);
    assert.equal(await page.locator("#geniusPrint").isVisible(), true, "desktop browsers can print");
    assert.equal(await page.locator("#geniusSavePdf").innerText(), "Save PDF");
    assert.equal(await page.locator("#geniusNewPatient").isVisible(), true);

    // Printing shows only the card: two 90 × 160 mm pages (inside, outside) — also for a long case.
    for (const worst of [false, true]) {
      if (worst) {
        await page.locator("#geniusNewPatient").click();
        await genius(page, true);
        assert.ok((await page.locator("#geniusPrescriptionFlags li").count()) >= 6, "worst case carries many review notes");
      }
      await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
      // Measure with IBM Plex loaded, as a real print would; never with the fallback font.
      assert.equal(await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === "loaded" && /IBM Plex/.test(f.family)).length; }), 3, "Plex is loaded before printing");
      const fit = await page.evaluate(() => { const p = document.getElementById("rxFit"); return { over: p.scrollHeight - p.clientHeight, fit: getComputedStyle(document.getElementById("rxCardInside")).getPropertyValue("--fit") }; });
      assert.ok(fit.over <= 1, `${worst ? "long" : "short"} card's lower panel fits on screen (fit ${fit.fit})`);
      const bytes = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      if (process.env.DIOPTRA_SCREENSHOT_DIR) await fs.writeFile(path.join(process.env.DIOPTRA_SCREENSHOT_DIR, `print-card-${worst ? "long" : "short"}.pdf`), bytes);
      assert.equal(pageCount(bytes, "print card"), 2, `${worst ? "long" : "short"} card prints inside and outside`);
      const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(Buffer.from(bytes).toString("latin1"));
      assert.ok(Math.abs(Number(box[1]) - 255.12) < 1.5 && Math.abs(Number(box[2]) - 453.54) < 1.5, `printed at 90 × 160 mm, got ${box[1]} × ${box[2]}`);
      await page.emulateMedia({ media: "print" });
      const hidden = await page.evaluate(() => ["navbar", "geniusForm", "geniusResults", "actionBar"].map(id => getComputedStyle(document.getElementById(id)).display));
      assert.deepEqual(hidden, ["none", "none", "none", "none"], "print hides everything but the card");
      assert.equal(await page.locator("#geniusPatientNamePrint").isVisible(), true);
      const printedOver = await page.evaluate(() => { const p = document.getElementById("rxFit"); return p.scrollHeight - p.clientHeight; });
      assert.ok(printedOver <= 1, `${worst ? "long" : "short"} card's lower panel fits in print (over by ${printedOver}px)`);
      assert.match(await page.evaluate(() => getComputedStyle(document.querySelector(".rx-cover")).transform), /^matrix\(-1, .*-1, 0, 0\)$/, "the front cover prints turned so it reads upright once folded");
      await page.emulateMedia({ media: null });
    }

    // Save PDF on desktop downloads the two-page card with the preview's content.
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#geniusSavePdf").click()]);
    assert.match(download.suggestedFilename(), /^oculi-rx-card-\d{4}-\d{2}-\d{2}\.pdf$/);
    const pdf = await fs.readFile(await download.path());
    const text = checkOculiPdf(pdf);
    assert.equal(pageCount(pdf, "saved PDF"), 2);
    assert.match(text, /\/MediaBox \[0 0 255\.12 453\.54\]/, "a 90 × 160 mm card on every locale");
    for (const s of ["(Valeria Luxe)", "(Pending certification)", "(VERIFIED BY)", "(LICENCE OR CERTIFICATION)", "(NOT INDICATIVE OF THE FINAL PRODUCT)", "(About this card)",
      "(Not indicative of the final product.)", "(Maria Fernanda", "(SPHERE)", "(PD FAR)", "(PD NEAR)", "(31.5)", "(Progressive)", "(Adapting to new glasses)", "(Oculi)"]) assert.ok(text.includes(s), `PDF contains ${s}`);
    for (const s of ["NOT A PRESCRIPTION", "Not a prescription", "unvalidated", "Not clinically validated"]) assert.ok(!text.includes(s), `PDF leaves out ${s}`);
    assert.match(text, / cm\n[\s\S]*\(Oculi\) Tj[\s\S]*\nQ/, "front cover drawn turned 180°");
    assert.match(text, /0\.08 0\.07 0\.35 rg [\d. ]+ m/, "the emblem in labs-indigo");
    assert.ok(/\(Oculi Model \\267 proposed OD \\226/.test(text), "footer label with the minus sign as an en dash");
    assert.ok(!/research prototype/.test(text));
    assert.match(await page.locator("#geniusExportStatus").innerText(), /Saved oculi-rx-card-/);
    if (process.env.DIOPTRA_SCREENSHOT_DIR) await fs.writeFile(path.join(process.env.DIOPTRA_SCREENSHOT_DIR, "genius-preview.pdf"), pdf);

    // The card is the same size everywhere.
    const a4 = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", locale: "en-GB" });
    await a4.addInitScript(() => localStorage.setItem("oculi-zl-first-run", "seen"));
    const a4Page = await a4.newPage();
    await a4Page.goto(url);
    await genius(a4Page, false);
    const a4Bytes = await a4Page.evaluate(() => Array.from(OculiGenius.buildPdf()));
    assert.match(Buffer.from(a4Bytes).toString("latin1"), /\/MediaBox \[0 0 255\.12 453\.54\]/);
    await a4.close();

    // New Patient starts over.
    await page.locator("#geniusNewPatient").click();
    for (const id of ["geniusName", "geniusAge", "geniusBirthdate", "geniusPatientName", "geniusPrescriptionNotes", "geniusPdOdDist", "geniusOdSelSph"]) assert.equal(await page.locator(`#${id}`).inputValue(), "", id);
    for (const id of ["geniusResults", "geniusPrescription", "geniusGlassesFields", "geniusCompare"]) assert.equal(await page.locator(`#${id}`).isVisible(), false, id);
    assert.equal(await page.locator("#geniusPanel .chip.on").count(), 0);
    assert.equal(await page.locator('#geniusStepper li[data-step="screen"]').getAttribute("class"), "current");
    assert.equal(await page.evaluate(() => document.activeElement.id), "geniusName");
    assert.deepEqual(errors, []);
    await desktop.close();

    // ------------------------------------------------------------ phone, added to the home screen
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await phone.addInitScript(() => localStorage.setItem("oculi-zl-first-run", "seen"));
    await phone.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
      navigator.canShare = data => !!(data && data.files && data.files.every(f => f.type === "application/pdf"));
      navigator.share = async data => {
        const f = data.files[0];
        window.__shared = { name: f.name, type: f.type, size: f.size, bytes: Array.from(new Uint8Array(await f.arrayBuffer())) };
      };
    });
    const mobile = await phone.newPage();
    const mobileErrors = [];
    mobile.on("pageerror", err => mobileErrors.push(err.message));
    await mobile.goto(url);
    assert.equal(await mobile.evaluate(() => matchMedia("(pointer: coarse)").matches), true);
    await genius(mobile, false);
    assert.equal(await mobile.locator("#geniusPrint").isVisible(), false, "no dead Print button in a home-screen app");
    assert.equal(await mobile.locator("#geniusSavePdf").innerText(), "Save or Print PDF", "the share sheet offers Print");
    const saveBox = await mobile.locator("#geniusSavePdf").boundingBox();
    const actionsBox = await mobile.locator("#geniusPrescription .prescription-actions").boundingBox();
    assert.ok(saveBox.width > actionsBox.width - 2, "Save PDF spans the row when Print is hidden");
    assert.ok(saveBox.height >= 44 && (await mobile.locator("#geniusNewPatient").boundingBox()).height >= 44, "touch targets");
    await mobile.locator("#geniusSavePdf").click();
    await mobile.waitForFunction(() => window.__shared);
    const shared = await mobile.evaluate(() => window.__shared);
    assert.match(shared.name, /^oculi-rx-card-\d{4}-\d{2}-\d{2}\.pdf$/);
    assert.equal(shared.type, "application/pdf");
    checkOculiPdf(Uint8Array.from(shared.bytes));
    assert.equal(pageCount(Uint8Array.from(shared.bytes), "shared PDF"), 2);
    assert.equal(await mobile.locator("#geniusExportStatus").innerText(), "");
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow on a phone");
    if (process.env.DIOPTRA_SCREENSHOT_DIR) await mobile.locator("#geniusPrescription").screenshot({ path: path.join(process.env.DIOPTRA_SCREENSHOT_DIR, "genius-preview-phone.png") });
    await mobile.locator("#geniusNewPatient").click();
    assert.equal(await mobile.locator("#geniusPrescription").isVisible(), false);
    assert.equal(await mobile.locator("#geniusAge").inputValue(), "");
    assert.deepEqual(mobileErrors, []);
    await phone.close();

    console.log("PASS: Genius 90 × 160 mm card (print and PDF, inside and outside, long case), download and share sheet, home-screen fallback, signatory placeholders, New Patient");
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
