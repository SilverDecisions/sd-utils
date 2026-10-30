// Contract tests of Utils: the functions used by sd-model, sd-expression-engine,
// sd-computations, sd-tree-designer and SilverDecisions, with their edge cases.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {Utils} = require('./load');

test('SQRT_2 and timers are static properties', () => {
    assert.equal(Utils.SQRT_2, 1.41421356237);
    assert.equal(typeof Utils.timers, 'object');
    assert.ok(Utils.versionRegexp instanceof RegExp);
});

test('deepExtend merges plain objects recursively into the first argument', () => {
    const out = {a: 1, nested: {x: 1, y: [1, 2]}, keep: 'k'};
    const src = {a: 2, nested: {y: [3], z: {deep: true}}, extra: null};
    const result = Utils.deepExtend(out, src, undefined, {b: 'b'});
    assert.equal(result, out, 'returns the mutated first argument');
    assert.deepEqual(out, {a: 2, nested: {x: 1, y: [3], z: {deep: true}}, keep: 'k', extra: null, b: 'b'});
    assert.equal(out.nested.z, src.nested.z, 'objects missing in out are assigned by reference');
    assert.deepEqual(src, {a: 2, nested: {y: [3], z: {deep: true}}, extra: null}, 'sources are not changed');
});

test('deepExtend: arrays replace, null/undefined out creates the target', () => {
    const arr = [1, 2];
    const out = {list: [9, 9, 9]};
    Utils.deepExtend(out, {list: arr});
    assert.equal(out.list, arr);
    assert.deepEqual(Utils.deepExtend(null, {a: {b: 1}}), {a: {b: 1}});
    assert.deepEqual(Utils.deepExtend(undefined, [1, 2]), [1, 2]);
    assert.ok(Array.isArray(Utils.deepExtend(null, [1, 2])));
    assert.deepEqual(Utils.deepExtend({}), {});
    // inherited properties of the sources are skipped
    const proto = {inherited: 1};
    const source = Object.create(proto);
    source.own = 2;
    assert.deepEqual(Utils.deepExtend({}, source), {own: 2});
});

test('deepExtend replaces an object value with a non-object and vice versa', () => {
    assert.deepEqual(Utils.deepExtend({a: {x: 1}}, {a: 5}), {a: 5});
    const obj = {x: 1};
    const out = Utils.deepExtend({a: 5}, {a: obj});
    assert.equal(out.a, obj);
});

test('extend is shallow, mutates and creates the target when missing', () => {
    const a = {x: {deep: 1}, y: 1};
    const b = {x: {other: 2}};
    assert.equal(Utils.extend(a, b), a);
    assert.deepEqual(a, {x: {other: 2}, y: 1});
    assert.deepEqual(Utils.extend(null, {k: 1}), {k: 1});
    assert.deepEqual(Utils.extend({k: 1}), {k: 1});
});

test('mergeDeep returns a new object and does not mutate its arguments', () => {
    const target = {a: 1, nested: {x: 1, list: [1]}};
    const source = {nested: {y: 2, list: [2]}, added: {z: 3}};
    const result = Utils.mergeDeep(target, source);
    assert.deepEqual(result, {a: 1, nested: {x: 1, y: 2, list: [2]}, added: {z: 3}});
    assert.deepEqual(target, {a: 1, nested: {x: 1, list: [1]}});
    assert.deepEqual(source, {nested: {y: 2, list: [2]}, added: {z: 3}});
    assert.notEqual(result, target);
    assert.notEqual(result.nested, target.nested);
    assert.equal(result.added, source.added, 'objects not in target are taken by reference');
    // non-object arguments: a shallow copy of the target
    assert.deepEqual(Utils.mergeDeep({a: 1}, null), {a: 1});
    assert.deepEqual(Utils.mergeDeep({a: 1}, [1]), {a: 1});
});

test('getVariablesAsList skips functions and keeps insertion order', () => {
    const scope = {a: 1, f: () => 1, b: 'x', c: null};
    assert.deepEqual(Utils.getVariablesAsList(scope), [
        {key: 'a', value: 1}, {key: 'b', value: 'x'}, {key: 'c', value: null}
    ]);
    assert.deepEqual(Utils.getVariablesAsList(undefined), []);
});

