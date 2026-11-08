# Oculi

Refraction, focused.

Oculi brings clinical comparison and essential prescription tools into one calm, private workspace. It is designed to keep each task clear, preserve the clinician’s independent judgment, and keep case data on the device.

## Three focused spaces

### Clinical Study

A blinded comparison workflow for structured research.

1. Record the autorefractor readings.
2. Complete the refraction without seeing Oculi’s prediction.
3. Reveal and compare the results.

Refraction uses a fixed 12 mm vertex distance. Repeat readings, visual acuity, previous prescription, keratometry, near measurements, and review flags remain available without crowding the primary flow.

### Genius

A dedicated home for guided self-service refraction.

Genius is visible as its own workspace, but self-service results are not enabled in this research build. Oculi does not present an unvalidated prediction as clinical guidance.

### Rx conversion

Three tools. Three uncluttered views.

- **Rx conversion** — convert spectacle and contact-lens planes, including custom vertex distances.
- **Spherical Equivalent** — calculate and copy the nearest quarter-diopter value.
- **Transpositions** — switch cylinder notation without changing the optical prescription.

Right and left eyes can be entered together. Calculator work stays separate from patient cases and is not saved.

## Private by design

Case data stays in the browser on the current device. Oculi works without an account and can run offline after its first load.

Ticket scanning reads an autorefractor image in the browser. The image and patient name are not saved. Recognized values remain editable and should always be checked against the original ticket.

## Research status

Oculi is an experimental research prototype. It is not a validated medical device and must not be the sole basis for prescribing, dispensing, diagnosis, or treatment.

The current study compares the experimental v0.4 release candidate with the unchanged v0.3 engine. Historical records stay intact, and new results remain separated from earlier cohorts. Agreement scores describe differences within defined software tolerances; they are not clinical confidence scores.

## Run Oculi

No build step is required. Serve the repository with any local web server, then open `index.html` through that server.

For example:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Verify changes

The test suite covers the frozen engine contract, current and comparison engines, exports, ticket parsing, optical calculations, and the complete browser workflow.

```sh
node tests/v0.2-freeze.test.js
node tests/v0.3-engine.test.js
node tests/v0.4-rc.test.js
node tests/ticket-scan.test.js
node tests/export-and-fit.test.js
node tests/optical-calculators.test.js
node tests/app-flow.browser.js
```

Continuous integration runs the same checks for every pull request.

## Learn more

Detailed research notes, engine behavior, data definitions, and source references remain available in [`docs/`](docs/).
