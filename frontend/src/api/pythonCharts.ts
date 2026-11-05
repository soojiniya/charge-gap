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

export function usePythonCharts() {
  return useQuery({
    queryKey: ['python-charts'],
    queryFn: async ({ signal }) => {
      const res = await fetch(BASE + 'charts.json', { signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Python 그래프 정보를 불러오지 못했습니다 (${res.status}).`);
      return (await res.json()) as PythonChartsMeta;
    },
    staleTime: Infinity,
  });
}