test('cross returns the cartesian product with indexes', () => {
    assert.deepEqual(Utils.cross(['a', 'b'], [1]), [
        {x: 'a', i: 0, y: 1, j: 0}, {x: 'b', i: 1, y: 1, j: 0}
    ]);
    assert.deepEqual(Utils.cross([], [1]), []);
});

test('type predicates', () => {
    assert.equal(Utils.isObjectNotArray({}), true);
    assert.equal(Utils.isObjectNotArray([]), false);
    // falsy input is returned as is (callers only test truthiness)
    assert.equal(Utils.isObjectNotArray(null), null);
    assert.equal(Utils.isObjectNotArray(0), 0);
    assert.equal(Utils.isObjectNotArray(undefined), undefined);
    assert.equal(Utils.isObjectNotArray('s'), false);

    assert.equal(Utils.isArray([]), true);
    assert.equal(Utils.isArray({length: 0}), false);

    assert.equal(Utils.isObject({}), true);
    assert.equal(Utils.isObject([]), true);
    assert.equal(Utils.isObject(null), false);
    assert.equal(Utils.isObject(() => 1), false);

    assert.equal(Utils.isNumber(1.5), true);
    assert.equal(Utils.isNumber(Infinity), true);
    assert.equal(Utils.isNumber(NaN), false);
    assert.equal(Utils.isNumber('1'), false);
    assert.equal(Utils.isNumber(new Number(1)), false);

    assert.equal(Utils.isNumeric('1.5'), true);
    assert.equal(Utils.isNumeric(' 2 '), true);
    assert.equal(Utils.isNumeric('1e3'), true);
    assert.equal(Utils.isNumeric('Infinity'), false);
    assert.equal(Utils.isNumeric(''), false);
    assert.equal(Utils.isNumeric('1a'), false);
    assert.equal(Utils.isNumeric(null), false);

    assert.equal(Utils.isInt(3), true);
    assert.equal(Utils.isInt(-0), true);
    assert.equal(Utils.isInt(3.5), false);
    assert.equal(Utils.isInt('3'), false);
    assert.equal(Utils.isInt(Infinity), false);

    assert.equal(Utils.isFunction(function () {}), true);
    assert.equal(Utils.isFunction(class {}), true);
    assert.equal(Utils.isFunction({}), false);

    assert.equal(Utils.isDate(new Date(0)), true);
    assert.equal(Utils.isDate(Date.now()), false);

    assert.equal(Utils.isString(''), true);
    assert.equal(Utils.isString(new String('x')), true);
    assert.equal(Utils.isString(1), false);

    assert.equal(Utils.isBoolean(false), true);
    assert.equal(Utils.isBoolean(0), false);

    assert.equal(Utils.isPositiveInteger('0'), true);
    assert.equal(Utils.isPositiveInteger('12'), true);
    assert.equal(Utils.isPositiveInteger(7), true);
    assert.equal(Utils.isPositiveInteger('-1'), false);
    assert.equal(Utils.isPositiveInteger('1.0'), false);
    assert.equal(Utils.isPositiveInteger(''), false);
});

test('guid: 8-4-4-4-12 lowercase hex built from Math.random', (t) => {
    const values = [];
    for (let i = 0; i < 8; i++) {
        values.push(i / 8);
    }
    const queue = values.slice();
    t.mock.method(Math, 'random', () => queue.shift());
    // s4() = floor((1 + r) * 0x10000).toString(16).substring(1)
    assert.equal(Utils.guid(), '0000' + '2000' + '-4000-6000-8000-' + 'a000' + 'c000' + 'e000');
    assert.equal(queue.length, 0, 'eight Math.random calls');
});

test('guid format with the real Math.random', () => {
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const seen = new Set();
    for (let i = 0; i < 50; i++) {
        const g = Utils.guid();
        assert.match(g, re);
        seen.add(g);
    }
    assert.equal(seen.size, 50);
});

test('capitalizeFirstLetter', () => {
    assert.equal(Utils.capitalizeFirstLetter('abc'), 'Abc');
    assert.equal(Utils.capitalizeFirstLetter(''), '');
    assert.throws(() => Utils.capitalizeFirstLetter(undefined), TypeError);
});

test('getObjectByIdMap', () => {
    const list = [{id: 'a', v: 1}, {id: 'b', v: 2}, {key: 'c', id: 'a', v: 3}];
    assert.deepEqual(Utils.getObjectByIdMap(list), {a: list[2], b: list[1]});
    assert.deepEqual(Utils.getObjectByIdMap(list, o => o.v), {a: 3, b: 2});
    assert.deepEqual(Utils.getObjectByIdMap([{key: 'k'}], null, 'key'), {k: {key: 'k'}});
    assert.deepEqual(Utils.getObjectByIdMap(null), {});
});

