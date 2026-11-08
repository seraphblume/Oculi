# Vertex compensation

The supplied Boston Equalens / Lumilent fitting-guide photograph has a lower-right table headed “DISTANCIA DE VERTICE A 12 mm”. It is a coarse power-conversion reference, not a method of measuring the physical vertex distance. Its printed arrows specify opposite reading directions for the minus and plus columns. The left-hand diopter/radius table and RGP fitting instructions are separate and are not implemented here.

Use the analytic formula instead of digitizing rounded table entries:

`F_target = F_source / (1 - ((sourceMm - targetMm) / 1000) * F_source)`

Distances are measured from the cornea. Convert the sphere meridian and sphere-plus-cylinder meridian independently, then reconstruct cylinder as their difference. The axis does not change. Keep full precision internally. Rx conversion shows powers to 0.01 D and does not select available contact lens powers or prescribe a fit. Printed fitting charts can contain coarse rounding, product-specific choices or errors. They are not numerical ground truth. Regression tests use independently derived exact reference values, including high powers, both signs and both meridians; no chart-matching error allowance is used.

The calculator defaults to 12 → 0 mm (spectacle to corneal plane); either distance can be changed from 0 to 25 mm, including the reverse conversion. Blank, nonfinite, out-of-range distances and conversion through a focal singularity are rejected.

The v0.3 and experimental v0.4 engines retain their historical ability to normalize readings to the configured 12 mm spectacle plane. The current refraction workspace now fixes its input at 12 mm and does not import a ticket VD into the case. This preserves the engine target, calibration, historical cases, v0.3 golden baseline and v0.2 freeze.

Sources:

- User-supplied Boston Equalens / Lumilent photograph, lower-right 12 mm table (no patient data).
- [University of Utah Moran CORE: Contact Lens Over-Refraction](https://morancore.utah.edu/section-03-clinical-optics/contact-lens-over-refraction/) — vertex formula and clinical context.
- [CooperVision: Contact Lens Designs](https://coopervision.com/practitioner/ecp-viewpoints/technicians-and-staff/contact-lenses-101-part-2-contact-lens-designs) — 12 mm spectacle / 0 mm contact lens convention and distinction from available lens powers.

Run the existing verification workflow, including optical calculator, engine, baseline/freeze and browser suites. No new calibration or clinical validation is claimed.

## Applying compensation once

The source distance describes the plane of the power currently entered, not necessarily the instrument or spectacles originally used. A prescription already expressed at the cornea has source 0 mm. Converting 0 → 0 mm leaves it unchanged. The calculator explicitly identifies same-plane passthrough and reminds users to confirm the input plane when applying a conversion. It cannot infer prior compensation from sphere, cylinder and axis alone.

Manufacturer trial-lens recommendations may already incorporate vertex conversion and available powers. Do not feed those values through an additional spectacle-to-corneal conversion. Any future table integration must record its input/output planes and compensation provenance before enabling a conversion path.

The approximately ±4 D fitting guideline concerns either principal meridian. It is not a mathematical threshold: the calculator retains exact compensation below it. Spherical equivalent is a separate approximation that removes astigmatic correction; it is not substituted for meridian-by-meridian conversion. Manufacturer multifocal additions, RGP tear-lens/base-curve adjustments, lens rotation and selection of available powers require separate fitting workflows. None changes the general refraction engine's spectacle-plane target or calibration.

Only application code, synthetic checks and this implementation explanation accompany this update. No private notes, vault paths, source attachments or patient records are included.

## Calculator workflow and refraction scope

Rx conversion supports separate right-eye (OD) and left-eye (OS) inputs. Either eye may be left completely blank; a partially completed eye is rejected. Both eyes share explicit source/target distances and are calculated independently. No patient-case data is imported, saved or modified. A mode/input change invalidates results; a failed eye prevents any partial result from being presented as the completed calculation.

- Spectacles → Contacts: enter the spectacle Rx and its measured vertex (default 12 mm); the corneal target is fixed at 0 mm.
- Contacts → Spectacles: enter contact lens powers at 0 mm and the intended spectacle vertex (default 12 mm).
- Custom: set both distances for a spectacle-fit change or an already-compensated power. This is axial compensation only, not a wrap/tilt/freeform lens-design calculation.

Results label each eye and output plane, show the exact optical equivalent to 0.01 D, and separately show a nearest-quarter sphere/cylinder reference with ties toward more plus. This reference is mathematical rounding, not a brand's available powers or a fitting recommendation. The original-Rx transposition and spherical equivalent remain separate. Individual and combined conversion copies carry eye and plane labels.

The main algorithm remains an autorefractor-to-spectacle estimate at a fixed 12 mm plane. Ticket VD may still be recognized by the scanner, but the refraction workspace does not apply or store it. No calibration, historical data, ADD or frozen engine behavior is changed by the calculator redesign.

Illustrative checks use synthetic prescriptions and independently calculated optical values. No private source text or attachments are included. The approximate 4 D clinical guideline is checked per principal meridian; no fixed claim that every lower-power conversion is below 0.18 D is made. Available powers and fitting choices remain separate from the formula.

The Rx conversion tool accepts explicit source and target distances from 0 to 25 mm. The refraction workspace is intentionally different: it always records 12 mm so prediction comparisons use one consistent plane.
