#!/usr/bin/env node
// Build check in an isolated copy (`npm run test:build`, used by CI):
//
//  1. copy the files of the working tree (git ls-files) to a temp dir, `npm ci` there
//  2. `npm run build`: exit code 0, no Rollup warnings
//  3. all dist artifacts exist, are ES5 and have their source maps
//  4. the build changed nothing outside dist/
//  5. the tests against both fresh bundles (dist/standalone and dist/<name>.js)
//  6. a syntax error injected into the sources fails `npm run build` with a
//     non-zero exit code and a diagnostic naming the file, nothing outside dist/ changes
//  7. `npm pack`: the tarball contains the entry points, sources and dist; it is
//     installed into an empty consumer that bundles it with browserify + babelify
//     (the package's browserify.transform field, like SilverDecisions), and the
//     tests run against that bundle
//
// Usage: node scripts/check-build.js [--keep] [--skip-consumer]
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {spawnSync, execFileSync} = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const NAME = pkg.name;
const TARGET_ENV = NAME.toUpperCase().replace(/-/g, '_') + '_TARGET';
const ERROR_FILE = pkg.name === 'sd-utils' ? 'src/utils.js' : 'src/sd-random.js';
const ARTIFACTS = ['', 'standalone/'].reduce((list, dir) => list.concat(
    ['.js', '.min.js', '.min.js.map'].map(ext => 'dist/' + dir + NAME + ext)), []);
// what consumers bundle: the entry points and the sources they import
const PACKED = ['package.json', 'README.md', 'LICENSE', 'index.js', 'standalone.index.js', ERROR_FILE].concat(ARTIFACTS);
// the toolchain SilverDecisions and the sd-* modules compile the package with
const CONSUMER_DEPS = ['browserify@17', 'babelify@10', '@babel/core@7', '@babel/preset-env@7',
    'babel-plugin-transform-class-properties@6', 'babel-plugin-transform-object-assign@6',
    'babel-plugin-transform-builtin-extend@1'];

const args = new Set(process.argv.slice(2));
const failures = [];
const fail = msg => {
    failures.push(msg);
    console.error('FAIL ' + msg);
};
const ok = msg => console.log('ok   ' + msg);

// npm as `node npm-cli.js`: on Windows `npm` is a .cmd file that spawnSync cannot
// run without a shell. npm_execpath is set when this runs as an npm script.
const NPM_CLI = [process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')]
    .find(p => p && /npm-cli\.js$/.test(p) && fs.existsSync(p));

function run(cmd, cmdArgs, opts) {
    const r = spawnSync(cmd, cmdArgs, Object.assign({encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}, opts));
    return {status: r.status, stdout: r.stdout || '', log: (r.stdout || '') + (r.stderr || '')};
}

function npm(npmArgs, opts) {
    if (!NPM_CLI) {
        throw new Error('npm-cli.js not found next to ' + process.execPath);
    }
    return run(process.execPath, [NPM_CLI].concat(npmArgs), opts);
}

function hashTree(dir, skip) {
    const out = {};
    (function walk(rel) {
        for (const e of fs.readdirSync(path.join(dir, rel), {withFileTypes: true})) {
            const r = rel ? rel + '/' + e.name : e.name;
            if (skip.some(s => r === s || r.startsWith(s + '/'))) {
                continue;
            }
            if (e.isDirectory()) {
                walk(r);
            } else {
                out[r] = crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, r))).digest('hex');
            }
        }
    })('');
    return out;
}

function changedOutsideDist(dir, before) {
    const after = hashTree(dir, ['node_modules', 'dist']);
    return [...new Set(Object.keys(before).concat(Object.keys(after)))].filter(f => before[f] !== after[f]);
}

function copyTree(dest) {
    const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {cwd: root, encoding: 'utf8'})
        .split('\0').filter(f => f && fs.existsSync(path.join(root, f)));
    for (const f of files) {
        fs.mkdirSync(path.join(dest, path.dirname(f)), {recursive: true});
        fs.copyFileSync(path.join(root, f), path.join(dest, f));
    }
    return files.length;
}

function isES5(file) {
    const acorn = require(require.resolve('acorn', {paths: [root]}));
    try {
        acorn.parse(fs.readFileSync(file, 'utf8'), {ecmaVersion: 5});
        return null;
    } catch (e) {
        return e.message;
    }
}

function runTests(dir, target) {
    // TAP: the default reporter of Node 24 prints no summary lines to parse
    const r = run(process.execPath, ['--test', '--test-reporter=tap', 'test/**/*.test.js'], {
        cwd: dir, env: Object.assign({}, process.env, {[TARGET_ENV]: target})
    });
    const count = name => (r.log.match(new RegExp('^# ' + name + ' (\\d+)', 'm')) || [])[1];
    const summary = 'tests ' + count('tests') + ', pass ' + count('pass') + ', fail ' + count('fail') + ', todo ' + count('todo');
    if (r.status === 0 && count('fail') === '0') {
        ok('tests on ' + target + ': ' + summary);
    } else {
        console.error(r.log.split('\n').filter(l => /^not ok|error:|expected|actual/.test(l)).slice(0, 30).join('\n'));
        fail('tests on ' + target + ': ' + summary);
    }
}

