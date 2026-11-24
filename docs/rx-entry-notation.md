# Rx entry notation and pinhole availability

Form revision: `zero-axis-pinhole-1`.

- A known 0.00 D cylinder sets the axis to 0° and disables its picker. This applies to AR repeats, the selected AR line, previous Rx, final Rx, and scanned imports.
- Previous/final Rx retain their existing sphere-only shortcut: a sphere with blank optional cylinder means 0.00 D cylinder and 0° axis. Blank AR cylinder is still incomplete, not zero.
- Changing to a nonzero cylinder re-enables axis entry and clears the zero placeholder; a direction from 1° through 180° is required. Clearing a row removes its automatic zero.
- Distance VA of 1.0 (20/20) or better clears and disables pinhole for that eye. Reduced or blank distance VA re-enables it without restoring a stale measurement. Cancellation stores an empty value, not a fabricated 20/20 measurement. This is the requested collection workflow, not a claim about the clinical need for any other examination.
- Newly generated sphere-only predictions use 0° notation in comparison and exports, including shadow/alternative predictions. The engine functions themselves still return their original values. No power, vector, offset, threshold or scoring rule is changed. Sphere-only axis remains not applicable in cylinder-aware scoring; legacy study scoring retains its frozen semantics.
- New case records carry `entryRevision: "zero-axis-pinhole-1"` in the full JSON export. The existing CSV headers, algorithm version and candidate cohort are unchanged. Historical records and their exports are not rewritten.

The v0.2 freeze contract remains intact: `js/algorithm.js` and `js/config.js` are unchanged. The v0.3 source model/configuration are also unchanged and are carried forward by Beryl v1.1.1. The browser regression covers entry transitions, per-eye pinhole cancellation, scanner imports, reset, storage/export, and historical-record preservation. The standalone optical calculator retains DS notation for sphere-only results.
