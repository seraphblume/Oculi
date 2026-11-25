# Demotools — 24 November 2026

A fourth workspace, **Demotools** (placeholder name), between Genius and Tools. It holds two patient-facing illustrations. Neither reads nor writes storage.

## True Vision (placeholder name)

- Inputs: age; current glasses per eye with ADD (optional); the final Rx per eye with ADD; the eye shown; a distance or near chart.
- Renders through `OculiVisionCompare` and ZL Retina, the same way as the Genius comparison. The difference is that the eye's refraction is the final Rx typed in, not Beryl's estimate.
- An eye without a final Rx is refused rather than guessed.

## Frame/Lens Preview (placeholder name)

- Two Rx in the same frame, for one eye at a time. Polycarbonate only: n 1.586, 1.20 g/cm³, Abbe 30, centre and edge at least 1.0 mm.
- Frame shapes are rectangle, oval, round, aviator and cat-eye. Each is a superellipse shaped by smooth angular bumps, sized to exactly A × B and sampled as 360 radii about the boxing centre.
- Decentration comes from `boxingOffset(A, DBL, B, monocular PD, fitting height)`. The fitting height defaults to B ÷ 2.
- Front base curve follows Vogel's rule (plus: SE + 6; minus: SE ÷ 2 + 6), rounded to the nearest stocked base from 0.5 to 8 D.
- The back surface is toric. It is solved for the prescribed back-vertex power through the lens's own centre thickness, iterating up to three times. The TABO axis is mirrored for OS into the nasal lens frame.
- Thickness, volume and mass come from `js/zl-thickness.js`, a line-for-line port of `zl_thickness` 0.3.0, without prism thinning.
- Colour fringing is transverse chromatic aberration (Prentice prism ÷ Abbe number). It is given 10 mm from the optical centre in the strongest meridian, and at the worst rim point. At 0.10 Δ or more it is flagged as noticeable.
- The fringe strips spread each letter into a short spectrum at the True Vision chart's scale (0.6′ per pixel).

## Other changes

- Narrow phones: the four workspace labels wrap onto two lines at 400 px and below, instead of pushing the row off screen.
- The Tools tab script now selects only its own sub-tabs.
- Browser tests wait two animation frames after every viewport resize before measuring overflow. This removes a race that sometimes failed the 320 px checks.
- CI runs the ZL Thickness parity test, the Frame/Lens Preview geometry test and a Demotools browser test.
- The service-worker cache is now `oculi-beryl-v1.1-demotools-1`.
