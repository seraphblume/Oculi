# Oculi

**Refraction, focused.**

Everything an eye exam needs, in one calm workspace. Measure, refract, compare and show your patient the difference, all in the browser and all on your device.

---

## Four spaces. One flow.

### Clinical Study
**Your judgment, measured.**

Run your exam blind, then reveal what Oculi predicted. Rate it, save the case, and follow up a few weeks later. Every case sharpens the engines that come next.

### Genius
**From first look to finished card.**

A guided visual assessment, from history and acuity to the autorefractor ticket and a suggested pre-diagnosis. Oculi proposes an Rx, you verify it in the trial frame, and the result becomes a folding 9 × 16 cm card, ready to print or save as a PDF.

### Showcase
**Let them see it.**

- **Clarity** puts the same chart side by side: how your patient sees today, and how their new prescription sees. Distance or near, at any age. Built for guardians and skeptics alike.
- **Lens Studio** draws the full frame twice, current pair on top and new pair below, both eyes at once. Pick a shape, enter the frame size and PD, and compare edge thickness, weight and colour fringing at a glance.

### Tools
**The essentials, always at hand.**

Vertex conversion, spherical equivalent and transposition for both eyes at once, ready to copy.

---

## Engines with names, not numbers.

**Beryl 1.1** drives every prediction.
**Heliodor 1.0** runs alongside it as a second opinion.
**Goshenite 1.0** is next: it learns from your ratings and your patients' comfort at follow-up.

---

## Real optics, right in the browser.

Clarity renders vision with **ZL Retina**, which models how light passes through a 4 mm pupil. Lens Studio shapes every lens with **ZL Thickness**, solved for the exact prescription in polycarbonate. Both are ports of ZepheniaLabs' own optics packages, checked against the originals.

---

## Private by design.

No account. No server. No upload. Cases stay in the browser on your device, ticket photos are read and discarded, and Oculi keeps working offline after its first visit.

---

## Designed by ZepheniaLabs.

Square corners, hairline rules, IBM Plex type, and three palettes (Zephyr, Boreas and Harukaze) in light or dark. Oculi follows your device until you choose a theme in About.

---

## Get started

Oculi needs no build step. Serve the folder and open it:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

<details>
<summary>For developers</summary>

**Structure.** Plain HTML, CSS and JavaScript, with a service worker for offline use. The design coat lives in `css/coat.css` over `css/app.css`. Tokens, fonts and the glyph field are synced from ZLDesignSystem:

```sh
node tools/sync-zl-design.js ~/ZepheniaLabs/Workspace/Packages/ZLDesignSystem
```

**Tests.** Continuous integration runs every check on each pull request:

```sh
node tests/v0.2-freeze.test.js
node tests/v0.3-engine.test.js
node tests/v0.4-rc.test.js
node tests/v1.0-beryl.test.js
node tests/engine-naming-transition.test.js
node tests/ticket-scan.test.js
node tests/export-and-fit.test.js
node tests/optical-calculators.test.js
node tests/pdf-lite.test.js
node tests/zl-retina.test.js
node tests/vision-compare.test.js
node tests/zl-thickness.test.js
node tests/lens-studio.test.js
node tests/app-flow.browser.js
node tests/genius-export.browser.js
node tests/showcase.browser.js
```

**Docs.** Engine behaviour, data definitions, research notes and sources are in [`docs/`](docs/).

</details>

---

<sub>Oculi is a research tool and not a medical device. Every result should be confirmed by an independent eye examination. Engine names and version numbers are not claims of clinical validation. Clarity illustrates focus only; it cannot show how a person perceives, and it says nothing about eye health. Lens Studio figures are estimates, and finished lenses can differ by a few tenths of a millimetre.</sub>

<sub>© ZepheniaLabs · De L’existence a L’existant</sub>
