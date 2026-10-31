# Changelog

## Unreleased

Changes since `0.1.15`. The version number is not changed yet, and the
committed `dist/` is still the `0.1.15` build.

### Behaviour changes (bug fixes)

- `Utils.compareVersionNumbers` compares the version parts as numbers:
  `compareVersionNumbers('1.9.0', '1.10.0')` is `-1` (was `1`), and
  `'1.02.0'` equals `'1.2.0'`. Versions with non-numeric parts (pre-release
  suffixes such as `1.2.3-beta.1`) still give `NaN`; `isValidVersionString`
  still accepts only `x.y.z`. In SilverDecisions (`App.openDiagram`) a file
  saved by version 1.10.0 is now reported as newer than application 1.2.1,
  and a file of version 0.10.0 is no longer read with the pre-0.7.0 format.
- `dist/standalone`: `Utils.log` is the loglevel root logger (as `log` of
  `index.js`). It was a copy of the loglevel module namespace whose methods
  did not follow `setLevel()`.

### Dependencies and build

- `lodash` `^4.18.1` (security fixes only: prototype pollution in
  `_.unset`/`_.omit`, `_.template` imports validation); `loglevel` stays
  `^1.7.1` (the bundles contain 1.9.2).
- The bundles are built with Rollup and Babel 7 instead of gulp/browserify,
  with the same formats, global names and ES5 output.

### Release notes for SilverDecisions

- `App.serialize` writes `App.version` (from `package.json`) to the
  `SilverDecisions` field, and `App.openDiagram` accepts only `x.y.z` there
  (`isValidVersionString`). An application released with a pre-release
  version (e.g. `1.3.0-beta.1`) would save files that it reports as having
  an incorrect version format. Release SilverDecisions with a stable
  `x.y.z` version, or write the `x.y.z` part in `App.serialize`, before
  relying on pre-release versions.
