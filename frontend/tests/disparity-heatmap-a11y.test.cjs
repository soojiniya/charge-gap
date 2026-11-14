/* Regional Explorer 격차 히트맵 접근성 회귀 (감사 M2, axe aria-allowed-attr / aria-allowed-role).
 * - 지역 행은 토글 버튼(aria-pressed)이며, 버튼에 허용되지 않는 표 역할(role="row"/"cell"/"table")을 쓰지 않음
 * - 각 버튼의 aria-label이 지역·지표 값·전국 대비 차이를 모두 담고, 보이는 머리줄은 aria-hidden */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '../src/features/RegionalDisparity.tsx'), 'utf8');
const heat = src.slice(src.indexOf('className="disparity-heat"'), src.indexOf('<HeatLegend'));

test('heatmap rows are toggle buttons without table roles; each button names its region, value and difference', () => {
  assert.ok(heat.length > 0, 'heatmap block found');
  assert.doesNotMatch(heat, /role="(table|row|cell|columnheader)"/);
  assert.match(heat, /className="disparity-heat" role="group" aria-label=/);
  assert.match(heat, /className="disparity-heat-head" aria-hidden="true"/);
  assert.match(heat, /className="disparity-heat-row"\s+aria-pressed=\{state\.region === r\.region_code\}/);
  assert.match(heat, /aria-label=\{`\$\{regionLabel\(r\)\}: \$\{active\.short\} \$\{active\.format\(v\)\}, 전국 대비 차이 \$\{diffText\(delta, active\)\}`\}/);
});