function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), NAME + '-check-'));
    const copy = path.join(tmp, 'copy');
    console.log('isolated copy: ' + copy);
    try {
        // 1
        ok('copied ' + copyTree(copy) + ' files');
        let r = npm(['ci', '--no-audit', '--no-fund'], {cwd: copy});
        if (r.status !== 0) {
            console.error(r.log);
            fail('npm ci exited with ' + r.status);
            return;
        }
        ok('npm ci');

        // 2
        const before = hashTree(copy, ['node_modules', 'dist']);
        r = npm(['run', 'build'], {cwd: copy});
        if (r.status !== 0) {
            console.error(r.log);
            fail('npm run build exited with ' + r.status);
            return;
        }
        const warnings = r.log.split('\n').filter(l => /^\(!\)|\[!\]/.test(l.replace(/\u001b\[[\d;]*m/g, '')));
        warnings.length ? fail('build warnings:\n' + warnings.join('\n')) : ok('npm run build, no warnings');

        // 3
        for (const a of ARTIFACTS) {
            const f = path.join(copy, a);
            if (!fs.existsSync(f) || !fs.statSync(f).size) {
                fail(a + ' missing or empty');
                continue;
            }
            if (a.endsWith('.js')) {
                const err = isES5(f);
                err ? fail(a + ' is not ES5: ' + err) : null;
                const code = fs.readFileSync(f, 'utf8');
                const map = a.endsWith('.min.js') ? path.basename(a) + '.map' : 'data:application/json';
                code.includes('//# sourceMappingURL=' + map) ? null : fail(a + ': no source map reference to ' + map);
            }
        }
        const extra = fs.readdirSync(path.join(copy, 'dist'), {recursive: true})
            .map(f => 'dist/' + String(f).split(path.sep).join('/'))
            .filter(f => fs.statSync(path.join(copy, f)).isFile() && !ARTIFACTS.includes(f));
        extra.length ? fail('unexpected files in dist/: ' + extra.join(', ')) : null;
        ok(ARTIFACTS.length + ' artifacts checked (ES5, source maps)');

        // 4
        const changed = changedOutsideDist(copy, before);
        changed.length ? fail('build changed files outside dist/: ' + changed.join(', ')) : ok('nothing changed outside dist/');

        // 5
        runTests(copy, 'standalone');
        runTests(copy, 'module');

        // 7 (before 6, which breaks the sources of its own copy)
        if (!args.has('--skip-consumer')) {
            checkPackage(tmp, copy);
        }

        // 6
        const broken = path.join(tmp, 'broken');
        fs.cpSync(copy, broken, {recursive: true});
        const errorFile = path.join(broken, ERROR_FILE);
        const lines = fs.readFileSync(errorFile, 'utf8').split('\n');
        lines.splice(5, 0, 'var = ;');
        fs.writeFileSync(errorFile, lines.join('\n'));
        const beforeBroken = hashTree(broken, ['node_modules', 'dist']);
        r = npm(['run', 'build'], {cwd: broken});
        const named = r.log.includes(ERROR_FILE.split('/').pop()) && /\(6:\d+\)|:6:\d+/.test(r.log);
        if (r.status === 0) {
            fail('npm run build with a syntax error in ' + ERROR_FILE + ' exited with 0');
        } else if (!named) {
            console.error(r.log.split('\n').slice(0, 25).join('\n'));
            fail('no diagnostic naming ' + ERROR_FILE + ' line 6');
        } else {
            ok('syntax error in ' + ERROR_FILE + ': exit code ' + r.status + ', diagnostic names line 6');
        }
        const brokenChanged = changedOutsideDist(broken, beforeBroken);
        brokenChanged.length ? fail('failed build changed files outside dist/: ' + brokenChanged.join(', ')) : null;
    } finally {
        if (args.has('--keep')) {
            console.log('kept ' + tmp);
        } else {
            fs.rmSync(tmp, {recursive: true, force: true});
        }
    }
}

function checkPackage(tmp, copy) {
    let r = npm(['pack', '--json', '--pack-destination', tmp], {cwd: copy});
    if (r.status !== 0) {
        console.error(r.log);
        fail('npm pack exited with ' + r.status);
        return;
    }
    // stdout only: npm 11 writes warnings (e.g. gitignore-fallback) to stderr
    const info = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0];
    const files = info.files.map(f => f.path);
    const missing = PACKED.filter(f => !files.includes(f));
    missing.length ? fail('tarball misses ' + missing.join(', ')) : ok('tarball ' + info.filename + ': ' + files.length + ' files, '
        + Math.round(info.size / 1024) + ' KiB, contains ' + PACKED.length + ' required files');

    const consumer = path.join(tmp, 'consumer');
    fs.mkdirSync(consumer);
    fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({name: 'consumer', private: true}));
    r = npm(['install', '--no-audit', '--no-fund', '--no-package-lock', path.join(tmp, info.filename)].concat(CONSUMER_DEPS), {cwd: consumer});
    if (r.status !== 0) {
        console.error(r.log);
        fail('installing the tarball into a consumer failed');
        return;
    }
    const installed = require(path.join(consumer, 'node_modules', NAME, 'package.json'));
    ok('installed ' + NAME + '@' + installed.version + ' from the tarball with ' + CONSUMER_DEPS.join(' '));

    fs.writeFileSync(path.join(consumer, 'entry.js'), "module.exports = require('" + NAME + "');\n");
    const bundle = path.join(consumer, 'bundle.js');
    r = run(process.execPath, [path.join(consumer, 'node_modules', 'browserify', 'bin', 'cmd.js'),
        'entry.js', '--standalone', 'Consumer', '-o', bundle], {cwd: consumer});
    if (r.status !== 0) {
        console.error(r.log);
        fail('browserify of the installed package failed');
        return;
    }
    const err = isES5(bundle);
    err ? fail('consumer bundle is not ES5: ' + err) : ok('browserify bundle of require(\'' + NAME + '\') is ES5');
    runTests(copy, bundle);
}

main();
if (failures.length) {
    console.error('\n' + failures.length + ' check(s) failed');
    process.exit(1);
}
console.log('\nall build checks passed');
