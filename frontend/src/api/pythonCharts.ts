import { useQuery } from '@tanstack/react-query';

/**
 * Python 데이터 시각화 그래프(정적 파일): scripts/create_python_charts_2026.py 가 만든
 * frontend/public/python-charts/charts.json 과 PNG 10개. 백엔드 API·R2와 무관하게 웹 정적 파일로 배포됩니다.
 * 고정 이미지이므로 웹사이트 필터에 따라 바뀌지 않습니다.
 */
export interface PythonChart {
  id: number;
  file: string;
  title: string;
  technique: string;
  libraries: string[];
  data_date: string;
  basis: string;
  regions: string;
  deletion: string;
  results: string[];
  caution: string;
  /** 같은 기준(웹 기본 필터)으로 수치를 대조한 현재 웹 그래프. 없으면 null */
  web: { graph: number; title: string } | null;
  image_pixels: [number, number];
  sha256: string;
  /** 원본 그래프 세트(python-charts-original)에만 있는 선택 항목: PNG에 적힌 출처, 분석 목적, 선택 이유, 사용 파일, 웹 그래프와의 관계 */
  source?: string;
  purpose?: string;
  reason?: string;
  data_files?: string;
  relation?: string;
}

export interface PythonChartsMeta {
  title: string;
  generator: string;
  generated_at: string;
  libraries: Record<string, string>;
  font: string;
  fixed_notice: string;
  data: {
    ev_registration: { date: string; total: number; regions: number; source: string };
    chargers: { date: string; snapshot: string; total: number; not_deleted: number; deleted: number; basis: string; source: string };
    growth: { years: [number, number]; partial_years: number[] };
  };
  charts: PythonChart[];
}

const BASE = `${import.meta.env.BASE_URL ?? '/'}python-charts/`;
export const pythonChartUrl = (file: string) => BASE + file;

/**
 * 처음 Python으로 제작한 원본 그래프 10개(outputs/charts/ PNG를 바이트 그대로 복사한 public/python-charts-original).
 * 전기차 등록 그래프는 2025년 12월 자료 기준입니다. Python Visualization 페이지가 이 세트를 표시합니다.
 */
const ORIGINAL_BASE = `${import.meta.env.BASE_URL ?? '/'}python-charts-original/`;
export const originalPythonChartUrl = (file: string) => ORIGINAL_BASE + file;

function chartsQuery(base: string, key: string) {
  return {
    queryKey: [key],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(base + 'charts.json', { signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Python 그래프 정보를 불러오지 못했습니다 (${res.status}).`);
      return (await res.json()) as PythonChartsMeta;
    },
    staleTime: Infinity,
  };
}

export function usePythonCharts() {
  return useQuery(chartsQuery(BASE, 'python-charts'));
}

export function useOriginalPythonCharts() {
  return useQuery(chartsQuery(ORIGINAL_BASE, 'python-charts-original'));
}
