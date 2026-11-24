# 2026-11-24 handoff changelog: engine transition and ZL retina

This document is the continuation brief for Claude or another maintainer. It records the work on branch `codex/engine-naming-goshenite-safety` and defines the safe boundary for the proposed ZL retina demonstration.

## Completed in this branch

### Engine identities

- Released the unchanged v0.3.0 rules under the new identity **Beryl v1.1** (`beryl-v1.1`).
- Released the unchanged former Beryl v1.0 rules under the new identity **Heliodor v1.0** (`heliodor-v1.0`).
- Kept historical v0.3.0, 0.4.0-rc.1 and v1.0.0 records and source identities intact.
- Added parity tests so the naming transition cannot silently alter the optical output.
- Kept every current result marked unvalidated and subject to independent clinician review.

### Goshenite v1.0 safety boundary

- Added an untrained, research-only Goshenite manifest based on Beryl v1.1.
- Deliberately excluded Goshenite from the runtime engine registry. It cannot issue a tuned recommendation.
- Added an aggregate-only CSV readiness audit and a machine-readable outcome contract.
- Documented the required retrospective, silent prospective and independent external validation gates.
- Prohibited patient-tolerance outcomes, clinician scores and final prescriptions from becoming inference-time features.

### Genius

- Genius now calls the Beryl v1.1 wrapper while preserving the v0.3.0 optical rules.
- The UI identifies the model as unvalidated.
- Genius remains ephemeral: its entries do not enter the Clinical Study or persistent storage.

## Files added

- `js/config-beryl-v11.js`
- `js/engine-beryl-v11.js`
- `js/config-heliodor-v10.js`
- `js/engine-heliodor-v10.js`
- `js/goshenite-research.js`
- `docs/engine-transition-2026-11-24.md`
- `docs/goshenite-training-record.schema.json`
- `tools/audit-goshenite-data.js`
- `tests/engine-naming-transition.test.js`

Related registry, application, Genius, storage, service-worker, documentation and test files were updated for the new release identities.

## ZL retina status

No `Zl_retina` or `ZL retina` implementation was present in the repository, its public branches or commit history at the time of review. No source or license was available to inspect. Consequently, this branch does **not** contain a substitute renderer and makes no claim that a particular retinal model has been reproduced.

Before implementation, obtain and record:

1. the authoritative source repository or source files;
2. the applicable license and redistribution terms;
3. the mathematical/optical assumptions and supported prescription notation;
4. the intended input image rights and privacy policy; and
5. known limitations, especially whether the model represents refractive defocus only or claims retinal/pathology effects.

Do not copy, translate or approximate an unavailable implementation under the ZL retina name.

## Required product boundary

ZL retina may be integrated only as an **illustrative patient-education comparison** inside Genius. It must not diagnose a retinal condition, predict an individual's subjective perception, validate a prescription, modify a Beryl result, or write to the Clinical Study.

The first version should:

- show a clearly labelled side-by-side comparison such as “without entered correction” and “with trial-frame correction”;
- state that the image is an optical illustration and may not match the patient's actual vision;
- use only a defensive copy of the Genius proposal or verified/refined Rx;
- remain hidden until the required Genius inputs produce a valid proposal;
- clear immediately when `invalidate()`, `resetAll()` or `newPatient()` clears the proposal;
- run entirely in the browser unless a separately reviewed service is explicitly approved;
- avoid uploading patient images, tickets, names or prescription data;
- expose no method that can mutate `proposal`, engine configuration, saved cases or study storage; and
- remain outside the printable prescription preview and generated PDF unless a later review explicitly approves a separately labelled educational page.

If the recovered source models retinal disease, neural vision, contrast sensitivity or higher-order aberrations not measured by Oculi, disable those modes rather than inferring missing clinical inputs.

## Recommended integration shape

1. Add the reviewed renderer as a new isolated module, preferably `js/zl-retina.js`.
2. Give the module a small pure interface such as `renderComparison({ source, uncorrectedRx, correctedRx, canvasBefore, canvasAfter })` plus `clear()` and `destroy()`.
3. Reject missing, non-finite or out-of-range optical inputs. Normalize plus/minus-cylinder notation with existing Oculi utilities rather than duplicating prescription math.
4. Add a “Vision comparison” section to `#geniusResults`, not to the Clinical Study form.
5. In `js/genius.js`, call the renderer only after `engine.predictCase()` succeeds. Pass a newly created plain object; never pass the mutable internal `proposal` object.
6. Clear the renderer from `invalidate()` and `resetAll()`. Treat any renderer failure as non-blocking: Genius refraction and verification must continue to work.
7. Add the module to `index.html` before `js/genius.js`, include it in `sw.js`, and bump the service-worker cache ID.
8. Add responsive and reduced-motion styling in `css/app.css`. Provide useful text if canvas, WebGL or the renderer is unavailable.

Do not change the frozen rule files `js/algorithm.js`, `js/config.js`, `js/config-v03.js`, `js/engine-v03.js`, `js/config-v10.js` or `js/engine-v10.js` for this feature.

## Test requirements

Add unit and browser coverage for at least the following:

- zero correction produces no artificial blur;
- left/right eye and cylinder-axis handling match the source model's documented convention;
- invalid, extreme and incomplete inputs fail closed without breaking Genius;
- changing or clearing any Genius source field removes a stale comparison;
- renderer failure cannot change the proposed or refined Rx;
- opening the comparison cannot add or update local storage or Clinical Study records;
- `New Patient` removes canvases, object URLs, image buffers and prescription data;
- no patient input or image triggers a network request;
- keyboard, screen-reader, mobile and reduced-motion fallbacks remain usable;
- Genius print and generated PDF remain one page and omit the comparison;
- the existing engine parity and browser-flow suites still pass.

Use synthetic images and synthetic prescriptions in tests. Do not add patient images to fixtures.

## Acceptance gate

The ZL retina work is ready for review only when its source and license are documented, its outputs are labelled illustrative, all data stay local, it has no path to engine or storage mutation, and the complete non-browser and browser test suites pass. Keep it behind a disabled-by-default feature flag until that review is complete.

## Current verification

- All nine non-browser suites pass, including Beryl/Heliodor parity and Goshenite isolation.
- A visible browser smoke test showed the updated engine labels, a working Genius panel and no browser errors.
- CI installs Chromium and retains the full Genius print/PDF browser suites.

Oculi remains a research prototype and is not clinically validated. No “clinically proven” claim should be made without adequate independent prospective evidence for the version, population, intended use and endpoints being claimed.

## Update, same day: ZL Retina found and integrated

The source was never missing from the studio: `zl_retina` 0.1.0 lives in the studio's local package collection (`Workspace/Packages/ZLRetina`), not in this repository. It is the studio's own code, so there is no third-party licence to clear.

- `js/zl-retina.js` ports it line for line; `tests/zl-retina.test.js` matches the Python package's own output to 1e-9 on the kernels and 1e-5 on rendered images.
- Genius section 4, **Vision comparison**, renders current vision and true vision side by side in a worker. It is labelled as an illustration of focus, works at any age, keeps everything on the device, and cannot change a proposal, a Clinical Study record or storage.
- Engines were renumbered at the same time: Beryl 1.1.0 and Heliodor 1.0.0 (each gemstone name starts its own version line).
- Goshenite's outcomes are now collected: see `docs/goshenite-outcomes.md`.
