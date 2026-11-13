/* Python Visualization 페이지의 "Python 데이터 시각화 그래프"(public/python-charts, scripts/create_python_charts_2026.py 결과)를 검증합니다.
 * - PNG 10개와 charts.json이 짝을 이루고(sha256 일치), 그래프마다 제목·기법·라이브러리·기준일·결과가 있음
 * - 충전기 그래프는 웹 기본 필터와 같은 '전체(삭제 표시 포함)' 기준, 전기차는 2026년 9월·16개 지역
 * - 웹 그래프 상세 보기는 대응하는 Python 그래프 1~10에 한 번씩만 연결(연간 설치 수 그래프는 대응 없음)
 * - 갤러리는 독립 페이지(/python-visualization)에 접기 없이 항상 표시되고, Overview에는 바로가기만, Regional Explorer에는 없음
 * - 기존 보고서 PNG(outputs/charts)와 /api/charts는 그대로 보존 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const dir = path.join(root, 'public/python-charts');
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'charts.json'), 'utf8'));

test('ten Python charts with matching PNG files and complete descriptions', () => {
  assert.deepEqual(meta.charts.map((c) => c.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const c of meta.charts) {
    const file = path.join(dir, c.file);
    assert.ok(fs.existsSync(file), c.file);
    const buf = fs.readFileSync(file);
    assert.equal(buf.subarray(1, 4).toString(), 'PNG', `${c.file} is a PNG`);
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), c.sha256, `${c.file} sha256`);
    for (const k of ['title', 'technique', 'data_date', 'basis', 'regions', 'deletion', 'caution']) assert.ok(c[k] && c[k].length > 1, `${c.id} ${k}`);
    assert.ok(c.libraries.length >= 1 && c.results.length >= 2, `${c.id} libraries/results`);
  }
  const libs = meta.charts.flatMap((c) => c.libraries).join(' ');
  assert.match(libs, /Matplotlib/);
  assert.match(libs, /Seaborn/);
  assert.equal(meta.font, 'Noto Sans CJK KR');
  assert.match(meta.fixed_notice, /필터/);
});

test('data basis: EV 2026-09 in 16 regions, chargers = all rows (web default filter)', () => {
  const d = meta.data;
  assert.match(d.ev_registration.date, /2026년 9월/);
  assert.equal(d.ev_registration.regions, 16);
  assert.equal(d.chargers.total, d.chargers.not_deleted + d.chargers.deleted);
  assert.match(d.chargers.basis, /전체/);
  assert.ok(d.growth.partial_years.length >= 1);
  for (const c of meta.charts.filter((x) => /충전기 조회/.test(x.data_date))) assert.match(c.deletion, /^전체/, `chart ${c.id}`);
  for (const c of meta.charts.filter((x) => /등록/.test(x.data_date))) assert.match(c.data_date, /2026년 9월/, `chart ${c.id}`);
});

test('web graph details link each Python chart once; the annual-installation card has none', () => {
  const cards = src('src/features/ChartCards.tsx');
  const ids = [...cards.matchAll(/pythonChartIds:\s*\[([^\]]*)\]/g)].flatMap((m) => m[1].split(',').map((x) => Number(x.trim())));
  assert.deepEqual([...ids].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.doesNotMatch(cards, /staticChartIds/);
  const annual = cards.slice(cards.indexOf('title="연간 충전기 설치 수"'), cards.indexOf('export function CumulativeCard'));
  assert.doesNotMatch(annual, /pythonChartIds/);
  for (const c of meta.charts) assert.ok(c.web && c.web.graph === c.id, `chart ${c.id} ↔ web graph ${c.id}`);
});

test('the gallery lives on its own page (always open); Overview keeps only a shortcut; legacy PNGs are kept', () => {
  const page = src('src/pages/PythonVisualization.tsx');
  assert.match(page, /<PythonChartGallery variant="original" \/>/);
  assert.match(page, /title="Python Visualization"/);
  assert.match(src('src/App.tsx'), /<Route path="python-visualization" element={<PythonVisualizationPage \/>} \/>/);
  const nav = src('src/components/layout/AppShell.tsx');
  assert.match(nav, /\{ to: '\/growth-trends'[^\n]*\n\s*\{ to: '\/python-visualization', label: 'Python Visualization', ko: 'Python 데이터 시각화'/);
  const overview = src('src/pages/Overview.tsx');
  assert.doesNotMatch(overview, /PythonChartGallery|ReportGallery/);
  assert.match(overview, /<PythonChartsShortcut \/>\s*<\/div>\s*<\/>/);
  assert.match(overview, /pathname: '\/python-visualization'/);
  assert.doesNotMatch(src('src/pages/RegionalExplorer.tsx'), /ReportGallery|PythonChartGallery|ChartArchive/);
  const gallery = src('src/components/ReportGallery.tsx');
  assert.match(gallery, /Python 데이터 시각화 그래프/);
  assert.doesNotMatch(gallery, /<details|archive-toggle|setExpanded/);
  const legacy = path.resolve(root, '../outputs/charts');
  if (fs.existsSync(legacy)) assert.equal(fs.readdirSync(legacy).filter((f) => f.endsWith('.png')).length, 10);
});

test('gallery columns favour readability (4 / 3 / 2 / 1) and keep each PNG uncropped; modal keeps all six facts', () => {
  const css = src('src/styles/global.css');
  assert.match(css, /\.python-charts \.pyc-gallery \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); grid-auto-rows: 1fr;/);
  assert.match(css, /@container \(min-width: 1500px\) \{ \.python-charts \.pyc-gallery \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \} \}/);
  assert.match(css, /@container \(min-width: 400px\) and \(max-width: 879\.98px\) \{ \.python-charts \.pyc-gallery \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@container \(max-width: 399\.98px\) \{ \.python-charts \.pyc-gallery \{ grid-template-columns: minmax\(0, 1fr\);/);
  assert.doesNotMatch(css, /pyc-gallery \{ grid-template-columns: repeat\(5/);
  assert.match(css, /\.python-charts \.thumb img \{[^}]*object-fit: contain;/);
  assert.match(css, /\.pyc-figure img \{[^}]*object-fit: contain;/);
  const body = src('src/components/ui/PythonChartView.tsx');
  for (const k of ['데이터 출처', '데이터 기준일', '지역 체계', '삭제 기준', '시각화 기법', '사용 라이브러리']) assert.match(body, new RegExp(`\\['${k}'`));
  assert.ok(body.indexOf('pyc-results') < body.indexOf('pyc-notes'), 'results come before cautions');
});

/* Python Visualization 페이지는 처음 제작한 원본 PNG(outputs/charts/)를 그대로 보여 줍니다. */
test('page shows the original Python PNGs byte-for-byte, with their own (2025-12 EV) dates', () => {
  const odir = path.join(root, 'public/python-charts-original');
  const om = JSON.parse(fs.readFileSync(path.join(odir, 'charts.json'), 'utf8'));
  assert.deepEqual(om.charts.map((c) => c.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const legacy = path.resolve(root, '../outputs/charts');
  const hasLegacy = fs.existsSync(legacy);
  for (const c of om.charts) {
    const buf = fs.readFileSync(path.join(odir, c.file));
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    assert.equal(sha, c.sha256, `${c.file} sha256`);
    if (hasLegacy) assert.ok(buf.equals(fs.readFileSync(path.join(legacy, c.file))), `${c.file} is an unmodified copy of outputs/charts`);
    for (const k of ['title', 'technique', 'data_date', 'basis', 'regions', 'deletion', 'caution', 'source']) assert.ok(c[k] && c[k].length > 1, `${c.id} ${k}`);
    assert.ok(c.results.length >= 1, `${c.id} results`);
  }
  for (const c of om.charts.filter((x) => x.id <= 3)) {
    assert.match(c.data_date, /2025년 12월/, `chart ${c.id} keeps its 2025-12 basis`);
    assert.doesNotMatch(JSON.stringify(c), /2026년 9월/, `chart ${c.id} is not labelled as 2026-09`);
  }
  assert.equal(om.data.ev_registration.total, 899101);
  assert.match(om.fixed_notice, /2025년 12월/);
  // 다시 그린 다크 테마 세트는 보존되고 웹 그래프 상세 보기의 Python 탭이 계속 사용
  assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.png')).length, 10);
  assert.match(src('src/components/ui/PythonChartView.tsx'), /export function PythonChartsById[\s\S]*usePythonCharts\(\)/);
});