test('waitForFinalEvent runs only the last callback per id and returns a canceller', (t) => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const calls = [];
    Utils.waitForFinalEvent(() => calls.push(1), 'contract-id', 100);
    t.mock.timers.tick(50);
    Utils.waitForFinalEvent(() => calls.push(2), 'contract-id', 100);
    t.mock.timers.tick(99);
    assert.deepEqual(calls, []);
    t.mock.timers.tick(1);
    assert.deepEqual(calls, [2]);

    const cancel = Utils.waitForFinalEvent(() => calls.push(3), 'contract-id-2');
    cancel();
    t.mock.timers.tick(1000);
    assert.deepEqual(calls, [2], 'default delay 50 ms, cancelled');

    Utils.waitForFinalEvent(() => calls.push(4));
    t.mock.timers.tick(50);
    assert.deepEqual(calls, [2, 4], 'works without an id');
});

test('detectIE / detectEdge read window.navigator.userAgent', (t) => {
    const hadWindow = 'window' in globalThis;
    const previous = globalThis.window;
    t.after(() => {
        if (hadWindow) {
            globalThis.window = previous;
        } else {
            delete globalThis.window;
        }
    });
    const ua = s => { globalThis.window = {navigator: {userAgent: s}}; };
    ua('Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1)');
    assert.equal(Utils.detectIE(), 8);
    ua('Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko');
    assert.equal(Utils.detectIE(), 11);
    ua('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/42.0 Safari/537.36 Edge/12.10240');
    assert.equal(Utils.detectIE(), false);
    assert.equal(Utils.detectEdge(), 12);
    ua('Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0 Safari/537.36');
    assert.equal(Utils.detectIE(), false);
    assert.equal(Utils.detectEdge(), false);
});

test('stripNumberToPrec rounds to significant digits', () => {
    assert.equal(Utils.stripNumberToPrec(0.1 + 0.2), 0.3);
    assert.equal(Utils.stripNumberToPrec(1 / 3, 3), 0.333);
    assert.equal(Utils.stripNumberToPrec('2.50000000000001'), 2.5);
    assert.equal(Utils.stripNumberToPrec(123456789, 3), 123000000);
    assert.ok(Number.isNaN(Utils.stripNumberToPrec('abc')));
});

test('getGlobalObject / isWorker in Node', () => {
    assert.equal(Utils.getGlobalObject(), globalThis);
    assert.equal(Utils.isWorker(), false);
});

test('stringify: Infinity, filtered prefixes, cycles, replacers, 2-space indent', () => {
    const obj = {a: Infinity, b: -Infinity, $hidden: 1, keep: {$x: 2, y: 3}, n: null};
    assert.equal(Utils.stringify(obj),
        '{\n  "a": "Infinity",\n  "b": "-Infinity",\n  "keep": {\n    "y": 3\n  },\n  "n": null\n}');
    assert.equal(Utils.stringify({$a: 1, _b: 2}, null, ['_']), '{\n  "$a": 1\n}');
    assert.equal(Utils.stringify({$a: 1}, null, null), '{\n  "$a": 1\n}');

    const cyclic = {name: 'c'};
    cyclic.self = cyclic;
    cyclic.list = [cyclic, 1];
    assert.equal(Utils.stringify(cyclic), '{\n  "name": "c",\n  "list": [\n    null,\n    1\n  ]\n}');

    // a repeated (not cyclic) reference is dropped too
    const shared = {v: 1};
    assert.equal(Utils.stringify({a: shared, b: shared}), '{\n  "a": {\n    "v": 1\n  }\n}');

    assert.equal(Utils.stringify({a: 1, b: 2}, (k, v) => k === 'a' ? v * 10 : v), '{\n  "a": 10,\n  "b": 2\n}');
    assert.equal(Utils.stringify({a: 1}, [(k, v) => k === 'a' ? v + 1 : v, (k, v) => k === 'a' ? v * 10 : v]),
        '{\n  "a": 20\n}');
});

