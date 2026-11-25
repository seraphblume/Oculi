# Oculi

Refraction, focused.

Oculi brings clinical comparison and essential prescription tools into one calm, private workspace. It is designed to keep each task clear, preserve the clinician’s independent judgment, and keep case data on the device.

## Four focused spaces

### Clinical Study

A blinded comparison workflow for structured research.

1. **Measure.** In the same order as Genius: patient, history, visual acuity (unaided or with correction; pinhole only for an eye below 20/25), then the initial refraction: previous Rx, autorefractor ticket, near and keratometry.
2. **Refract.** Complete your own exam without seeing Oculi's prediction. Record the final Rx, the final VA, the +0.25 D test, and the endpoint whenever the prescribed Rx differs from it.
3. **Compare.** Reveal the prediction, rate it 1–5 against what you would prescribe, and save the case.

**Follow-ups.** The Study section lists saved cases waiting for a follow-up. One to four weeks after the exam, record how the glasses are going (tolerated, minor symptoms, not tolerated, not worn, glasses not made, no contact), what was done, and how you asked. The rating and the follow-up are the two outcomes Goshenite will learn from; neither is ever an input to a prediction.

The active base engine is **Beryl v1.1**, which preserves the v0.3.0 rules. **Heliodor v1.0** preserves the former Beryl v1.0 rules as a paired comparator. Refraction uses a fixed 12 mm vertex. Repeat readings, previous prescription, keratometry, near measurements and review flags stay available without crowding the main flow.

### Genius

A visual assessment followed by a guided refraction preview. The assessment follows the paper *Evaluación visual 3.0*:

- **Patient.** Name (never saved), age or birthdate (the age fills in), current glasses.
- **History.** Symptoms, medical background and warning signs.
- **1 · Visual acuity.** Distance and near, without and with glasses, for OD, OS and OU; pinhole for OD and OS.
- **2 · Initial refraction.** The current glasses from the lensometer and the autorefractor ticket, with near working distance and a distance and near PD per eye.
- **3 · Pre-diagnosis.** Myopia, hyperopia, astigmatism, presbyopia or no refractive error, ticked from the ticket and age; every box can be changed.
- **4 · Vision comparison.** The same letter chart, side by side, as seen through the current correction and through a full correction, rendered by ZL Retina (below). Distance or near, either eye.

The assessment works at any age, so a guardian can see a child's comparison. The Rx proposal that follows is for adults: **propose → verify → preview**.

- **Propose.** Any warning sign, or an age under 18, stops Genius here. The full autorefractor ticket runs through Beryl v1.1. Current glasses, symptoms and medical background become review notes, not dioptric changes.
- **Verify.** VA through the proposed Rx in a trial frame, near when there is an ADD, the +0.25 D test, then accepted or refined.
- **Card.** A 9 × 16 cm card that folds to 9 × 8 cm, after a lens certificate: the Rx with a PD per eye, the ADD and the lens type inside above the fold; verification, review notes, notes and signatures below it; a cover and adaptation advice outside. It is watermarked and is not a prescription. Save it as a two-page PDF or print it double-sided (flip on the long edge), then start the next patient with **New Patient**.

Genius is clearly marked as a development preview, and nothing entered there is saved.

#### ZL Retina

