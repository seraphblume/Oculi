# Clinical rationale and scope

## What Oculi is predicting

A conventional refraction moves through clinically different values. They must not be collapsed into one target:

```text
objective observations
  -> monocular subjective endpoint
  -> binocularly reconciled endpoint
  -> prescribed/dispensed Rx
  -> product fitting
```

The long-term targets are:

1. **Subjective refractive endpoint.** The optically refined S/C/A result, before adaptation or dispensing choices.
2. **Prescribed Rx.** The value actually issued, after binocular comfort, habitual-correction history, adaptation and clinician judgment.

A difference between these two is not automatically model error. It is a prescribing decision that needs an explicit reason code.

The historical v0.2.0 study predicts from the selected autorefractor S/C/A and compares with the clinician's final Rx. The active v0.3.0 candidate still targets the final Rx, but it stores the richer evidence needed to separate the two targets later.

## Evidence sources to keep separate

A refraction usually starts from four objective observations:

- habitual spectacles measured by lensometer;
- the autorefractor's selected reading and its repeat readings;
- keratometry;
- retinoscopy.

They do not measure the same thing. Oculi keeps each raw observation with its method, eye, units and provenance. Agreement can later support confidence; disagreement triggers review rather than a silent average.

Subjective refraction then adds process evidence: starting Rx, cylinder axis and power refinement, sphere refinement, best monocular VA, binocular-balance eligibility and result, dominant eye, and tentative and refined ADD.

## What v0.3 takes from refraction practice

| Practice | v0.3 behaviour |
|---|---|
| Repeat autorefractor readings vary with accommodation and fixation | All readings are kept. The engine computes the median, the most-plus reading and the spread, and flags poor repeatability. |
| The subjective endpoint aims for the most plus / least minus sphere with best acuity | The most-plus reading is computed as a candidate estimator, so it can be tested. |
| Myopes and hyperopes are refined differently; latent hyperopia is often left uncorrected; accommodation declines with age | The spherical offset is stratified by refractive state and age band instead of being one constant. |
| Cylinder refinement keeps the spherical equivalent | Prediction happens in power-vector space. Cylinder changes and rounding move the sphere by half the cylinder change. |
| Axis precision matters more as cylinder grows | 1° axis resolution at ≥ 0.75 D. Scoring uses a cylinder-dependent tolerance. |
| Vertex distance changes effective power, noticeably above about ±4 D | Readings are normalized to 12 mm per principal meridian when the instrument reports another distance. |
| Keratometry estimates total astigmatism through Javal's rule | Used only as a cross-check flag. |
| Tentative ADD depends on age, refractive state and the patient's working distance | Refractive state comes from the raw reading. The ADD is adjusted for working distance. An amplitude-based estimate is reported alongside. |

## Clinically useful roles for preliminary tests

History, VA, pinhole, cover test, near point of convergence, colour vision, external examination, motility, pupils and confrontation fields come before refraction. Their safest uses in Oculi are:

- **context:** chief complaint, visual task and habitual-correction experience;
- **data-quality checks:** was the test performed under the documented correction condition?;
- **reason codes:** why a subjective test was not usable, or why the case needs review;
- **safety flags:** an abnormal or incomplete screen prevents an unqualified high-confidence presentation;
- **stratification:** subgroup analysis once sample sizes allow.

They are not dioptric switches. Pinhole improvement never adds or subtracts sphere, and colour-vision status never alters the Rx.

## Habitual correction

The habitual correction is the most important starting reference. A yes/no field loses most of its value. Future collection should include, per eye:

- measured habitual S/C/A and ADD;
- age of the prescription, when known;
- corrected VA with it;
- satisfaction, complaint and adaptation;
- the vector change from habitual to objective, subjective and prescribed values.

A large change may be prescribed in stages. This is the main reason to keep the subjective endpoint and the issued prescription separate.

## VA and pinhole

- Preserve the original notation and correction condition.
- Treat pinhole as evidence about whether ordinary refractive blur explains reduced VA.
- v0.3 flags reduced VA (worse than 20/30) with no pinhole improvement. It does not infer disease.
- Distinguish not performed, not indicated, untestable and missing.

## Optical representation

Spherical equivalent alone does not describe astigmatic prescriptions. Oculi keeps S/C/A and also uses power vectors:

```text
M   = S + C / 2
J0  = (-C / 2) cos(2A)
J45 = (-C / 2) sin(2A)
```

(Thibos et al., 1997.) Vector error is the primary combined error measure. SE remains a monitor.

## Binocular and ADD layers

Binocular balance is done only after the two eyes reach equal VA, and it favours the dominant eye when equality can't be reached. A future model should produce monocular candidates first and then check binocular consistency, rather than treating OD and OS as unrelated records.

For presbyopia, record the tentative-ADD method, the actual working distance, NRA and PRA when performed, the near-distance check result, the refined ADD, the comfortable near VA and the prescribed ADD per eye.

## Scope boundary

```text
clinical refraction -> prescription -> product selection/fitting
```

Contact-lens conversion, vertex tables for contact lenses, toric rotation, contact-lens ADD ranges, progressive fitting measurements, material choice and product selection are downstream modules. None may alter the spectacle prediction.

## Safety position

Oculi is a research prototype, not a diagnostic or autonomous prescribing system. A review status describes evidence quality, not clinical certainty. The interface always shows source measurements, flags and reasons, keeps the clinician's exam independent and blinded, and abstains when inputs are incomplete.

See [references and traceability](source-register.md), the [v0.3 engine specification](v0.3-engine.md) and the [v0.3 design notes](v0.3-design-notes.md).
