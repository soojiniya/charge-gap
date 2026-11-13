/* 좌표 품질 안내(lib/coordinateQuality.ts, components/geo/CoordinateNote.tsx):
 * 서버가 coordinate_flag를 붙인 충전소에만 안내 한 줄이 나오고, 정상 충전소(필드 없음)에는 아무것도 그리지 않는지,
 * 문구가 실제 위치 오류를 단정하지 않는지 검증합니다. 정보창·패널 삽입 위치는 소스에서 확인합니다. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('./ts-loader.cjs');

const { coordinateNotice } = loader()('src/lib/coordinateQuality.ts');
const { CoordinateNote } = loader()('src/components/geo/CoordinateNote.tsx');
const FLAGS = ['placeholder', 'far_from_address', 'placeholder_far_from_address'];
const render = (flag) => renderToStaticMarkup(React.createElement(CoordinateNote, { flag }));
const src = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

test('세 판정 값마다 서로 다른 안내 문구, 단정하지 않는 표현', () => {
  const notices = FLAGS.map(coordinateNotice);
  assert.equal(new Set(notices).size, 3);
  for (const notice of notices) {
    assert.match(notice, /^원본 좌표가 /);
    assert.match(notice, /수 있습니다\.$/);
    assert.doesNotMatch(notice, /오류입니다|틀렸습니다|잘못되었습니다/);
  }
  assert.match(coordinateNotice('placeholder'), /수 km/);
  assert.match(coordinateNotice('far_from_address'), /100km/);
});

test('정상 좌표·알 수 없는 값에는 안내가 없음', () => {
  for (const value of [undefined, null, '', 'ok', 'toString', '__proto__']) {
    assert.equal(coordinateNotice(value), null, String(value));
    assert.equal(render(value), '', String(value));
  }
});

test('의심 좌표에는 note 역할의 한 줄만 렌더링', () => {
  for (const flag of FLAGS) {
    const html = render(flag);
    assert.equal(html, `<p class="geo-coord-note" role="note">${coordinateNotice(flag)}</p>`);
  }
});

test('정보창과 선택 충전소 패널의 주소 바로 아래에만 삽입, 묶음 목록·마커에는 없음', () => {
  const map = src('src/components/StationMap.tsx');
  const panel = src('src/components/MapAnalysisPanel.tsx');
  assert.match(map, /geo-infowin-addr">\{row\.address \|\| '주소 정보 없음'\}<\/div>\s*<CoordinateNote flag=\{row\.coordinate_flag\} \/>/);
  assert.match(panel, /geo-station-addr">\{selected\.address \|\| '주소 정보 없음'\}<\/div>\s*<CoordinateNote flag=\{selected\.coordinate_flag\} \/>/);
  assert.equal((map.match(/<CoordinateNote /g) || []).length, 1);
  assert.equal((panel.match(/<CoordinateNote /g) || []).length, 1);
  // 지도 표시층(점 위치·색·모양)과 묶음 계산은 이 필드를 읽지 않습니다.
  for (const file of ['src/components/geo/MarkCanvasLayer.ts', 'src/components/geo/cluster.ts']) {
    assert.doesNotMatch(src(file), /coordinate_flag/, file);
  }
  assert.equal((map.match(/coordinate_flag/g) || []).length, 1);
});
