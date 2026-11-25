# Showcase and copy pass — 24 November 2026

## Showcase

A fourth space between Genius and Tools, with previews to share with a patient. Nothing in it is saved.

### Clarity

- Inputs: age; current glasses per eye with ADD (optional); final Rx per eye with ADD; eye; distance or near chart.
- Renders through `OculiVisionCompare` and ZL Retina, as in Genius. The difference is that the eye's refraction is the final Rx entered, not Beryl's estimate.
- An eye without a final Rx is refused rather than guessed.

### Lens Studio

- Two prescriptions in the same frame, one eye at a time.
- Material is polycarbonate: n 1.586, 1.20 g/cm³, Abbe 30. Centre and edge are at least 1.0 mm.
- **Frame shapes.** Rectangle, oval, round, aviator and cat-eye. Each is a superellipse shaped by smooth angular bumps, sized to exactly A × B and sampled as 360 radii about the boxing centre.
- **Decentration.** `boxingOffset(A, DBL, B, PD, fitting height)`; the fitting height defaults to B ÷ 2.
- **Front base curve.** Vogel's rule (plus: SE + 6; minus: SE ÷ 2 + 6), rounded to the nearest stocked base from 0.5 to 8 D.
- **Back surface.** Toric, solved for the prescribed back-vertex power through the lens's own centre thickness, in up to three passes. For OS, the TABO axis is mirrored into the nasal lens frame.
- **Thickness, volume and mass.** From `js/zl-thickness.js`, a line-for-line port of `zl_thickness` 0.3.0, used without prism thinning.
- **Colour fringing.** Prentice prism ÷ Abbe number, given 10 mm from the optical centre in the strongest meridian and at the worst rim point. It is flagged as noticeable from 0.10 Δ. The strips spread each letter into a short spectrum, at Clarity's chart scale.

## Copy pass

- Footnotes and hints are trimmed across all four spaces.
- The development-preview labels are gone, along with "Not a prescription", "not clinically validated" and the engines' "unvalidated research model" review note.
  - The card's badge, watermark and warning line now read "Not indicative of the final product".
  - The engines still emit their UNVALIDATED flag in their output and research exports. Clinical Study and Genius no longer show it.
  - The splash keeps "Research tool, not a medical device."
- The card's cover reads "About this card". The PDF is saved as `oculi-rx-card-<date>.pdf`, and Genius' button now reads "Prepare Card".
- About now lists each engine's role briefly, with ZL Thickness added.

## Other changes

- **Workspace tabs.** On screens 400 px wide or less, the four tab labels wrap onto two lines.
- **Tools.** Tools now selects only its own sub-tabs.
- **Browser tests.** They now wait two animation frames after each resize before checking for overflow.
- **CI.** It runs the ZL Thickness parity test, the Lens Studio geometry test and the Showcase browser test.
- **Service worker.** The cache is renamed `oculi-beryl-v1.1-showcase-1`.
