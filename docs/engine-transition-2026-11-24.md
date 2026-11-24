# Engine transition and Goshenite safety plan

Date: 2026-11-24 (America/Mexico_City)

## Release identities

| Current release | Frozen source rules | Runtime role | Cohort |
|---|---|---|---|
| Beryl v1.1.1 (`beryl-v1.1.1`) | v0.3.0 | Primary base model | `beryl-v1.1.1-1` |
| Heliodor v1.1 (`heliodor-v1.1`) | former Beryl v1.0.0 | Paired comparator | `heliodor-v1.1-1` |
| Goshenite v1.0 (`goshenite-v1.0`) | Beryl v1.1.1 plus a future learned candidate ranker | Research-only, untrained, not in the runtime registry | none |

Historical records are not relabelled. The v0.3.0, 0.4.0-rc.1 and v1.0.0 Beryl files remain frozen for audit and parity tests. Namespaced engine IDs avoid confusing Goshenite v1.0 with the historical numeric `v1.0` engine ID.

The transition does not change dioptric rules. Beryl v1.1.1 is regression-tested against v0.3.0, and Heliodor v1.1 is regression-tested against former Beryl v1.0. Every active result remains marked unvalidated and requires an independent examination.

## Dataset audit

The five reviewed CSVs are cumulative or reformatted snapshots, not five independent datasets:

| Export | Rows | Unique cases | Interpretation |
|---|---:|---:|---|
| 2026-09 study | 25 | 25 | v0.1.0 case snapshot |
| 2026-10 study | 53 | 53 | v0.3.0 case snapshot; contains all 25 September case IDs |
| 2026-10 comparison | 530 | 53 | 5 variants × 2 eyes × 53 cases |
| 2026-11 study | 33 | 33 | v1.0.0 case snapshot; all 33 IDs also occur in the October snapshot |
| 2026-11 comparison | 528 | 33 | 8 variants × 2 eyes × 33 cases |

The comparison rows are repeated analytical views. They are not independent observations. Case ID, not eye/variant row, is the minimum split unit.

The data contain age, autorefractor readings, prediction and final Rx, power-vector errors, agreement checks, limited history, VA condition, final VA, +0.25 D test, and endpoint fields. In the 33-case v1.0 snapshot:

- 27 cases used unaided VA and 6 used corrected VA.
- The +0.25 D test held the line in 19 cases and blurred in 14.
- Three cases were under 18.
- All 33 records say the issued prescription did not differ from the endpoint, so the endpoint S/C/A and reason fields are empty.
- No site code or clinician code is present, so site and examiner independence cannot be assessed.

No export contains a patient-tolerance follow-up outcome or an optometrist rating. The columns named `axis_tolerance` and `axis_within_tolerance` are lens/scoring thresholds, not patient tolerance. These exports therefore cannot support the requested supervised tuning.

## Safe Goshenite formulation

Goshenite should initially be an offline candidate ranker, not an unconstrained prescription generator:

1. Beryl v1.1.1 produces the locked base prediction.
2. A fixed, clinician-reviewed candidate set is generated from deterministic existing candidates. No arbitrary continuous Rx is produced.
3. Only features available before the independent subjective endpoint may enter the model. Patient tolerance, clinician score, final Rx, endpoint reasons and post-dispensing information are labels or audit fields, never inference-time features.
4. The research model ranks candidates. It remains invisible to the clinician during data collection and cannot change the saved clinical result.
5. A clinician independently completes the examination and remains free to reject or ignore every model output.

Patient tolerance and clinician assessment must remain separate outcomes. A practical primary safety outcome is intolerance requiring adjustment, remake, new examination or referral after a prespecified follow-up window. The 1–5 optometrist score is a secondary ordinal outcome using a locked rubric. Optical error against the independent endpoint is a separate technical outcome.

