# Goshenite outcomes

Goshenite v1.0 is the planned flagship engine: a learned layer on Beryl v1.1, tuned on two outcomes that no earlier export recorded. Oculi collects both from 24 November 2026. Goshenite stays untrained, and outside the runtime engine registry, until enough cases carry both.

## 1. Optometrist rating, at the exam

Recorded in **Compare**, after the locked prediction is revealed and before the case is saved. It is required.

| Score | Disposition | Meaning |
|---:|---|---|
| 5 | `acceptable_without_change` | Would prescribe Beryl's proposal as is |
| 4 | `acceptable_with_minor_change` | A minor change |
| 3 | `meaningful_change` | A clinically meaningful change |
| 2 | `major_change` | A major change |
| 1 | `reject` | Would not use it |

Stored as `assessment: { scaleVersion: "optometrist-acceptability-1", score, disposition, engine, ratedAt }`.

## 2. Patient tolerance, at follow-up

Recorded from the **Follow-ups** list in the Study section, on any saved case, including earlier cohorts. Oculi marks a case due from day 7; one to four weeks after the exam is the intended window.

- **Status:** tolerated, minor symptoms, not tolerated, not worn, glasses not made, no contact.
- **Action:** nothing, counselling, frame adjustment, lens remake, new exam, referral. Not asked when the glasses were not made or there was no contact.
- **Method:** in person, phone, message.
- **Note:** optional, 200 characters.

Stored as `followUp: { scaleVersion: "patient-tolerance-1", status, action, collectionMethod, followUpDays, assessedAt, note }`. Only the follow-up changes; the prediction and the rest of the record are untouched (the browser test checks this).

A case counts toward the Goshenite training set when it has a rating and a follow-up whose status is tolerated, minor symptoms, not tolerated or not worn. The Study section shows the count.

## Export

Both CSVs end with eight columns, appended after the existing ones so no column moves: `optometrist_score`, `optometrist_disposition`, `tolerance_status`, `tolerance_action`, `tolerance_days`, `tolerance_method`, `tolerance_assessed_at`, `tolerance_note`.

## Rules that hold when Goshenite is trained

- Neither outcome is ever an input to a prediction; they are labels.
- Split by patient, never by eye or engine variant.
- Non-tolerance can come from fitting, lens design or adaptation rather than the Rx; the action and note fields are there to tell them apart.
- The optometrist keeps the final say on every prescription.
