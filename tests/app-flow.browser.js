#!/usr/bin/env node
// Synthetic cases only, in isolated Chromium storage. Requires Playwright + Chromium.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.DIOPTRA_BROWSER_CHANNEL ? { channel: process.env.DIOPTRA_BROWSER_CHANNEL } : {}) });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const page = await context.newPage();
    const errors = [];
    const scannerDialogs = [];
    let acceptScannerImport = true;
    page.on("pageerror", err => errors.push(err.message));
    page.on("dialog", async dialog => {
      scannerDialogs.push(dialog.message());
      if (acceptScannerImport) await dialog.accept();
      else await dialog.dismiss();
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    assert.match(await page.locator("#engineLine").innerText(), /Beryl 1\.0 · not clinically validated · compared with v0\.3\.0/);
    assert.equal(await page.locator("#previousRxFields").isVisible(), false);

    // A real old-format record must retain both engine identities and its original bytes.
    const historical = await page.evaluate(() => {
      const input = { age: 25, previousRxKnown: "", od: { sphere: -2.5, cylinder: -1.25, axis: 178 }, os: { sphere: -2.75, cylinder: -1, axis: 168 } };
      const run = { primary: { prediction: DioptraAlgorithm.predictCase(input) }, shadow: { prediction: DioptraEngineV03.predictCase(input) } };
      const actual = { od: { ...input.od }, os: { ...input.os }, add: null, note: "Synthetic historical case" };
      const record = { caseId: "RX-0001", savedAt: "2026-10-01T12:00:00Z", input, actual, prediction: run.primary.prediction,
        comparison: { od: DioptraAlgorithm.compareEye(run.primary.prediction.od, actual.od), os: DioptraAlgorithm.compareEye(run.primary.prediction.os, actual.os) },
        shadow: { shadowOnly: true, prediction: run.shadow.prediction, observations: { near: { workingDistanceCm: 40, nearPointCm: 50 } } } };
      DioptraStorage.saveCase(record);
      return JSON.stringify(record);
    });
    await page.reload();
    assert.match(await page.locator("#statsScope").innerText(), /0 cases · 1 earlier cases/);
    assert.equal(await page.locator("#stats .stat strong").first().innerText(), "0");
    assert.equal(await page.locator("#engineCompare tr").count(), 0, "historical data do not contaminate prospective RC stats");
    const oldExport = await page.evaluate(() => DioptraStorage.toShadowCSV(DioptraStorage.listCases()));
    const oldRows = oldExport.split("\n").map(r => r.split(","));
    assert.equal(oldRows[1][oldRows[0].indexOf("near_wd_mm")], "400");

    // A dropdown-only edit must trigger the discard guard.
    await page.locator("#odSelSph").selectOption("2.50");
    await page.getByRole("button", { name: "New Case", exact: true }).click();
    await page.locator("#dialog").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Keep Editing" }).click();
    assert.equal(await page.locator("#odSelSph").inputValue(), "2.50");

    await page.locator("#age").fill("52");
    for (const [id, value] of Object.entries({ odSelSph: "2.50", odSelCyl: "1.25", odSelAx: "178", osSelSph: "2.75", osSelCyl: "1.00", osSelAx: "168" })) {
      await page.locator(`#${id}`).selectOption(value);
    }
    for (const id of ["vaOd", "phOd", "vaOs", "phOs"]) {
      assert.equal(await page.locator(`#${id} option[value="20/100"]`).innerText(), "0.20 = 20/100");
    }
    await page.locator("#vaOd").selectOption("20/100");
    await page.locator("#primaryAction").click();
    assert.match(await page.locator("#toast").innerText(), /unaided or with correction/, "VA needs its correction condition");
    await page.getByRole("radio", { name: "Unaided", exact: true }).click();
    // Glare is context; new flashes or floaters are a warning sign with a visible note.
    await page.locator("label:has([data-symptom=glareHalos])").click();
    assert.equal(await page.locator("#warningNote").isVisible(), false);
    await page.locator("label:has([data-symptom=flashesFloaters])").click();
    assert.equal(await page.locator("#warningNote").isVisible(), true);
    await page.locator("#nearWd").fill("330");
    await page.locator("#nearPoint").fill("500");
    await page.getByRole("radio", { name: "Yes", exact: true }).click();
    assert.equal(await page.locator("#previousRxFields").isVisible(), true);
    await page.locator("#primaryAction").click();
    assert.equal(await page.locator("body").getAttribute("data-stage"), "measure");
    assert.match(await page.locator("#toast").innerText(), /previous prescription/);
    for (const eye of ["od", "os"]) {
      await page.locator(`#${eye}PrevSph`).selectOption("1.00");
    }
    await page.getByRole("button", { name: "Toggle OD previous sphere sign" }).click();
    await page.locator("#previousAdd").selectOption("1.25");
    await page.locator("#previousWornMonths").fill("24.5");
    await page.locator("#primaryAction").click();
    assert.equal(await page.locator("body").getAttribute("data-stage"), "measure");
    assert.match(await page.locator("#toast").innerText(), /whole months/);
    await page.locator("#previousWornMonths").fill("36");
    await page.getByRole("radio", { name: "No", exact: true }).click();
    assert.equal(await page.locator("#previousRxFields").isVisible(), false);
    await page.getByRole("radio", { name: "Yes", exact: true }).click();
    assert.equal(await page.locator("#odPrevSph").inputValue(), "1.00");

    // mm validation catches a cm-sized entry, and 330 mm reaches the engine as 33 cm.
    await page.locator("#nearWd").fill("33");
    await page.locator("#primaryAction").click();
    assert.equal(await page.locator("body").getAttribute("data-stage"), "measure");
    assert.match(await page.locator("#toast").innerText(), /250–1000 mm/);
    await page.locator("#nearWd").fill("150");
    await page.locator("#primaryAction").click();
    assert.match(await page.locator("#toast").innerText(), /250–1000 mm/, "a 15 cm working distance is rejected, not capped");
    await page.locator("#nearWd").fill("330");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "mobile has no horizontal overflow");
    if (process.env.DIOPTRA_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.DIOPTRA_SCREENSHOT_DIR, { recursive: true });
      await page.waitForFunction(() => !document.querySelector("#toast").classList.contains("show"));
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(process.env.DIOPTRA_SCREENSHOT_DIR, "dioptra-candidate-mobile.png"), fullPage: true });
    }
    await page.locator("#primaryAction").click();
    assert.match(await page.locator("#lockedDetail").innerText(), /Beryl 1\.0/);
    assert.equal(await page.locator("#agreementScore").count(), 0, "no post-exam score before final Rx");
    for (const eye of ["od", "os"]) {
      await page.locator(`#${eye}FinSph`).selectOption("2.75");
      await page.locator(`#${eye}FinCyl`).selectOption("1.25");
      await page.locator(`#${eye}FinAx`).selectOption("178");
    }
    // Checks, per-eye ADD and an endpoint that differs from the prescribed Rx.
    await page.locator("#finalAdd").selectOption("1.75");
    await page.locator("label.switch").click();
    assert.equal(await page.locator("#finalAddOsRow").isVisible(), true);
    assert.equal(await page.locator("#finalAddLabel").innerText(), "ADD · OD");
    await page.locator("#finalAddOs").selectOption("2.00");
    await page.locator("#finalVaOd").selectOption("20/20");
    await page.locator("#finalVaOs").selectOption("20/25");
    await page.locator("#finalVaOu").selectOption("20/20");
    await page.getByRole("radio", { name: "Holds line", exact: true }).click();
    await page.getByRole("radio", { name: "Different", exact: true }).click();
    assert.equal(await page.locator("#endpointFields").isVisible(), true);
    await page.locator("#primaryAction").click();
    assert.equal(await page.locator("body").getAttribute("data-stage"), "refract");
    assert.match(await page.locator("#toast").innerText(), /refraction endpoint for the right eye/);
    for (const eye of ["od", "os"]) {
      await page.locator(`#${eye}EndSph`).selectOption("2.50");
      await page.locator(`#${eye}EndCyl`).selectOption("1.25");
      await page.locator(`#${eye}EndAx`).selectOption("178");
    }
    await page.locator("#primaryAction").click();
    assert.match(await page.locator("#toast").innerText(), /why the prescribed Rx differs/);
    await page.locator("label:has([data-reason=adaptation_large_change])").click();
    await page.locator("#primaryAction").click();
    assert.equal(await page.locator("body").getAttribute("data-stage"), "compare");
    assert.match(await page.locator("#comparisonContent").innerText(), /Right eye · Beryl 1\.0/i);
    assert.match(await page.locator("#comparisonContent").innerText(), /Holds the line · possible extra minus/);
    assert.match(await page.locator("#comparisonContent").innerText(), /OD prescribed − endpoint SE\s+−0\.25 D/);
    assert.match(await page.locator("#comparisonContent").innerText(), /New flashes or floaters were reported/);
    assert.match(await page.locator("#agreementScore").innerText(), /% · \d\/6 checks/);
    assert.match(await page.locator("#comparisonContent").innerText(), /36 months/);
    assert.match(await page.locator("#comparisonContent").innerText(), /not clinical confidence/i);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `RC agreement overflows at ${width}`);
      if (process.env.DIOPTRA_SCREENSHOT_DIR && width !== 320) {
        await page.locator("#compareSection").evaluate(el => el.scrollIntoView({ behavior: "instant", block: "start" }));
        const scoreBox = await page.locator("#agreementScore").boundingBox();
        const navBox = await page.locator("#navbar").boundingBox();
        assert.ok(scoreBox.y >= navBox.y + navBox.height, "agreement must not hide under the fixed header");
        await page.screenshot({ path: path.join(process.env.DIOPTRA_SCREENSHOT_DIR, `rc-agreement-${width}.png`) });
      }
    }
    await page.locator("#primaryAction").click();
    const saved = await page.evaluate(() => DioptraStorage.listCases());
    assert.equal(saved.length, 2);
    assert.equal(JSON.stringify(saved[0]), historical, "historical record is untouched");
    const c = saved[1];
    assert.equal(c.schema, "dioptra-case-4");
    assert.equal(c.entryRevision, "v10-beryl-1");
    assert.equal(c.cohort, "v1.0-beryl-1");
    assert.equal(c.prediction.engine, "v1.0");
    assert.equal(c.prediction.name, "Beryl");
    assert.equal(c.input.vaCondition, "unaided");
    assert.equal(c.input.symptoms.glareHalos, true);
    assert.equal(c.input.symptoms.flashesFloaters, true);
    assert.equal(c.input.symptoms.flashes, undefined, "the ambiguous Flashes key is retired");
    assert.equal(c.actual.add, 1.75);
    assert.equal(c.actual.addOs, 2);
    assert.deepEqual(c.actual.checks, { va: { od: "20/20", os: "20/25", ou: "20/20" }, plusTest: "held" });
    assert.deepEqual(c.actual.endpoint.reasons, ["adaptation_large_change"]);
    assert.equal(c.actual.endpoint.od.sphere, -2.5);
    assert.equal(c.prediction.od.axis, 178);
    assert.equal(c.prediction.tentativeAdd, 1.75);
    assert.equal(c.shadow.prediction.version, "0.3.0");
    assert.equal(c.observations.near.workingDistanceCm, 33);
    assert.equal(c.observations.near.nearPointCm, 50);
    assert.equal(c.observations.instrument.vertexMm, 12, "refraction always records the fixed 12 mm vertex");
    assert.equal(c.input.previousRx.od.sphere, 1);
    assert.equal(c.input.previousRx.os.sphere, -1);
    assert.equal(c.input.previousRx.od.cylinder, 0);
    assert.equal(c.input.previousRx.add, 1.25);
    assert.equal(c.input.previousRx.wornMonths, 36);
    assert.equal(c.agreement.version, "rx-agreement-1");
    assert.equal(c.agreement.total, 6);
    assert.equal(await page.locator("#engineCompare tr").count(), 9);
    assert.doesNotMatch(await page.locator("#engineCompare").innerText(), /v0\.2/);
    assert.equal(c.input.od.va, "20/100");
    assert.equal(await page.locator("#previousRxFields").isVisible(), false);
    assert.equal(await page.locator("#nearWd").inputValue(), "");
    assert.equal(await page.locator("#previousWornMonths").inputValue(), "");
    assert.equal(await page.locator("#stats .stat strong").first().innerText(), "1");
    const csv = await page.evaluate(() => DioptraStorage.toShadowCSV(DioptraStorage.listCases()));
    const rows = csv.split("\n").map(r => r.split(","));
    const recordRow = rows.find(r => r[0] === c.caseId && r[4] === "v1.0" && r[5] === "od");
    for (const [field, value] of Object.entries({ near_wd_mm: "330", near_point_mm: "500", previous_sph: "1", previous_cyl: "0", previous_axis: "0", previous_add: "1.25", previous_rx_worn_months: "36", agreement_percent: String(c.agreement.percent), agreement_total: "6", cohort: "v1.0-beryl-1", record_schema: "dioptra-case-4",
      va_condition: "unaided", final_va: "20/20", final_va_ou: "20/20", plus_test: "held", final_add_os: "2", endpoint_differs: "true", endpoint_sph: "-2.5", endpoint_reasons: "adaptation_large_change", symptom_flashes_floaters: "true" })) {
      assert.equal(recordRow[rows[0].indexOf(field)], value, field);
    }

    // Stub OCR only; exercise the production parser and all import-to-form mappings.
    await page.evaluate(() => {
      DioptraTicketScan.scanImage = async () => DioptraTicketScan.parseTicketText("<R>\n-2.37 -1.12 178 9\n<-2.37 -1.12 178>\n<L>\n+1.37 -0.62 168 9\n<+1.37 -0.62 168>\nVD=8.0\nWD=40cm\nPD=62");
    });
    await page.locator("#odR2Sph").selectOption("4.00");
    await page.locator("#ticketImageInput").setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: Buffer.from("stubbed OCR") });
    await page.locator("#scanStatus").filter({ hasText: /Imported/ }).waitFor();
    assert.match(scannerDialogs.at(-1), /OD: -2\.37 \/ -1\.12 \/ 178° · 1\/3 repeats/);
    assert.match(scannerDialogs.at(-1), /PD: distance 62 mm · near not recognized/);
    assert.doesNotMatch(scannerDialogs.at(-1), /\\n/, "scanner confirmation uses real line breaks");
    assert.equal(await page.locator("#odSelSph").inputValue(), "2.37");
    assert.equal(await page.locator("#odSelCyl").inputValue(), "1.12");
    assert.equal(await page.locator("#osSelSph").getAttribute("data-sign"), "1");
    assert.equal(await page.locator("#odR1Q").inputValue(), "9");
    assert.equal(await page.locator("#odR2Sph").inputValue(), "", "unrecognized repeat rows do not retain stale values");
    assert.equal(await page.locator("#nearWd").inputValue(), "400");
    acceptScannerImport = false;
    await page.evaluate(() => {
      DioptraTicketScan.scanImage = async () => DioptraTicketScan.parseTicketText("<R>\n-9.00 -1.00 90 9\n<-9.00 -1.00 90>\n<L>\n-8.00 -2.00 80 9\n<-8.00 -2.00 80>");
    });
    await page.locator("#ticketImageInput").setInputFiles({ name: "cancelled.png", mimeType: "image/png", buffer: Buffer.from("stubbed OCR") });
    await page.locator("#scanStatus").filter({ hasText: /Cancelled/ }).waitFor();
    assert.equal(await page.locator("#odSelSph").inputValue(), "2.37", "cancelled scan leaves the form untouched");
    acceptScannerImport = true;
    await page.evaluate(() => {
      DioptraTicketScan.scanImage = async () => DioptraTicketScan.parseTicketText("<R>\n-7.00 -1.00 90 9\n<-7.00 -1.00 90>");
    });
    await page.locator("#ticketImageInput").setInputFiles({ name: "incomplete.png", mimeType: "image/png", buffer: Buffer.from("stubbed OCR") });
    await page.locator("#scanStatus").filter({ hasText: /Scan failed/ }).waitFor();
    assert.equal(await page.locator("#odSelSph").inputValue(), "2.37", "one-eye scans never partially overwrite the form");
    await page.locator("#age").fill("30");
    await page.getByRole("radio", { name: "Yes", exact: true }).click();
    await page.locator("#odPrevSph").selectOption("4.00");
    await page.locator("#previousWornMonths").fill("48");
    await page.getByRole("radio", { name: "No", exact: true }).click();
    await page.locator("#primaryAction").click();
    for (const eye of ["od", "os"]) await page.locator(`#${eye}FinSph`).selectOption("0.00");
    await page.locator("#primaryAction").click();
    await page.locator("#primaryAction").click();
    const scanned = await page.evaluate(() => DioptraStorage.listCases().at(-1));
    assert.equal(scanned.input.previousRx, null, "hidden stale previous Rx is excluded");
    assert.equal(scanned.input.od.sphere, -2.37, "scan is not rounded by dropdown");
    assert.equal(scanned.input.os.sphere, 1.37);
    assert.equal(scanned.observations.near.workingDistanceCm, 40);
    assert.equal(scanned.observations.near.nearPointCm, null);
    assert.equal(scanned.observations.instrument.vertexMm, 12, "ticket VD cannot override the fixed refraction vertex");

    // Tools are a separate workspace, not a shortcut around the blinded case flow.
    const beforeTools = await page.evaluate(() => JSON.stringify(DioptraStorage.listCases()));
    await page.locator("#age").fill("44");
    await page.locator("#geniusTab").click();
    assert.equal(await page.locator("#casePanel").isVisible(), false);
    assert.equal(await page.locator("#actionBar").isVisible(), false);
    assert.equal(await page.locator("#caseActions").isVisible(), false);
    assert.equal(await page.locator("#geniusPanel h1").innerText(), "Genius");
    assert.match(await page.locator("#geniusPanel .title-sub").innerText(), /^Guided refraction · development preview\.$/);
    const geniusSubmit = () => page.locator("#geniusForm button[type=submit]").click();
    await geniusSubmit();
    assert.match(await page.locator("#geniusError").innerText(), /age from 1 to 120/i);
    await page.locator("#geniusAge").fill("42");

    // Warning signs and age stop Genius before any proposal.
    await page.locator("label:has(#geniusFlashes)").click();
    await geniusSubmit();
    assert.equal(await page.locator("#geniusStop").isVisible(), true);
    assert.equal(await page.locator("#geniusResults").isVisible(), false);
    assert.match(await page.locator("#geniusStopReason").innerText(), /new flashes or floaters/);
    await page.locator("label:has(#geniusFlashes)").click();
    assert.equal(await page.locator("#geniusStop").isVisible(), false, "editing clears the stop");
    await page.locator("#geniusAge").fill("16");
    await geniusSubmit();
    assert.match(await page.locator("#geniusStopReason").innerText(), /for adults/);
    await page.locator("#geniusAge").fill("42");

    // Current glasses are required context; a large change is flagged per eye.
    await geniusSubmit();
    assert.match(await page.locator("#geniusError").innerText(), /wears glasses/);
    await page.getByRole("radio", { name: "Wears glasses", exact: true }).click();
    assert.equal(await page.locator("#geniusGlassesFields").isVisible(), true);
    await geniusSubmit();
    assert.match(await page.locator("#geniusError").innerText(), /current glasses for the right eye/);
    await page.locator("#geniusOdPrevSph").selectOption("1.00");
    await page.locator("#geniusOsPrevSph").selectOption("0.75");
    await page.getByRole("button", { name: "Toggle OS current glasses sphere sign" }).click();
    assert.equal(await page.locator("#geniusOdPrevAx").inputValue(), "0", "blank cylinder is sphere only");
    await geniusSubmit();
    assert.match(await page.locator("#geniusError").innerText(), /bracketed/);
    for (const [id, value] of Object.entries({ geniusOdSelSph: "2.00", geniusOdSelCyl: "1.00", geniusOdSelAx: "180", geniusOsSelSph: "1.00", geniusOsSelCyl: "0.50", geniusOsSelAx: "90" })) {
      await page.locator(`#${id}`).selectOption(value);
    }
    await page.getByRole("button", { name: "Toggle OS selected sphere sign" }).click();
    for (const id of ["geniusDiabetes", "geniusPregnancy", "geniusBlurredVision", "geniusGlare"]) await page.locator(`label:has(#${id})`).click();
    await page.locator("#geniusOtherSymptoms").fill("Halos");
    await geniusSubmit();
    assert.equal(await page.locator("#geniusResults").isVisible(), true, await page.locator("#geniusError").innerText());
    assert.match(await page.locator("#geniusVersion").textContent(), /v0\.3\.0 · prior offset/);
    assert.equal(await page.locator("#geniusOdResult").innerText(), "−2.25 −1.00 × 180°");
    assert.equal(await page.locator("#geniusOsResult").innerText(), "+0.75 −0.50 × 090°");
    assert.equal(await page.locator("#geniusAddResult").innerText(), "+0.75 D");
    const geniusFlags = await page.locator("#geniusFlags").innerText();
    for (const text of [/Large change from current glasses · OD/, /Refraction may fluctuate/, /Check the ADD at near/, /Repeat readings not entered/]) assert.match(geniusFlags, text);
    assert.doesNotMatch(geniusFlags, /Development preview/, "the preview's watermark, badge and callout carry the warning");
    assert.doesNotMatch(geniusFlags, /Large change from current glasses · OS/);
    assert.doesNotMatch(geniusFlags, /First glasses/);
    assert.equal(await page.locator("#geniusPrescription").isVisible(), false, "no preview before verification");

    // Verification in a trial frame is required before the preview.
    const preview = () => page.locator("#geniusPreview").click();
    await preview();
    assert.match(await page.locator("#geniusVerifyError").innerText(), /VA each eye/);
    await page.locator("#geniusVaOd").selectOption("20/20");
    await page.locator("#geniusVaOs").selectOption("20/25");
    assert.equal(await page.locator("#geniusNearRow").isVisible(), true, "near check appears when there is an ADD");
    await preview();
    assert.match(await page.locator("#geniusVerifyError").innerText(), /near vision/);
    await page.getByRole("radio", { name: "Comfortable", exact: true }).click();
    await preview();
    assert.match(await page.locator("#geniusVerifyError").innerText(), /accepted or refined/);
    await page.getByRole("radio", { name: "Refined", exact: true }).click();
    assert.equal(await page.locator("#geniusRefineFields").isVisible(), true);
    assert.equal(await page.locator("#geniusOdRefSph").inputValue(), "2.25", "refinement starts from the proposal");
    assert.equal(await page.locator("#geniusRefAdd").inputValue(), "0.75");
    await page.locator("#geniusOdRefSph").selectOption("2.00");
    await page.getByRole("radio", { name: "Holds line", exact: true }).click();
    await preview();
    assert.equal(await page.locator("#geniusPrescription").isVisible(), true, await page.locator("#geniusVerifyError").innerText());
    for (const [id, value] of Object.entries({
      geniusPrescriptionSphereOd: "−2.00", geniusPrescriptionCylinderOd: "−1.00", geniusPrescriptionAxisOd: "180°",
      geniusPrescriptionSphereOs: "+0.75", geniusPrescriptionCylinderOs: "−0.50", geniusPrescriptionAxisOs: "090°",
      geniusPrescriptionAdd: "+0.75 D", geniusPrescriptionPd: "Not measured", geniusPrescriptionVa: "OD 20/20 · OS 20/25",
      geniusPrescriptionAge: "42 years", geniusPrescriptionMedical: "Diabetes, Pregnancy", geniusPrescriptionSymptoms: "Blurred vision, Glare / halos, Halos"
    })) assert.equal(await page.locator(`#${id}`).innerText(), value, id);
    assert.match(await page.locator("#geniusPrescriptionOutcome").innerText(), /Refined in a trial frame · near comfortable · \+0\.25 D holds the line/);
    assert.match(await page.locator("#geniusPrescriptionVersion").innerText(), /^Oculi Model · proposed OD −2\.25 −1\.00 × 180°/);
    assert.equal(await page.locator("#geniusSignatory").innerText(), "Valeria Luxe");
    assert.equal(await page.locator("#geniusLicence").innerText(), "Pending certification");
    assert.doesNotMatch(await page.locator("#geniusPrescription").innerText(), /research prototype/i);
    assert.match(await page.locator("#geniusPrescriptionFlags").innerText(), /Large change from current glasses · OD/);
    assert.match(await page.locator("#geniusPrescription").innerText(), /not a prescription/i);
    await page.locator("#geniusPatientName").fill("Preview patient");
    await page.locator("#geniusPrescriptionNotes").fill("Test output only");
    await page.evaluate(() => { window.__geniusPrintCalls = 0; window.print = () => { window.__geniusPrintCalls += 1; }; });
    await page.locator("#geniusPrint").click();
    assert.equal(await page.evaluate(() => window.__geniusPrintCalls), 1, "Genius export opens the system print dialog");
    assert.equal(await page.locator("#geniusPatientNamePrint").innerText(), "Preview patient");
    assert.equal(await page.locator("#geniusPrescriptionNotesPrint").innerText(), "Test output only");
    assert.equal(await page.evaluate(() => JSON.stringify(DioptraStorage.listCases())), beforeTools, "Genius never writes study cases");
    await page.setViewportSize({ width: 320, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Genius has no mobile overflow");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator("#geniusVaOs").selectOption("20/20");
    assert.equal(await page.locator("#geniusPrescription").isVisible(), false, "verification edits hide a stale preview");
    await page.locator("#geniusAge").fill("43");
    assert.equal(await page.locator("#geniusResults").isVisible(), false, "editing removes stale Genius output");

    // The ticket scanner fills Genius's own tables, repeats included.
    await page.evaluate(() => {
      DioptraTicketScan.scanImage = async () => DioptraTicketScan.parseTicketText("<R>\n-2.37 -1.12 178 9\n-2.50 -1.00 178 8\n<-2.37 -1.12 178>\n<L>\n+1.37 -0.62 168 9\n<+1.37 -0.62 168>\nPD=62");
    });
    const clinicalBeforeScan = await page.locator("#odSelSph").inputValue();
    await page.locator("#geniusTicketInput").setInputFiles({ name: "genius.png", mimeType: "image/png", buffer: Buffer.from("stubbed OCR") });
    await page.locator("#geniusScanStatus").filter({ hasText: /Imported/ }).waitFor();
    assert.equal(await page.locator("#geniusOdSelSph").inputValue(), "2.37");
    assert.equal(await page.locator("#geniusOdR2Sph").inputValue(), "2.50");
    assert.equal(await page.locator("#geniusOdR1Q").inputValue(), "9");
    assert.equal(await page.locator("#geniusOsSelSph").getAttribute("data-sign"), "1");
    assert.equal(await page.locator("#geniusPdDistance").inputValue(), "62");
    assert.equal(await page.locator("#odSelSph").inputValue(), clinicalBeforeScan, "Genius scans never touch the Clinical Study form");
    await page.locator("#geniusReset").click();
    assert.equal(await page.locator("#geniusAge").inputValue(), "");
    assert.equal(await page.locator("#geniusGlassesFields").isVisible(), false);
    await page.locator("#calculatorTab").click();
    assert.equal(await page.locator("#casePanel").isVisible(), false);
    assert.equal(await page.locator("#actionBar").isVisible(), false);
    assert.equal(await page.locator("#caseActions").isVisible(), false);
    assert.deepEqual(await page.locator(".calculator-tabs [role=tab]").allTextContents(), ["Vertex", "Spherical Equivalent", "Transposition"]);
    assert.equal(await page.locator("#conversionControls").isVisible(), true);
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.match(await page.locator("#calculatorError").innerText(), /Enter sphere/);
    for (const [id, value] of Object.entries({ calcSphere: "-1.50", calcCylinder: "-1.25", calcAxis: "180" })) await page.locator(`#${id}`).fill(value);
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.equal(await page.locator('[data-calculator-result="conversion"]').first().isVisible(), true);
    assert.equal(await page.locator('[data-calculator-result="transpose"]').first().isVisible(), false);
    assert.equal(await page.locator('[data-calculator-result="se"]').first().isVisible(), false);
    await page.locator("#calculatorSeTab").click();
    assert.equal(await page.locator("#conversionControls").isVisible(), false);
    assert.equal(await page.locator("#vertexControls").isVisible(), false);
    assert.equal(await page.locator("#calculatorResults").isVisible(), false, "tool changes remove stale outputs");
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.equal(await page.locator('[data-calculator-result="se"]').first().isVisible(), true);
    assert.equal(await page.locator("#calcSE").innerText(), "−2.00 D");
    assert.match(await page.locator("#calculatorMath").textContent(), /−2\.125 D/);
    await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { window.copiedText = text; } } }); });
    await page.locator("#copySE").click();
    assert.equal(await page.evaluate(() => window.copiedText), "-2.00 D");
    await page.locator("#calculatorTransposeTab").click();
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.equal(await page.locator("#calcTransposed").innerText(), "−2.75 +1.25 × 090°");
    await page.locator("#useTransposed").click();
    assert.equal(await page.locator("#calcSphere").inputValue(), "-2.75");
    assert.equal(await page.locator("#calcTransposed").innerText(), "−1.50 −1.25 × 180°");
    await page.locator("#calcAxis").fill("181");
    assert.equal(await page.locator("#calculatorResults").isVisible(), false, "editing removes stale outputs");
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.match(await page.locator("#calculatorError").innerText(), /1° to 180°/);
    await page.locator(".calculator-paste summary").click();
    await page.locator("#calculatorPaste").fill("−2,00 +3,00 × 90");
    await page.locator("#calculatorPasteForm button").click();
    assert.equal(await page.locator("#calcTransposed").innerText(), "+1.00 −3.00 × 180°");
    await page.locator("#calculatorPaste").fill("1 2 x999");
    await page.locator("#calculatorPasteForm button").click();
    assert.match(await page.locator("#calculatorPasteError").innerText(), /1° to 180°/);
    assert.equal(await page.locator("#calcSphere").inputValue(), "-2.00", "invalid paste never partially applies");
    await page.locator("#calculatorSeTab").click();
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.equal(await page.locator("#calcSE").innerText(), "−0.50 D");
    await page.locator("#copySE").click();
    assert.equal(await page.evaluate(() => window.copiedText), "-0.50 D");
    await page.locator("#calculatorTransposeTab").click();
    await page.locator("#calculatorForm button[type=submit]").click();
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error("Denied"); }; });
    await page.locator("#copyTransposed").click();
    await page.locator("#calculatorStatus").filter({ hasText: /Clipboard unavailable/ }).waitFor();
    await page.locator("#calculatorTab").focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(await page.locator("#geniusTab").getAttribute("aria-selected"), "true");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await page.locator("#caseTab").getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("#age").inputValue(), "44");
    await page.locator("#newCaseBtn").click();
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await page.locator("#caseTab").focus();
    await page.keyboard.press("End");
    assert.equal(await page.locator("#calcSphere").inputValue(), "-2.00", "case reset preserves calculator inputs");
    assert.equal(await page.locator("#calcSE").innerText(), "−0.50 D");

    await page.locator("#calculatorConversionTab").click();
    await page.locator("#calculatorForm button[type=submit]").click();
    await page.locator("#calcSphereOs").fill("6");
    await page.locator("#calcCylinderOs").fill("0");
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.equal(await page.locator("#calcVertexOs").innerText(), "+6.47 DS");
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${colorScheme} calculator overflow at ${width}`);
        if (process.env.DIOPTRA_SCREENSHOT_DIR && width !== 320) {
          await page.locator(".calculator-paste summary").evaluate(el => { el.parentElement.open = false; });
          await page.screenshot({ path: path.join(process.env.DIOPTRA_SCREENSHOT_DIR, `calculator-${colorScheme}-${width}.png`), fullPage: true });
        }
      }
    }
    await page.locator("#calcSphere").fill("-10");
    await page.locator("#calcCylinder").fill("0");
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.equal(await page.locator("#calcVertex").innerText(), "−8.93 DS");
    assert.match(await page.locator("#calcVertexPlanes").innerText(), /12 mm → 0 mm/);
    assert.equal(await page.locator("#vertexAlreadyHint").count(), 0, "over-explanatory calculator copy was removed");
    assert.equal(await page.locator("#calcToVertex").getAttribute("readonly"), "");
    await page.evaluate(() => { navigator.clipboard.writeText = async text => { window.copiedText = text; }; });
    await page.locator("#copyBothVertex").click();
    assert.match(await page.evaluate(() => window.copiedText), /Right eye · OD: -8.93 DS\nLeft eye · OS: \+6.47 DS/);
    await page.locator("#calcConversion").selectOption("contactsToSpectacles");
    assert.equal(await page.locator("#calculatorResults").isVisible(), false);
    assert.equal(await page.locator("#calcFromVertex").inputValue(), "0");
    assert.equal(await page.locator("#calcFromVertex").getAttribute("readonly"), "");
    assert.equal(await page.locator("#calcToVertex").inputValue(), "12");
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.equal(await page.locator("#calcVertex").innerText(), "−11.36 DS");
    assert.equal(await page.locator("#calcVertexOs").innerText(), "+5.60 DS");
    assert.match(await page.locator("#calcVertexTitle").innerText(), /Spectacle-plane/i);
    await page.locator("#calcConversion").selectOption("custom");
    await page.locator("#calcFromVertex").fill("0");
    assert.equal(await page.locator("#calculatorResults").isVisible(), false);
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.equal(await page.locator("#calcVertex").innerText(), "−10.00 DS");
    assert.match(await page.locator("#calcVertexContext").innerText(), /no compensation/i);
    await page.locator("#calcToVertex").fill("12");
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.equal(await page.locator("#calcVertex").innerText(), "−11.36 DS");
    await page.locator("#calcToVertex").fill("26");
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.match(await page.locator("#calculatorError").innerText(), /0 to 25 mm/);
    assert.equal(await page.locator("#calculatorResults").isVisible(), false);
    await page.locator("#calcAxisOs").fill("181");
    await page.locator("#calcCylinderOs").fill("-1");
    await page.locator("#calcToVertex").fill("12");
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.match(await page.locator("#calculatorError").innerText(), /Left eye · OS:.*1° to 180°/);
    assert.equal(await page.locator("#calculatorResults").isVisible(), false);
    await page.locator("#calculatorReset").click();
    assert.equal(await page.locator("#calcConversion").inputValue(), "spectaclesToContacts");
    assert.equal(await page.locator("#calcSphereOs").inputValue(), "");
    // OS-only, toric second meridian above 4 D and no automatic spherical-equivalent substitution.
    await page.locator("#calcSphereOs").fill("-2.75");
    await page.locator("#calcCylinderOs").fill("-2");
    await page.locator("#calcAxisOs").fill("180");
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.equal(await page.locator("#calcEyeResults").isVisible(), false);
    assert.equal(await page.locator("#calcVertexOs").innerText(), "−2.66 −1.83 × 180°");
    assert.match(await page.locator("#calcVertexContextOs").innerText(), /At least one principal meridian/);
    await page.locator("#calculatorTransposeTab").click();
    await page.locator("#calculatorForm button[type=submit]").click();
    await page.locator("#useTransposedOs").click();
    assert.equal(await page.locator("#calcSphereOs").inputValue(), "-4.75");
    await page.locator("#calculatorReset").click();
    assert.equal(await page.locator("#calcFromVertex").inputValue(), "12");
    assert.equal(await page.locator("#calcToVertex").inputValue(), "0");
    assert.equal(await page.locator("#calcSphere").inputValue(), "");
    assert.equal(await page.locator("#calculatorResults").isVisible(), false);
    await page.locator("#calcSphere").fill("1.13");
    await page.locator("#calcCylinder").fill("0");
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.equal(await page.locator("#calcTransposed").innerText(), "+1.13 DS");
    await page.locator("#calculatorSeTab").click();
    await page.locator("#calculatorForm button[type=submit]").click();
    assert.equal(await page.locator("#calcSE").innerText(), "+1.25 D");
    assert.equal(await page.evaluate(() => JSON.stringify(DioptraStorage.listCases())), beforeTools);
    await page.locator("#caseTab").click();
    await page.locator("#age").fill("44");
    for (const eye of ["od", "os"]) {
      await page.locator(`#${eye}SelSph`).selectOption("1.00");
      await page.locator(`#${eye}SelCyl`).selectOption("0.00");
      assert.equal(await page.locator(`#${eye}SelAx`).inputValue(), "0");
      assert.equal(await page.locator(`#${eye}SelAx`).isDisabled(), true);
    }
    // Axis transitions never leave a meaningless 0° on a nonzero cylinder.
    await page.locator("#odSelCyl").selectOption("0.25");
    assert.equal(await page.locator("#odSelAx").isEnabled(), true);
    assert.equal(await page.locator("#odSelAx").inputValue(), "");
    await page.locator("#primaryAction").click();
    assert.equal(await page.locator("body").getAttribute("data-stage"), "measure");
    await page.locator("#odSelAx").selectOption("180");
    await page.locator("#odSelCyl").selectOption("0.00");
    assert.equal(await page.locator("#odSelAx").inputValue(), "0");
    await page.locator("#odSelCyl").selectOption("");
    assert.equal(await page.locator("#odSelAx").isEnabled(), true);
    assert.equal(await page.locator("#odSelAx").inputValue(), "");
    await page.locator("#odSelCyl").selectOption("0.00");
    for (const suffix of ["Od", "Os"]) {
      await page.locator(`#va${suffix}`).selectOption("20/40");
      await page.locator(`#ph${suffix}`).selectOption("20/25");
      await page.locator(`#va${suffix}`).selectOption("20/20");
      assert.equal(await page.locator(`#ph${suffix}`).inputValue(), "");
      assert.equal(await page.locator(`#ph${suffix}`).isDisabled(), true);
      await page.locator(`#va${suffix}`).selectOption("20/15");
      assert.equal(await page.locator(`#ph${suffix}`).isDisabled(), true);
      await page.locator(`#va${suffix}`).selectOption("");
      assert.equal(await page.locator(`#ph${suffix}`).isEnabled(), true);
      assert.equal(await page.locator(`#ph${suffix}`).inputValue(), "");
      await page.locator(`#va${suffix}`).selectOption("20/40");
      await page.locator(`#ph${suffix}`).selectOption("20/20");
    }
    await page.locator("#vaOd").selectOption("20/20");
    assert.equal(await page.locator("#phOs").inputValue(), "20/20", "VA rule is per eye");
    await page.getByRole("radio", { name: "With correction", exact: true }).click();
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme });
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
          elements: [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().right > innerWidth + 1).map(e => ({ tag: e.tagName, id: e.id, cls: e.className, right: e.getBoundingClientRect().right })).slice(0, 15) }));
        assert.ok(overflow.scroll <= width, `${colorScheme} refraction overflow at ${width}: ${JSON.stringify(overflow)}`);
      }
      if (process.env.DIOPTRA_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.DIOPTRA_SCREENSHOT_DIR, `refraction-${colorScheme}-1280.png`), fullPage: true });
    }
    await page.locator("#primaryAction").click();
    assert.equal(await page.locator("body").getAttribute("data-stage"), "refract", await page.locator("#toast").innerText());
    await page.locator("#calculatorTab").click();
    await page.locator("#caseTab").click();
    assert.equal(await page.locator("body").getAttribute("data-stage"), "refract");
    assert.equal(await page.locator("#comparisonContent").innerHTML(), "", "tab switch never reveals the locked prediction");
    for (const eye of ["od", "os"]) {
      await page.locator(`#${eye}FinSph`).selectOption("1.00");
      assert.equal(await page.locator(`#${eye}FinAx`).inputValue(), "0", "blank optional cylinder means sphere only");
      await page.locator(`#${eye}FinCyl`).selectOption("0.25");
      assert.equal(await page.locator(`#${eye}FinAx`).isEnabled(), true);
      await page.locator(`#${eye}FinAx`).selectOption("90");
      await page.locator(`#${eye}FinCyl`).selectOption("0.00");
      assert.equal(await page.locator(`#${eye}FinAx`).inputValue(), "0");
    }
    await page.locator("#primaryAction").click();
    assert.equal(await page.locator("body").getAttribute("data-stage"), "compare");
    await page.locator("#primaryAction").click();
    const zeroCase = await page.evaluate(() => DioptraStorage.listCases().at(-1));
    assert.equal(zeroCase.entryRevision, "v10-beryl-1");
    assert.equal(zeroCase.agreement.total, 4, "sphere-only axes are excluded, not free passes");
    assert.equal(zeroCase.input.od.pinhole, "");
    assert.equal(zeroCase.input.os.pinhole, "20/20");
    for (const eye of ["od", "os"]) {
      for (const rx of [zeroCase.input[eye], zeroCase.actual[eye], zeroCase.prediction[eye], zeroCase.shadow.prediction[eye], ...Object.values(zeroCase.prediction[eye].candidates)]) {
        assert.equal(rx.axis, 0);
      }
      assert.equal(await page.locator(`#${eye}SelAx`).isEnabled(), true);
      assert.equal(await page.locator(`#${eye}SelAx`).inputValue(), "");
    }
    assert.equal(await page.locator("#phOd").isEnabled(), true);
    assert.equal(await page.evaluate(() => JSON.stringify(DioptraStorage.listCases()[0])), historical);
    const zeroCSV = await page.evaluate(() => DioptraStorage.toShadowCSV([DioptraStorage.listCases().at(-1)]));
    const zeroRows = zeroCSV.split("\n").map(r => r.split(","));
    for (const row of zeroRows.slice(1).filter(r => r.length > 1)) {
      for (const field of ["ar_sel_axis", "pred_axis", "final_axis"]) assert.equal(row[zeroRows[0].indexOf(field)], "0");
      assert.equal(row[zeroRows[0].indexOf("axis_error")], "", "sphere-only axis is not scored");
    }
    // Scanner imports obey the same rule, including repeated readings.
    await page.evaluate(() => {
      DioptraTicketScan.scanImage = async () => DioptraTicketScan.parseTicketText("<R>\n+0.25 -0.00 180 9\n<+0.25 -0.00 180>\n<L>\n+0.25 -0.25 115 9\n<+0.25 -0.25 115>");
    });
    await page.locator("#ticketImageInput").setInputFiles({ name: "zero.png", mimeType: "image/png", buffer: Buffer.from("stubbed OCR") });
    await page.locator("#scanStatus").filter({ hasText: /Imported/ }).waitFor();
    for (const prefix of ["odR1", "odSel"]) {
      assert.equal(await page.locator(`#${prefix}Ax`).inputValue(), "0");
      assert.equal(await page.locator(`#${prefix}Ax`).isDisabled(), true);
    }
    assert.equal(await page.locator("#osSelAx").inputValue(), "115");
    assert.equal(await page.locator("#osSelAx").isEnabled(), true);
    assert.equal(await page.locator("#odR2Ax").inputValue(), "", "unused repeat stays empty");
    assert.deepEqual(errors, []);
    console.log("PASS: Beryl case form, VA condition, checks, endpoint and per-eye ADD, cohort isolation, previous Rx, mm conversion, exports, scan import, Genius screening, verification and print, calculators, tab isolation, keyboard navigation, light/dark mobile layouts");
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