`js/zl-retina.js` is a line-for-line port of the studio's `zl_retina` 0.1.0 package: scalar diffraction through a 4 mm pupil, convolved in linear light. `tests/zl-retina.test.js` checks it against output from the Python package itself. The comparison renders off the main thread and is monochromatic, because the eye's chromatic fringes are real but not perceived. Young eyes are allowed to focus through hyperopia (Hofstetter's minimum amplitude, 15 − 0.25 × age); cylinder is never focused away. The full correction shown is Beryl's estimate before the exam. The picture illustrates focus only: it cannot show how a patient perceives, and says nothing about eye health.

### Demotools

Illustrations to show a patient at the counter. Nothing entered here is saved. Both names are placeholders.

- **True Vision.** Type the final Rx you found, and the current glasses if any, and see the same chart twice: as the patient sees it now and as the final Rx corrects it. Distance or near, either eye, any age. It uses the same ZL Retina rendering as Genius.
- **Frame/Lens Preview.** Two Rx edged into the same frame in polycarbonate (index 1.586, Abbe 30). Choose a shape (rectangle, oval, round, aviator or cat-eye) and enter A, B, DBL, the monocular PD and an optional fitting height. Each lens is drawn as you face the wearer, with its edge thickness to true scale, and comes with its figures: centre, thickest and thinnest edge, weight, base curve, and the colour fringing at 10 mm and at the edge.

#### ZL Thickness

`js/zl-thickness.js` is a line-for-line port of the lens geometry in the studio's `zl_thickness` 0.3.0 package: toric and aspheric sag, rim and centre thickness, volume and boxing decentration. `tests/zl-thickness.test.js` checks all 360 rim thicknesses, the centre, volume and mass against output from the Python package itself. The preview solves each back surface for the prescribed back-vertex power through the lens's own centre thickness. Front base curves follow Vogel's rule. Centre and edge are held to at least 1.0 mm. Colour fringing is Prentice prism divided by the Abbe number; about 0.10 Δ is where it starts to be noticed. Bevels, polishing and drill mounts are not modelled, so a lab's figures can differ by a few tenths of a millimetre.

### Tools

- **Vertex.** Convert between spectacle and contact-lens planes, including custom vertex distances.
- **Spherical Equivalent.** Calculate and copy the nearest quarter-dioptre value.
- **Transposition.** Switch cylinder notation without changing the optical prescription.

Right and left eyes can be entered together. Calculator work stays separate from patient cases and is not saved.

## Private by design

Case data stays in the browser on the current device. Oculi works without an account and can run offline after its first load.

Ticket scanning reads an autorefractor image in the browser. The image and patient name are not saved. Recognized values remain editable and should always be checked against the original ticket.

## Research status

Oculi is an experimental research prototype. It is not a validated medical device and must not be the sole basis for prescribing, dispensing, diagnosis, or treatment.

Beryl v1.1 is a release identity for the unchanged v0.3.0 rules. Heliodor v1.0 is a release identity for the former Beryl v1.0 rules. Historical records keep their original identities. **Version numbers and gemstone names are not validation claims.** Agreement scores describe differences within defined software tolerances; they are not clinical confidence scores.

Goshenite v1.0 is the planned flagship: a learned layer on Beryl v1.1, tuned on the optometrist's rating and the patient's tolerance at follow-up. Neither outcome existed in earlier exports, so Oculi now collects both; Goshenite stays untrained and outside the runtime engine registry until enough follow-ups are in. The outcome contract, training boundaries, prospective validation gates and naming lineage are documented in [`docs/engine-transition-2026-11-24.md`](docs/engine-transition-2026-11-24.md).

## Design

Oculi wears the ZepheniaLabs design system as applied in O(n!): three colours per theme (ground, ink, accent), IBM Plex Sans for words and Plex Mono for labels, square corners, hairline rules instead of boxes, ink blocks for actions, and no grey, shadow or bold. The theme follows the device in Zephyr until the viewer picks a palette (Zephyr, Boreas, Harukaze) and an appearance in About (tap **Oculi**). The coat lives in `css/coat.css` over the structural `css/app.css`; tokens, fonts and the glyph-field engine come from the ZLDesignSystem package:

```sh
node tools/sync-zl-design.js ~/ZepheniaLabs/Workspace/Packages/ZLDesignSystem
```

## Run Oculi

No build step is required. Serve the repository with any local web server, then open `index.html` through that server.

For example:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Verify changes

The test suite covers:
- the frozen engine contracts;
- historical Beryl v1.0 parity with the release candidate;
- Beryl v1.1 parity with v0.3.0 and Heliodor v1.0 parity with historical Beryl v1.0;
- the comparison engine;
- exports and offset fitting;
- ticket parsing;
- optical calculations;
- the PDF writer;
- ZL Retina parity with the Python package, and the comparison's defocus model;
- ZL Thickness parity with the Python package, and the Frame/Lens Preview geometry;
- the complete browser workflow, Genius included, with one-page print and PDF export;
- Demotools in light and dark, from 320 px to desktop.

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
node tests/lens-preview.test.js
node tests/app-flow.browser.js
node tests/genius-export.browser.js
node tests/demotools.browser.js
```

Continuous integration runs the same checks for every pull request.

## Learn more

Detailed research notes, engine behaviour, data definitions and source references are in [`docs/`](docs/).
