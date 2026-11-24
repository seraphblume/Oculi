# Oculi

Refraction, focused.

Oculi brings clinical comparison and essential prescription tools into one calm, private workspace. It is designed to keep each task clear, preserve the clinician’s independent judgment, and keep case data on the device.

## Three focused spaces

### Clinical Study

A blinded comparison workflow for structured research.

1. **Measure.** Record the autorefractor ticket, visual acuity and whether it was measured unaided or with correction, plus history.
2. **Refract.** Complete your own exam without seeing Oculi's prediction. Record the final Rx, the final VA, the +0.25 D test, and the endpoint whenever the prescribed Rx differs from it.
3. **Compare.** Reveal the prediction and save the case.

The active base engine is **Beryl v1.1.1**, which preserves the v0.3.0 rules. **Heliodor v1.1** preserves the former Beryl v1.0 rules as a paired comparator. Refraction uses a fixed 12 mm vertex. Repeat readings, previous prescription, keratometry, near measurements and review flags stay available without crowding the main flow.

### Genius

A guided refraction preview: **screen → propose → verify → preview**.

- **Screen.** Any warning sign, or an age under 18, stops Genius before any proposal. Current glasses, symptoms and medical background become review notes, not dioptric changes.
- **Propose.** The full autorefractor ticket (repeats included) runs through Beryl v1.1.1 with its unchanged −0.25 D prior.
- **Verify.** VA through the proposed Rx in a trial frame, near when there is an ADD, the +0.25 D test, then accepted or refined.
- **Preview.** A one-page, watermarked preview that records the verification and review notes. It is not a prescription. Save it as a PDF (on a phone this opens the share sheet, which also offers Print) or print it, then start the next patient with **New Patient**.

Genius is clearly marked as a development preview, and nothing entered there is saved.

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

Beryl v1.1.1 is a release identity for the unchanged v0.3.0 rules. Heliodor v1.1 is a release identity for the former Beryl v1.0 rules. Historical records keep their original identities. **Version numbers and gemstone names are not validation claims.** Agreement scores describe differences within defined software tolerances; they are not clinical confidence scores.

Goshenite v1.0 is an untrained research manifest only. It is not in the runtime engine registry and cannot produce a tuned recommendation. The outcome contract, training boundaries, prospective validation gates and naming lineage are documented in [`docs/engine-transition-2026-11-24.md`](docs/engine-transition-2026-11-24.md).

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
- Beryl v1.1.1 parity with v0.3.0 and Heliodor v1.1 parity with historical Beryl v1.0;
- the comparison engine;
- exports and offset fitting;
- ticket parsing;
- optical calculations;
- the PDF writer;
- the complete browser workflow, Genius included, with one-page print and PDF export.

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
node tests/app-flow.browser.js
node tests/genius-export.browser.js
```

Continuous integration runs the same checks for every pull request.

## Learn more

Detailed research notes, engine behaviour, data definitions and source references are in [`docs/`](docs/).