test('isValidVersionString accepts only x.y.z with digits', () => {
    for (const v of ['0.0.0', '1.2.1', '10.20.30', '01.2.3']) {
        assert.equal(Utils.isValidVersionString(v), true, v);
    }
    for (const v of ['1.2', '1.2.3.4', '1.2.3-beta', '1.2.3-beta.1', '1.2.3+build', 'v1.2.3', ' 1.2.3', '1.2.x', '', null, undefined, 123]) {
        assert.equal(Utils.isValidVersionString(v), false, String(v));
    }
});

test('compareVersionNumbers: equal and simple order', () => {
    assert.equal(Utils.compareVersionNumbers('1.2.1', '1.2.1'), 0);
    assert.equal(Utils.compareVersionNumbers('1.2.1', '1.2.0'), 1);
    assert.equal(Utils.compareVersionNumbers('0.6.9', '0.7.0'), -1);
    assert.equal(Utils.compareVersionNumbers('1.0.0', '0.9.9'), 1);
    // SilverDecisions App.openDiagram: file version vs App.version and vs "0.7.0"
    assert.equal(Utils.compareVersionNumbers('0.5.2', '0.7.0'), -1);
    assert.equal(Utils.compareVersionNumbers('1.2.1', '0.7.0'), 1);
    assert.equal(Utils.compareVersionNumbers('2.0.0', '1.2.1'), 1);
});

test('compareVersionNumbers: a missing trailing part sorts first', () => {
    assert.equal(Utils.compareVersionNumbers('1.0', '1.0.0'), -1);
    assert.equal(Utils.compareVersionNumbers('1.0.0', '1.0'), 1);
});

test('compareVersionNumbers: NaN for parts that are not non-negative integers (pre-release suffixes)', () => {
    // SilverDecisions treats such versions as invalid (isValidVersionString) and
    // does not compare them; compareVersionNumbers reports them as not comparable.
    for (const [a, b] of [['1.2.3-beta.1', '1.2.3'], ['1.2.3', '1.2.3-beta.1'], ['1.2.3-rc.1', '1.2.3-rc.2'],
        ['1.2.x', '1.2.3'], ['-1.0.0', '1.0.0'], ['1..0', '1.0.0']]) {
        assert.ok(Number.isNaN(Utils.compareVersionNumbers(a, b)), a + ' vs ' + b);
    }
});

// Regression: 0.1.15 compared the parts as strings, so 1.10.0 < 1.9.0.
test('compareVersionNumbers compares parts numerically', () => {
    assert.equal(Utils.compareVersionNumbers('1.9.0', '1.10.0'), -1);
    assert.equal(Utils.compareVersionNumbers('1.10.0', '1.9.0'), 1);
    assert.equal(Utils.compareVersionNumbers('1.2.10', '1.2.9'), 1);
    assert.equal(Utils.compareVersionNumbers('9.0.0', '10.0.0'), -1);
    assert.equal(Utils.compareVersionNumbers('1.02.0', '1.2.0'), 0);
});

test('makeIterator', () => {
    const it = Utils.makeIterator(['a', 'b']);
    assert.deepEqual(it.next(), {value: 'a', done: false});
    assert.deepEqual(it.next(), {value: 'b', done: false});
    assert.deepEqual(it.next(), {done: true});
    assert.deepEqual(it.next(), {done: true});
});

test('isUnique', () => {
    assert.equal(Utils.isUnique([{n: 'a'}, {n: 'b'}], v => v.n), true);
    assert.equal(Utils.isUnique([{n: 'a'}, {n: 'a'}], v => v.n), false);
    assert.equal(Utils.isUnique([], v => v), true);
});

test('getErrorDTO', () => {
    class CustomError extends Error {
        constructor(message, data) {
            super(message);
            this.data = data;
        }
    }
    assert.deepEqual(Utils.getErrorDTO(new TypeError('bad')), {name: 'TypeError', message: 'bad', data: undefined});
    assert.deepEqual(Utils.getErrorDTO(new CustomError('m', {x: 1})), {name: 'CustomError', message: 'm', data: {x: 1}});
    assert.equal(Utils.getErrorDTO(null), null);
    assert.equal(Utils.getErrorDTO(undefined), undefined);
});

test('cartesianProductOf does not mutate its input', () => {
    const input = [[1, 2], ['a'], [true, false]];
    const copy = JSON.parse(JSON.stringify(input));
    assert.deepEqual(Utils.cartesianProductOf(input), [
        [1, 'a', true], [1, 'a', false], [2, 'a', true], [2, 'a', false]
    ]);
    assert.deepEqual(input, copy);
    assert.deepEqual(Utils.cartesianProductOf([]), [[]]);
    assert.deepEqual(Utils.cartesianProductOf([[1], []]), []);
});

