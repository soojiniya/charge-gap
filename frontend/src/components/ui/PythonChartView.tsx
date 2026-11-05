import { usePythonCharts, pythonChartUrl, type PythonChart } from '../../api/pythonCharts';
import { QueryState } from './QueryState';
import { Icon } from './Icon';
import { DATA_SOURCES } from '../../analysis/dataSources';

/** 받침 유무에 맞는 '과/와' (괄호·따옴표 뒤는 그 앞 글자 기준) */
export function gwa(word: string) {
  const ch = word.replace(/[\s)\]”"']+$/, '').slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '과' : '와';
}

/** Python 그래프 1개의 확대 이미지 + 기준 + 주요 분석 결과 (갤러리 확대 보기와 웹 그래프 상세 탭에서 공용) */
export function PythonChartBody({ chart, notice, fromWebGraph = false }: { chart: PythonChart; notice: string; fromWebGraph?: boolean }) {
  const source = chart.id <= 3 ? DATA_SOURCES.ev : chart.id === 9 ? DATA_SOURCES.growth : DATA_SOURCES.chargers;
  const facts: [string, string][] = [
    ['데이터 출처', `${source.provider} · ${source.dataset}`],
    ['데이터 기준일', chart.data_date],
    ['지역 체계', chart.regions],
    ['삭제 기준', chart.deletion],
    ['시각화 기법', chart.technique],
    ['사용 라이브러리', chart.libraries.join(' · ')],
  ];
  return (
    <div className="pyc-body">
      <p className="pyc-notice" role="note">
        <Icon name="alert" />
        <span>
          {notice}
          {fromWebGraph && ' 위의 웹 그래프는 현재 필터를 따르고, 이 그래프는 필터를 적용하지 않은 기준으로 고정돼 있습니다.'}
        </span>
      </p>
      <figure className="pyc-figure">
        <img src={pythonChartUrl(chart.file)} alt={`${chart.title} (${chart.technique}, ${chart.data_date})`} width={chart.image_pixels[0]} height={chart.image_pixels[1]} loading="lazy" decoding="async" />
      </figure>
      <dl className="pyc-facts" aria-label="그래프 데이터 기준">
        {facts.map(([k, v], i) => (
          <div key={k} className={i === 0 ? 'is-source' : undefined}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="prose pyc-text">
        <div className="pyc-results">
          <h4>주요 분석 결과</h4>
          <ul>
            {chart.results.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div className="pyc-notes">
          <h4>해석 주의</h4>
          <p>{chart.caution}</p>
          <h4>현재 웹 그래프와의 관계</h4>
          <p>
            {chart.web
              ? `웹 그래프 ${chart.web.graph} “${chart.web.title}”${gwa(chart.web.title)} 같은 자료·같은 기준(웹 기본 필터)에서 수치를 대조해 일치함을 확인했습니다.`
              : '대응하는 현재 웹 그래프가 없습니다.'}
          </p>
          <h4>기준</h4>
          <p>{chart.basis}</p>
        </div>
      </div>
    </div>
  );
}

/** 웹 그래프 상세 보기의 "Python 그래프" 탭: 대응하는 Python 그래프를 정적 메타데이터에서 찾아 표시 */
export function PythonChartsById({ ids }: { ids: number[] }) {
  const q = usePythonCharts();
  const charts = q.data?.charts.filter((c) => ids.includes(c.id)) ?? [];
  return (
    <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!charts.length}>
      {q.data && charts.map((c) => <PythonChartBody key={c.id} chart={c} notice={q.data.fixed_notice} fromWebGraph />)}
    </QueryState>
  );
}
