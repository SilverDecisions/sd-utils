# sd-utils
SilverDecisions utils module.

## Usage

The package entry point is the source: `index.js` exports `Utils` (static
helper methods) and `log` (the [loglevel](https://github.com/pimterry/loglevel)
root logger). Consumers bundle it with browserify; the `browserify.transform`
field compiles `index.js` and `src/` with Babel to ES5 (class fields as
assignments).

```js
import {Utils, log} from 'sd-utils';
```

Prebuilt bundles in `dist/`:

| File | Format |
|---|---|
| `dist/sd-utils(.min).js` | assigns a global `require`; `require('sd-utils')` returns `{Utils, log}` (format of browserify's `require` option, loaded by the `dist/` bundles of sd-model and other modules) |
| `dist/standalone/sd-utils(.min).js` | UMD: `Utils` with `Utils.log` as `module.exports`, AMD module or global `SilverDecisions.Utils` |

The plain files have inline source maps, the minified files external `.map` files.

## Development

Node 24 (`.nvmrc`); CI also builds and tests on Node 22. The library itself
runs in browsers (ES5 output) and does not require a Node version.

```bash
npm ci
npm run build        # clean dist/, Rollup (rollup.config.mjs) with Babel 7
npm test             # node:test contract tests against dist/ (run the build first)
npm run test:build   # isolated build check, see scripts/check-build.js
```

`npm test` tests `dist/standalone/sd-utils.js` by default. `SD_UTILS_TARGET`
selects another bundle: `module` (`dist/sd-utils.js`), `standalone.min` and
`module.min` (the minified files), or a CommonJS file exporting the module
(used for a browserify bundle of the packed package). `SD_UTILS_DIST` points
at another `dist/` directory.

`npm run test:build` (CI on Linux) copies the working tree, runs `npm ci` and
the build, checks the six artifacts (ES5, parsed source maps) and that nothing
outside `dist/` changed, runs the tests against the four bundles (plain and
minified), packs the package, installs the tarball into an empty consumer that
bundles it with browserify + babelify like SilverDecisions and tests that
bundle, and checks that a syntax error fails the build with a non-zero exit
code. Windows CI runs a smoke build, the tests on the four bundles and the
check without the consumer install.

`dist/` is committed and rebuilt by the release (`release-it` runs
`npm run build` after the version bump). Until then it is the build of the
last release, which predates the fixes in [CHANGELOG.md](CHANGELOG.md), so
test changes on a fresh build (`npm run build`, `npm run test:build`).
