# References and traceability

## Purpose

This register records where the ideas behind Oculi's design come from. It also records what was deliberately kept out of the spectacle-Rx predictor. It is a provenance record, not a claim that any rule is clinically validated.

## Background clinical practice

Oculi's exam structure follows a conventional optometric workflow, as taught in standard optometry curricula. It relies only on general, widely taught practice and reproduces no proprietary material:

| Topic | What Oculi takes from it |
|---|---|
| Exam sequence | History, preliminary tests, objective refraction, subjective refraction, verification. Objective readings are starting points, not prescriptions. |
| Objective refraction | Habitual Rx (lensometry), autorefraction, keratometry and retinoscopy are distinct observations and are stored separately. |
| Subjective refraction | The endpoint is the most plus / least minus sphere that gives best acuity. Cylinder refinement keeps the spherical equivalent (−0.50 D cylinder added ≈ +0.25 D sphere). Binocular balance applies only when acuity is equal. |
| Habitual correction | It is the most important starting reference. A large change may be prescribed in stages, so the subjective endpoint and the issued Rx are different targets. |
| Pinhole | Shows whether reduced acuity is plausibly refractive. It is a review signal, never a dioptric rule. |
| Presbyopia | A tentative ADD from age and refractive state, refined at the patient's working distance (NRA/PRA balance or a near-distance check). |
| Functional hyperopia | Latent hyperopia is commonly left uncorrected, so hyperopes may be refined differently from myopes. This motivates stratified offsets. |

## Published optics and standards

| Reference | Used for |
|---|---|
| Thibos LN, Wheeler W, Horner D. *Power vectors: an application of Fourier analysis to the description and statistical analysis of refractive error.* Optom Vis Sci. 1997;74(6):367–375. | M, J0, J45 representation; vector medians, spreads and errors |
| ANSI Z80.1, *Prescription Ophthalmic Lenses — Recommendations* | Cylinder-dependent axis tolerance used in scoring |
| Effective power / vertex distance relation, F' = F / (1 − dF) | Converting readings between vertex distances, per principal meridian |
| Javal's rule, simplified form (corneal astigmatism −0.50 D with the rule, +0.50 D against the rule) | Keratometry cross-check of autorefractor cylinder |
| Half-amplitude reserve rule for near additions | Second, reported-only ADD estimate |
| Transposition and the optical (power) cross | Minus-cylinder normalization; meridian-wise vertex conversion |

## Deliberately excluded from the predictor

These belong to steps **after** a spectacle refractive endpoint. They never change sphere, cylinder, axis or ADD:

- spectacle-to-contact-lens conversion, contact-lens vertex tables, toric rotation compensation, contact-lens ADD categories;
- progressive-lens fitting measurements, lens design and material choice;
- any commercial product, brand or catalog data.

## Traceability rules

1. A clinical practice may justify **collecting** a field without justifying its use as a prediction feature.
2. Abnormal preliminary findings produce a flag or a request for clinician review. They never add or subtract dioptres.
3. Numeric thresholds not taken from a published standard are marked *provisional*. They must be estimated and validated prospectively.
4. Product-fitting rules stay in downstream modules and never enter the spectacle-Rx model.
5. Raw observations and their provenance are kept, even when sources disagree. Oculi does not silently choose a correction.

## Design hypotheses, not established claims

- combining objective measurements in power-vector space;
- using the most-plus repeat reading as a proxy for the least-accommodated measurement;
- refractive-state × age stratification of the spherical offset, with shrinkage toward a global mean;
- converting cross-source disagreement into a review status;
- any threshold for repeatability, disagreement or abstention.

Each is implemented so that it can be measured in shadow mode. None is enabled in the study prediction until a closed cohort supports it.
