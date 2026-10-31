// Loads sd-utils the way consumers get it and returns {Utils, log}.
//
// SD_UTILS_TARGET selects what is tested (default: standalone):
//   standalone  dist/standalone/sd-utils.js, UMD (CommonJS branch), exports Utils with Utils.log
//   module      dist/sd-utils.js, the bundle that defines a global `require`
//               exposing 'sd-utils' (loaded by the dist bundles of sd-model etc.)
//   standalone.min, module.min   the minified files of the same bundles
//   <file>      a CommonJS file exporting the module namespace, e.g. a Browserify
//               bundle of the installed package (scripts/check-build.js)
// SD_UTILS_DIST points at another dist/ directory (default: ./dist).
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const target = process.env.SD_UTILS_TARGET || 'standalone';
const dist = path.resolve(__dirname, '..', process.env.SD_UTILS_DIST || 'dist');

function loadModuleBundle(file) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'require');
    try {
        vm.runInThisContext(fs.readFileSync(file, 'utf8'), {filename: file});
        return globalThis.require('sd-utils');
    } finally {
        if (previous) {
            Object.defineProperty(globalThis, 'require', previous);
        } else {
            delete globalThis.require;
        }
    }
}

function load() {
    const bundle = /^(standalone|module)(\.min)?$/.exec(target);
    const file = bundle && (bundle[1] === 'standalone' ? 'standalone/sd-utils' : 'sd-utils') + (bundle[2] || '') + '.js';
    if (bundle && bundle[1] === 'standalone') {
        const Utils = require(path.join(dist, file));
        return {target, Utils, log: Utils.log, namespace: null, standalone: Utils};
    }
    const namespace = bundle
        ? loadModuleBundle(path.join(dist, file))
        : require(path.resolve(target));
    return {target, Utils: namespace.Utils, log: namespace.log, namespace, standalone: null};
}

module.exports = load();
