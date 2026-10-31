const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const directory = path.dirname(require.resolve('@fontsource/ibm-plex-sans-kr/package.json'));
for (const weight of [400, 500, 600]) {
  test(`Korean font ${weight}: every CSS-referenced font file exists`, () => {
    const css = fs.readFileSync(path.join(directory, `${weight}.css`), 'utf8');
    const paths = [...css.matchAll(/url\(([^)]+)\)/g)].map(match => match[1]);
    assert.ok(paths.length > 0, 'font CSS must contain asset references');
    const missing = paths.filter(file => !fs.existsSync(path.resolve(directory, file)));
    assert.deepEqual(missing, [], 'incomplete font installation');
  });
}