The initial `optometrist-acceptability-1` rubric should be locked as: 5, acceptable without change; 4, acceptable with a minor change; 3, clinically meaningful change needed; 2, major change needed; 1, reject. The record also stores the categorical disposition so a numeric score cannot silently change meaning. Inter-rater agreement must be measured before the score is used as a training label.

The machine-readable collection contract is `docs/goshenite-training-record.schema.json`. It requires a pseudonymous case ID, site and clinician provenance, a locked Beryl prediction, an independent endpoint, issued Rx, blinded clinician rating, and follow-up tolerance outcome. Dispensing context is retained because non-tolerance can arise from fabrication, fitting, lens design or ocular disease rather than the prescription.

## Data and training gates

### Gate 0 — definitions and governance

- Lock the clinical protocol, inclusion/exclusion criteria, follow-up window, score rubric and adverse-event handling before reviewing outcomes.
- Obtain appropriate ethics, consent, privacy, security and medical-device/regulatory review for the intended jurisdiction and use.
- Keep direct identifiers out of research exports. Maintain access controls, an audit log and a documented deletion/retention policy.
- Freeze Beryl v1.1.1 and the candidate-generation rules before collection.

### Gate 1 — data readiness

- The schema validator passes with no silent coercion or imputed outcome labels.
- Patient tolerance has a prespecified minimum follow-up and distinguishes tolerated, not worn, lost to follow-up and unknown.
- Clinician score uses one locked scale and records masking/independence.
- Outcomes are available from multiple clinicians and sites. A statistician sets the sample size from the prespecified safety margin and event rate; 200 completed adult follow-ups is only an engineering-screening floor, not evidence of clinical adequacy.
- Pediatric records are excluded from the first learned model and evaluated only under a separate pediatric protocol.

### Gate 2 — locked retrospective development

- Deduplicate by case ID and split by patient, clinician and site, with a later-time holdout.
- Fit once inside the development partition. Do not select features, thresholds or candidate bounds on the test partition.
- Compare against Beryl v1.1.1 and a no-model policy. Report confidence intervals, missingness, site/clinician heterogeneity and subgroup results.
- Reject the model if any safety subgroup worsens materially, if calibration is unstable, or if performance depends on final/outcome leakage.

### Gate 3 — silent prospective validation

- Freeze the model artifact, preprocessing, candidate set, thresholds and analysis plan.
- Run silently on a new prospective cohort. Clinicians must remain blinded until the independent endpoint is locked.
- Primary safety analysis is case-level. Eye and variant rows are correlated and may not be counted as independent samples.
- Require non-inferiority on intolerance/remake-related outcomes and improvement on at least one prespecified technical endpoint without increasing adverse events.

### Gate 4 — independent external prospective evidence

- Validate at sites and with clinicians not used for development.
- Use a preregistered protocol, independently monitored data quality and an analysis performed or audited by an independent statistician.
- Replicate the result before making any “clinically proven” claim. Version, population, intended use and endpoint must be stated; no broader claim is allowed.

### Gate 5 — controlled clinician-facing evaluation

- Show Goshenite only as decision support with Beryl, source measurements, uncertainty and reasons visible.
- Require an explicit clinician accept/edit/reject action. Never auto-populate a final prescription or bypass screening.
- Provide immediate rollback to Beryl, monitor drift and safety events, and require a new model/cohort identifier for every material change.

Until Gates 0–4 are complete, Goshenite must remain research-only and untrained, and Oculi must continue to state that it is not clinically validated.

## Zl_retina and Genius

No `Zl_retina` source was present in the Oculi repository, its public branches, commit history or publicly discoverable GitHub repositories during this review. No simulation code was added without inspectable source and licensing.

If the source becomes available, integration needs a separate review of its optical assumptions, supported conditions, browser performance, privacy and license. The patient-facing view must be labelled as an illustrative comparison, not a faithful simulation of an individual patient's perception, and it must not diagnose retinal disease or imply that a correction is safe. Regression tests should verify that the demo cannot alter a Clinical Study or Genius Rx.
