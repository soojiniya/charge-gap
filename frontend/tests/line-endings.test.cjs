/* Regression: no whole-file CRLF/LF churn in the frontend source diff.
 * Compares `git diff --numstat` with and without --ignore-cr-at-eol, so it follows this checkout's own
 * core.autocrlf setting: on Windows with autocrlf=true CRLF working files are normal and are not reported.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const inRepo = git('rev-parse', '--verify', 'HEAD').status === 0;

function numstat(...extra) {
  const r = git('diff', '--numstat', ...extra, 'HEAD', '--', 'src', 'tests', 'index.html', 'vite.config.ts', 'package.json');
  assert.equal(r.status, 0, r.stderr);
  return Object.fromEntries(r.stdout.split('\n').filter(Boolean).map((line) => {
    const [added, removed, file] = line.split('\t');
    return [file, `${added}/${removed}`];
  }));
}

test('frontend diff has no line-ending-only churn', { skip: !inRepo && 'not a git checkout' }, () => {
  const plain = numstat();
  const ignoringCr = numstat('--ignore-cr-at-eol');
  const churn = Object.keys(plain).filter((file) => plain[file] !== (ignoringCr[file] ?? '0/0'))
    .map((file) => `${file}: ${plain[file]} lines vs ${ignoringCr[file] ?? '0/0'} without CR changes`);
  assert.deepEqual(churn, [], 'restore the original line endings (or enable core.autocrlf) before committing');
});
