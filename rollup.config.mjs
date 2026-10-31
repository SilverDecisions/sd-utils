// JavaScript build (`npm run build`). Each bundle is written as a plain file with
// an inline source map and as a minified file with an external .map, like the
// previous gulp/browserify build:
//   dist/sd-utils(.min).js             defines a global `require` that returns the
//                                      exports of index.js for require('sd-utils')
//                                      (format of browserify's `require` option, used
//                                      by the dist bundles of sd-model and others)
//   dist/standalone/sd-utils(.min).js  UMD of standalone.index.js: Utils with Utils.log,
//                                      as module.exports, AMD module or SilverDecisions.Utils
import {babel} from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import {requireBundle} from './scripts/require-bundle.mjs';

const NAME = 'sd-utils';

// The Babel options of the `browserify.transform` field in package.json, which
// consumers use to compile index.js and src/: ES5 (no targets), class fields as
// assignments. node_modules (lodash, loglevel) are ES5 already and not compiled.
const babelPlugin = () => babel({
    babelHelpers: 'bundled',
    babelrc: false,
    configFile: false,
    exclude: /[\\/]node_modules[\\/]/,
    presets: ['@babel/preset-env'],
    plugins: [
        'transform-class-properties',
        'transform-object-assign',
        ['babel-plugin-transform-builtin-extend', {globals: ['Error']}]
    ]
});

const plugins = () => [
    nodeResolve(),
    commonjs({transformMixedEsModules: true}),
    babelPlugin()
];

function outputs(file, output) {
    return [
        Object.assign({file: file + '.js', sourcemap: 'inline'}, output),
        Object.assign({file: file + '.min.js', sourcemap: true, plugins: [terser()]}, output)
    ];
}

export default [
    {
        input: 'index.js',
        plugins: plugins().concat([requireBundle(NAME)]),
        output: outputs('dist/' + NAME, {format: 'cjs', exports: 'named', esModule: true})
    },
    {
        input: 'standalone.index.js',
        plugins: plugins(),
        output: outputs('dist/standalone/' + NAME, {format: 'umd', name: 'SilverDecisions.Utils', extend: true, exports: 'default'})
    }
];
