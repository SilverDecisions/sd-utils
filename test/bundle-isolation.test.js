// Isolation of the module bundle dist/sd-utils(.min).js. The bundle joins the global
// `require` chain (format of browserify's `require` option) and must keep its
// module cache and factories in its own closure. Each case runs the files as
// classic scripts in a fresh vm context and checks behaviour, not variable names.
// Runs for the module and module.min targets (SD_UTILS_TARGET).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const NAME = 'sd-utils';
const target = process.env.SD_UTILS_TARGET || 'standalone';
const root = path.resolve(__dirname, '..');
const dist = path.resolve(root, process.env.SD_UTILS_DIST || 'dist');
const min = /^module(\.min)?$/.exec(target);
const skip = min ? false : 'module bundle targets only';
const bundle = path.join(dist, NAME + (min && min[1] ? '.min' : '') + '.js');

// module bundles this one requires, loaded before it
const DEPENDENCIES = [];
const DEPENDENCY_NAMES = [];
// globals the bundle may add when its API is used, besides `require`
const AFTER_USE = [];
// API calls on `exports` in the context; EXPECTED is the string they return
const USE = 'return JSON.stringify([exports.Utils.isString("a"), exports.Utils.isString(1), ' +
    'exports.Utils.isValidVersionString("1.2.0"), exports.Utils.isValidVersionString("1.2"), typeof exports.log.getLevel()]);';
const EXPECTED = '[true,false,true,false,"number"]';
// lodash and loglevel (in sd-utils) read the global `window` when evaluated
const LAZY = {
    setup: 'var windowReads = 0; Object.defineProperty(this, "window", {configurable: true, get: function () { windowReads++; return undefined; }});',
    evaluated: 'windowReads > 0',
    require: 'require(' + JSON.stringify(NAME) + ')'
};

const code = new Map();
function script(file) {
    if (!code.has(file)) {
        code.set(file, new vm.Script(fs.readFileSync(file, 'utf8'), {filename: file}));
    }
    return code.get(file);
}

// A fresh global scope; Math.random returns 0.5.
function context() {
    const ctx = vm.createContext({});
    const run = (src) => vm.runInContext(src, ctx);
    run('Math.random = function () { return 0.5; };');
    const names = () => Object.getOwnPropertyNames(run('this')).sort();
    return {ctx, run, names, load: (file) => script(file).runInContext(ctx)};
}

const added = (before, after) => after.filter(n => !before.includes(n));

// a `require` defined before the bundles, as browserify defines it
const BEFORE = `require = function (id, jumped) {
    calls.push([id, jumped]);
    if (id === 'iso-before') { return before; }
    var error = new Error("Cannot find module '" + id + "'");
    error.code = 'MODULE_NOT_FOUND';
    throw error;
};`;
// a `require` bundle loaded after them
const AFTER = `require = (function (previous) {
    var own = {exports: after};
    function newRequire(id, jumped) {
        if (id === 'iso-after') { return own.exports; }
        var current = typeof require === 'function' && require;
        if (!jumped && current && current !== newRequire) { return current(id, true); }
        if (previous) { return previous(id, true); }
        var error = new Error("Cannot find module '" + id + "'");
        error.code = 'MODULE_NOT_FOUND';
        throw error;
    }
    return newRequire;
})(typeof require === 'function' && require);`;

test('adds only `require` to the global scope, also after its API is used', {skip}, () => {
    const c = context();
    const before = c.names();
    DEPENDENCIES.forEach(c.load);
    c.load(bundle);
    assert.deepEqual(added(before, c.names()), ['require']);
    assert.equal(c.run('(function (exports) {' + USE + '})(require(' + JSON.stringify(NAME) + '))'), EXPECTED);
    assert.deepEqual(added(before, c.names()), ['require'].concat(AFTER_USE).sort());
});

test('keeps its exports and cache when the same bundle is loaded again after it', {skip}, () => {
    const c = context();
    DEPENDENCIES.forEach(c.load);
    c.load(bundle);
    c.run('var first = require, exportsOfFirst = first(' + JSON.stringify(NAME) + ');');
    c.run(DEPENDENCY_NAMES.map(n => 'var dep_' + n.replace(/-/g, '_') + ' = first(' + JSON.stringify(n) + ');').join('\n'));
    c.load(bundle);
    const result = JSON.parse(c.run(`(function (name) {
        var second = require, exportsOfSecond = second(name);
        return JSON.stringify({
            newRequire: second !== first,
            firstCached: first(name) === exportsOfFirst,
            secondOwn: exportsOfSecond !== exportsOfFirst && second(name) === exportsOfSecond,
            dependenciesShared: [${DEPENDENCY_NAMES.map(n => `first('${n}') === dep_${n.replace(/-/g, '_')} && second('${n}') === dep_${n.replace(/-/g, '_')}`).concat('true').join(', ')}].every(Boolean),
            firstWorks: (function (exports) {${USE}})(exportsOfFirst),
            secondWorks: (function (exports) {${USE}})(exportsOfSecond)
        });
    })(${JSON.stringify(NAME)})`));
    assert.deepEqual(result, {newRequire: true, firstCached: true, secondOwn: true, dependenciesShared: true,
        firstWorks: EXPECTED, secondWorks: EXPECTED});
});

test('passes other names to the require defined before it and to a require bundle loaded after it', {skip}, () => {
    const c = context();
    c.run('var calls = [], before = {}, after = {};');
    c.run(BEFORE);
    DEPENDENCIES.forEach(c.load);
    c.load(bundle);
    c.run('var own = require, exportsOfOwn = own(' + JSON.stringify(NAME) + ');');
    assert.equal(c.run('own("iso-before") === before'), true);
    assert.deepEqual(JSON.parse(c.run('JSON.stringify(calls)')), [['iso-before', true]]);
    c.run(AFTER);
    assert.equal(c.run('own("iso-after") === after'), true);
    assert.equal(c.run('require(' + JSON.stringify(NAME) + ') === exportsOfOwn && own(' + JSON.stringify(NAME) + ') === exportsOfOwn'), true);
    const error = JSON.parse(c.run('(function () { try { own("iso-missing"); } catch (e) { return JSON.stringify({code: e.code, message: e.message}); } })()'));
    assert.deepEqual(error, {code: 'MODULE_NOT_FOUND', message: "Cannot find module 'iso-missing'"});
});

test('throws MODULE_NOT_FOUND for unknown names when it is the first require', {skip}, () => {
    const c = context();
    DEPENDENCIES.forEach(c.load);
    c.load(bundle);
    const error = JSON.parse(c.run('(function () { try { require("iso-missing"); } catch (e) { return JSON.stringify({code: e.code, message: e.message}); } })()'));
    assert.deepEqual(error, {code: 'MODULE_NOT_FOUND', message: "Cannot find module 'iso-missing'"});
});

test('evaluates the module on the first require, not when the file is loaded', {skip}, () => {
    const c = context();
    c.run(LAZY.setup);
    DEPENDENCIES.forEach(c.load);
    c.load(bundle);
    assert.equal(c.run(LAZY.evaluated), false);
    c.run(LAZY.require);
    assert.equal(c.run(LAZY.evaluated), true);
});
