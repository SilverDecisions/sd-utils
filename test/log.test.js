// Contract tests of the exported logger (the root loglevel logger) and of the
// export shapes consumers rely on.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loaded = require('./load');
const {Utils, log} = loaded;

const METHODS = ['trace', 'debug', 'info', 'warn', 'error'];

test('exports: Utils class and log', () => {
    assert.equal(typeof Utils, 'function');
    assert.equal(typeof log, 'object');
    if (loaded.standalone) {
        // dist/standalone: module.exports / SilverDecisions.Utils is Utils itself, with Utils.log
        assert.equal(loaded.standalone.log, log);
    } else {
        // index.js: export {default as log} from 'loglevel'; export * from './src/utils'
        assert.deepEqual(Object.keys(loaded.namespace).sort(), ['Utils', 'log']);
        assert.equal(loaded.namespace.__esModule, true);
    }
});

test('Utils exposes the static API used by consumers', () => {
    const used = ['assign', 'capitalizeFirstLetter', 'cartesianProductOf', 'clone', 'cloneDeep', 'cloneDeepWith',
        'cloneWith', 'compareVersionNumbers', 'cross', 'debounce', 'deepExtend', 'detectEdge', 'detectIE', 'extend',
        'fill', 'find', 'findIndex', 'flatten', 'forOwn', 'get', 'getErrorDTO', 'getGlobalObject',
        'getObjectByIdMap', 'getVariablesAsList', 'guid', 'indexesOf', 'isArray', 'isBoolean', 'isDate',
        'isFunction', 'isInt', 'isNumber', 'isNumeric', 'isObject', 'isObjectNotArray', 'isPositiveInteger',
        'isString', 'isUnique', 'isValidVersionString', 'isWorker', 'makeIterator', 'map', 'maxBy', 'mergeDeep',
        'mergeWith', 'minBy', 'reduce', 'round', 'set', 'sortBy', 'startsWith', 'stringify',
        'stripNumberToPrec', 'template', 'waitForFinalEvent'];
    for (const name of used) {
        assert.equal(typeof Utils[name], 'function', name);
    }
});

test('Utils can be extended by subclasses (sd-tree-designer / SilverDecisions AppUtils)', () => {
    class AppUtils extends Utils {
        static extra() {
            return this.isString('x');
        }
    }
    assert.equal(AppUtils.extra(), true);
    assert.equal(AppUtils.deepExtend({}, {a: 1}).a, 1);
    assert.equal(AppUtils.SQRT_2, Utils.SQRT_2);
});

test('log: loglevel root logger API', () => {
    for (const m of METHODS.concat(['setLevel', 'getLevel', 'enableAll', 'disableAll', 'setDefaultLevel', 'getLogger', 'noConflict'])) {
        assert.equal(typeof log[m], 'function', m);
    }
    assert.deepEqual(log.levels, {TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4, SILENT: 5});
});

// dist/standalone of 0.1.15 exposed a copy of the loglevel namespace as Utils.log
// (`import * as log`), whose methods did not follow setLevel().
test('log: default level is WARN and setLevel gates the console methods', {
    todo: loaded.standalone ? 'known bug: dist/standalone Utils.log ignores setLevel()' : false
}, (t) => {
    const initial = log.getLevel();
    t.after(() => log.setLevel(initial, false));
    assert.equal(initial, log.levels.WARN);

    const calls = [];
    for (const m of ['log', 'trace', 'debug', 'info', 'warn', 'error']) {
        t.mock.method(console, m, (...args) => calls.push([m, ...args]));
    }
    // loglevel binds console methods when the level is set
    log.setLevel('info', false);
    log.debug('hidden');
    log.info('shown', 1);
    log.warn('warned');
    log.error('failed', {x: 1});
    assert.deepEqual(calls, [['info', 'shown', 1], ['warn', 'warned'], ['error', 'failed', {x: 1}]]);
    assert.equal(log.getLevel(), log.levels.INFO);

    calls.length = 0;
    log.setLevel(log.levels.SILENT, false);
    for (const m of METHODS) {
        log[m]('nothing');
    }
    assert.deepEqual(calls, []);

    // loglevel throws a string here, not an Error
    assert.throws(() => log.setLevel('loud'), e => String(e).includes('invalid level'));
});

test('log: named loggers are separate from the root logger', (t) => {
    const initial = log.getLevel();
    t.after(() => log.setLevel(initial, false));
    const child = log.getLogger('sd-utils-contract-test');
    assert.equal(log.getLogger('sd-utils-contract-test'), child);
    child.setLevel('error', false);
    assert.equal(log.getLevel(), initial);
    assert.throws(() => log.getLogger(''), TypeError);
});
