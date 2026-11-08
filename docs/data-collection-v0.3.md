# Proposed v0.3 data collection

Status: **partly collected, active candidate since 2026-10-16.** New records use `dioptra-case-2` and cohort `v0.3-candidate-1`. Repeat readings, reliability, PD, near distances and keratometry are stored in top-level `observations` and feed the v0.3 candidate; refraction vertex is always recorded as 12 mm. Historical `shadow.observations` records remain readable. Near distances are entered in mm and stored in the existing explicitly named cm fields; the comparison export includes both units. Previous Rx Yes now requires per-eye S/C/A and offers optional ADD, saved under `input.previousRx`. The study CSV columns stay unchanged; the comparison CSV appends the new fields. Remaining fields below are still design only; the proposed schema is not the `dioptra-case-2` runtime format.

Machine-readable draft: [`data-collection-v0.3.schema.json`](data-collection-v0.3.schema.json)

## Collection principles

1. Store raw observations before derived values.
2. Keep objective, subjective and prescribed Rx as different stages.
3. Record method, correction condition and not-performed reason.
4. Keep OD and OS values separate; store binocular findings explicitly.
5. Use enumerated reason codes plus a note rather than inferring why a clinician changed an endpoint.
6. Avoid direct patient identifiers in the research export.
7. Stamp the schema, cohort and algorithm version on every case.
8. Do not expose a future field to the predictor until its definition, missingness and validation plan are documented.

## Minimum useful v0.3 research record

| Stage | Fields | Why |
|---|---|---|
| Study provenance | pseudonymous case ID, schema version, cohort, algorithm version, timestamps, site/instrument IDs | Prevents mixed cohorts and silent schema drift. |
| History | age, chief complaint category, primary visual task, symptoms, diabetes/hypertension/pregnancy, relevant ocular history | Clinical context and future stratification; not direct S/C/A switches. |
| Habitual correction | per-eye S/C/A, ADD, Rx age, corrected VA, satisfaction/adaptation | The procedure treats habitual correction as a major starting reference. |
| Visual acuity | distance with and without correction, near at recorded distance, pinhole with indication/status | Preserves test conditions and supports plausibility/quality checks. |
| Autorefraction | every raw reading, selected result, machine quality token as an opaque value, device/settings | Allows repeatability and cluster analysis without assuming undocumented quality semantics. |
| Other objective evidence | retinoscopy, keratometry and lensometry/habitual Rx as separate records | Enables agreement analysis without pretending the methods are interchangeable. |
| Preliminary screen | cover test, PPC, colour, externals, motility, pupils, fields, slit lamp/fundus when recorded | Reason codes and review flags; never automatic dioptric changes. |
| Subjective endpoint | starting method, monocular endpoint, best VA, binocular-balance status, dominance | Separates optical refinement from the prescription issued. |
| Near/add | tentative method/value, working distance, NRA, PRA, distance-check result, refined per-eye ADD | Supports evaluation beyond the age table. |
| Prescribed endpoint | per-eye S/C/A/ADD, ambulatory acceptance, modification reason(s) | Makes prescribing/adaptation decisions observable. |
| Derived audit | vectors, deltas and flags with rule-set version | Reproducible analysis; derived fields can be recomputed from raw values. |

## Missingness

For optional procedures, a missing value must not conflate:

- `not_indicated`
- `not_performed`
- `unavailable`
- `untestable`
- `declined`
- `unknown`

The schema uses a reusable `procedureStatus` structure for this purpose.

## Autorefractor readings

Store the printed/selected line and each repeated reading separately (*collected*). The reliability digit printed after each reading is stored as `reliability` and treated as opaque until the instrument manual confirms its meaning. Instrument working distance is not the patient's preferred near working distance.

Derived values (computed by the v0.3 engine and included in the engine-comparison CSV):

- median `M`, `J0`, `J45` across readings;
- robust spread for each vector component;
- distance from machine-selected result to the robust center;
- reading count and missingness.

Review thresholds are provisional (`js/config-v03.js`) and are not used to alter any dioptric value.

## Endpoint and prescribing reason codes

When prescribed Rx differs from the subjective endpoint, require at least one reason:

- `adaptation_large_change`
- `habitual_rx_preference`
- `binocular_comfort`
- `ambulatory_test`
- `visual_task`
- `pathology_or_health_finding`
- `clinician_judgment`
- `patient_preference`
- `other`

These codes explain the label. They must not become shortcuts that leak the final Rx into a model intended to predict the subjective endpoint.

## Transition from Cohort B

Historical Cohort B records remain unchanged. The owner-authorized candidate transition is documented in the freeze contract. New cases have a separate cohort and schema; promotion retains the prior offsets and does not represent fitting or validation on closed data. Future tuning must use a closed development cohort and be followed by a new prospective cohort.