test('indexesOf uses strict equality', () => {
    assert.deepEqual(Utils.indexesOf([1, '1', 1, NaN], 1), [0, 2]);
    assert.deepEqual(Utils.indexesOf([NaN], NaN), []);
    assert.deepEqual(Utils.indexesOf([], 1), []);
});

test('wrapped lodash methods pass all arguments through', () => {
    assert.equal(Utils.startsWith('abc', 'b', 1), true);
    assert.equal(Utils.find([{a: 1}, {a: 2}], {a: 2}).a, 2);
    assert.equal(Utils.find([1, 2, 3], v => v > 1, 2), 3);
    assert.equal(Utils.findIndex([1, 2], v => v === 2), 1);
    assert.deepEqual(Utils.fill([1, 2, 3], 0, 1), [1, 0, 0]);
    assert.deepEqual(Utils.assign({a: 1}, {b: 2}, {a: 3}), {a: 3, b: 2});

    const original = {a: {b: [1, {c: 2}]}};
    const deep = Utils.cloneDeep(original);
    assert.deepEqual(deep, original);
    assert.notEqual(deep.a.b[1], original.a.b[1]);
    const shallow = Utils.clone(original);
    assert.equal(shallow.a, original.a);
    assert.deepEqual(Utils.cloneDeepWith({a: 1, b: {c: 2}}, v => typeof v === 'number' ? v * 2 : undefined), {a: 2, b: {c: 4}});
    assert.deepEqual(Utils.cloneWith({a: 1}, () => undefined), {a: 1});

    const merged = Utils.mergeWith({a: [1]}, {a: [2]}, (o, s) => Array.isArray(o) ? o.concat(s) : undefined);
    assert.deepEqual(merged, {a: [1, 2]});

    const keys = [];
    Utils.forOwn({x: 1, y: 2}, (v, k) => { keys.push(k + v); });
    assert.deepEqual(keys, ['x1', 'y2']);

    assert.equal(Utils.get({a: [{b: 5}]}, 'a[0].b'), 5);
    assert.equal(Utils.get({}, 'a.b', 'def'), 'def');
    const target = {};
    assert.equal(Utils.set(target, 'a.b[1]', 7), target);
    assert.equal(target.a.b.length, 2);
    assert.equal(target.a.b[1], 7);
    assert.equal(0 in target.a.b, false);

    assert.equal(Utils.reduce([1, 2, 3], (s, v) => s + v, 0), 6);
    assert.deepEqual(Utils.flatten([1, [2, [3]]]), [1, 2, [3]]);
    assert.deepEqual(Utils.map({a: 1, b: 2}, v => v * 2), [2, 4]);
    assert.deepEqual(Utils.maxBy([{v: 1}, {v: 3}], 'v'), {v: 3});
    assert.deepEqual(Utils.minBy([{v: 1}, {v: 3}], o => o.v), {v: 1});
    assert.equal(Utils.round(4.006, 2), 4.01);
    assert.equal(Utils.round(1.005, 2), 1.01);
    assert.deepEqual(Utils.sortBy([{n: 'b'}, {n: 'a'}], 'n'), [{n: 'a'}, {n: 'b'}]);
});

test('template (lodash _.template) with the default delimiters', () => {
    const compiled = Utils.template('<b><%- name %></b><%= raw %><% if (n > 1) { %>many<% } %>');
    assert.equal(compiled({name: '<x>', raw: '<i>', n: 2}), '<b>&lt;x&gt;</b><i>many');
    assert.equal(Utils.template('${a}')({a: 1}), '1');
});

test('debounce (lodash _.debounce) delays and collapses calls', (t) => {
    t.mock.timers.enable({apis: ['setTimeout', 'Date']});
    const calls = [];
    const fn = Utils.debounce(v => calls.push(v), 100);
    fn(1);
    fn(2);
    t.mock.timers.tick(99);
    assert.deepEqual(calls, []);
    t.mock.timers.tick(1);
    assert.deepEqual(calls, [2]);
    fn(3);
    fn.cancel();
    t.mock.timers.tick(200);
    assert.deepEqual(calls, [2]);
});
