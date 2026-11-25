# Oculi

Refraction, focused.

Oculi brings clinical comparison, guided refraction and patient-facing previews into one calm, private workspace. Case data stays on the device.

## Four spaces

### Clinical Study

A blinded comparison workflow for structured research.

1. **Measure.** Patient, history, visual acuity (pinhole only below 20/25), then the initial refraction: previous Rx, autorefractor ticket, near and keratometry.
2. **Refract.** Run your own exam without seeing the prediction. Record the final Rx, final VA, the +0.25 D test and, when it differs, the endpoint.
3. **Compare.** Reveal the prediction, rate it 1–5 and save the case.

**Follow-ups.** One to four weeks after the exam, record how the glasses are going and what was done. Your rating and the patient's tolerance are the two outcomes Goshenite learns from; neither ever changes a prediction.

The primary engine is **Beryl 1.1** (the v0.3.0 rules), compared against **Heliodor 1.0** (the former Beryl 1.0). Vertex is fixed at 12 mm.

### Genius

A visual assessment and guided refraction, following the paper *Evaluación visual 3.0*:

- **Patient.** Name (never saved), age or birthdate, current glasses.
- **History.** Symptoms, medical background and warning signs.
- **1 · Visual acuity.** Distance and near, with and without glasses; pinhole per eye.
- **2 · Initial refraction.** Lensometer, autorefractor ticket, near working distance and a PD per eye.
- **3 · Pre-diagnosis.** Suggested from the ticket and age; every box can be changed.
- **4 · Vision comparison.** The same chart side by side, through the current correction and through Beryl's estimate.

The assessment works at any age. The Rx proposal is for adults:

- **Propose.** A warning sign or an age under 18 stops here. Beryl 1.1 reads the full ticket; glasses, symptoms and history become review notes.
- **Verify.** VA through the proposed Rx in a trial frame, near with the ADD, the +0.25 D test, then accepted or refined.
- **Card.** A 9 × 16 cm folding card: the Rx, PD and lens type inside; verification, notes and signatures below the fold; a cover and adaptation advice outside. Save it as a PDF or print it double-sided. It is not a prescription.

Nothing in Genius is saved.

### Showcase

Previews to share with a patient at the counter. Nothing here is saved.

- **Clarity.** Enter the final Rx, and the current glasses if any, to see the same chart as the patient sees it now and as the new Rx corrects it. Distance or near, either eye, any age.
- **Lens Studio.** Two prescriptions edged into the same frame in polycarbonate. Choose a shape (rectangle, oval, round, aviator or cat-eye), A, B, DBL, the PD and an optional fitting height. Each lens is drawn as you face the wearer, edge thickness to scale, with its centre and edge thickness, weight, base curve and colour fringing.

### Tools

- **Vertex.** Convert between spectacle and contact-lens planes, including custom distances.
- **Spherical Equivalent.** Calculate and copy the nearest quarter dioptre.
- **Transposition.** Switch cylinder notation.

Both eyes can be entered together. Nothing here is saved.

## Optics

**ZL Retina.** `js/zl-retina.js` ports the studio's `zl_retina` 0.1.0: scalar diffraction through a 4 mm pupil, convolved in linear light, rendered off the main thread. It is monochromatic, since the eye doesn't perceive its own chromatic fringes. Young eyes may focus through hyperopia (Hofstetter's minimum amplitude, 15 − 0.25 × age); cylinder is never focused away. It illustrates focus only, not perception or eye health.

**ZL Thickness.** `js/zl-thickness.js` ports the lens geometry of `zl_thickness` 0.3.0: toric and aspheric sag, rim and centre thickness, volume and decentration. Lens Studio solves each back surface for the prescribed back-vertex power through the lens's own centre thickness, picks the front base curve by Vogel's rule, and holds centre and edge to at least 1.0 mm. Colour fringing is Prentice prism ÷ Abbe number, noticeable from about 0.10 Δ. Bevelling and mounting are not modelled, so a lab's figures can differ by a few tenths of a millimetre.

Both ports are checked against output from the Python packages.

## Private by design

Case data stays in the browser. Oculi needs no account and works offline after its first load. Ticket scanning runs in the browser; the image and patient name are never saved, and every recognised value stays editable.

## Research status

Oculi is a research tool, not a validated medical device, and must not be the sole basis for prescribing, dispensing, diagnosis or treatment.

Beryl 1.1 and Heliodor 1.0 are release names for unchanged rule sets; historical records keep their original identities. **Version numbers and gemstone names are not validation claims**, and agreement scores are software tolerances, not clinical confidence.

Goshenite 1.0 is the planned flagship: a learned layer on Beryl 1.1, tuned on the optometrist's rating and the patient's tolerance. Oculi now collects both; Goshenite stays untrained until enough follow-ups are in. See [`docs/engine-transition-2026-11-24.md`](docs/engine-transition-2026-11-24.md).

## Design

Oculi wears the ZepheniaLabs design system as applied in O(n!): ground, ink and accent; IBM Plex Sans and Plex Mono; square corners and hairline rules. It follows the device in Zephyr until you choose a palette (Zephyr, Boreas, Harukaze) and appearance in About (tap **Oculi**). The coat lives in `css/coat.css` over `css/app.css`; tokens, fonts and the glyph field come from ZLDesignSystem:

```sh
node tools/sync-zl-design.js ~/ZepheniaLabs/Workspace/Packages/ZLDesignSystem
```

## Run Oculi

No build step. Serve the repository with any local web server:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Verify changes

The suite covers the frozen engine contracts, engine parity across releases, the comparison engine, exports and fitting, ticket parsing, optical calculations, the PDF writer, ZL Retina and ZL Thickness parity, Lens Studio geometry, and the full browser workflow in light and dark from 320 px to desktop.

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

Continuous integration runs the same checks on every pull request.

## Learn more

Research notes, engine behaviour, data definitions and sources are in [`docs/`](docs/).
