/* Regression: '해석' sentences are shown one per line without changing any text.
 * Split only at "." followed by whitespace or the end; decimals (5.9%, 2.1배, 6.29), %p, file names and API paths
 * stay intact; <b> elements are never cut; dynamic insights split the same way. */
const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('./ts-loader.cjs');

const { splitSentences, SentenceLines } = loader()('src/lib/sentences.tsx');
const h = React.createElement;
const text = (node) => renderToStaticMarkup(h(React.Fragment, null, node)).replace(/<[^>]+>/g, '');
const lines = (node) => splitSentences(node).map((s) => text(s));

test('splits plain text at sentence ends and keeps decimals, %p and paths', () => {
  const s = '사업용 비중은 5.9%~38.9%로 차이가 33.0%p입니다. 전국 평균의 2.1배 수준입니다. 파일 growth_2026-10-15.xlsx와 /api/charger-output을 씁니다.';
  assert.deepEqual(lines(s), ['사업용 비중은 5.9%~38.9%로 차이가 33.0%p입니다. ', '전국 평균의 2.1배 수준입니다. ', '파일 growth_2026-10-15.xlsx와 /api/charger-output을 씁니다.']);
});

test('fragments with interpolated values and <b> elements keep their text and markup', () => {
  const node = h(React.Fragment, null, '등록 대수는 ', h('b', null, '43.0%'), '에 이릅니다.', ' ', '다만 ', h('b', null, '1.5'), '배는 아닙니다.');
  const out = splitSentences(node);
  assert.equal(out.length, 2);
  assert.equal(text(out[0]), '등록 대수는 43.0%에 이릅니다. ');
  assert.equal(text(out[1]), '다만 1.5배는 아닙니다.');
  assert.match(renderToStaticMarkup(h(SentenceLines, null, node)), /<b>43\.0%<\/b>/);
});

test('a period directly followed by an element is not a sentence end', () => {
  assert.equal(splitSentences(h(React.Fragment, null, '값은 6.', h('b', null, '29'), '입니다.')).length, 1);
});

test('rendered text is identical to the original, and single sentences stay unwrapped', () => {
  const node = h(React.Fragment, null, '첫 문장입니다. 둘째 문장은 ', h('b', null, '7kW'), '입니다. 셋째.');
  const before = renderToStaticMarkup(h('p', null, node)).replace(/<[^>]+>/g, '');
  const after = renderToStaticMarkup(h('p', null, h(SentenceLines, null, node)));
  assert.equal(after.replace(/<[^>]+>/g, ''), before);
  assert.equal((after.match(/class="sentence-line"/g) || []).length, 3);
  assert.equal(renderToStaticMarkup(h(SentenceLines, null, '한 문장뿐입니다.')), '한 문장뿐입니다.');
  assert.equal(renderToStaticMarkup(h(SentenceLines, null, '—')), '—');
});
