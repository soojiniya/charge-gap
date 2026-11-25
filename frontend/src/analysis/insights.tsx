/**
 * 그래프별 분석 문단 생성기.
 * 주요 결과와 해석 문장의 수치는 모두 인자로 받은 실제 API 응답에서 계산합니다.
 * 고정 문구는 분석 목적·그래프 선택 이유·주의사항·출처뿐입니다.
 */
import { Fragment, type ReactNode } from "react";
import type {
  ChargerOutputRow,
  ChargerRegionRow,
  ChargerTypeRow,
  EvRegistrationRow,
  GrowthRow,
  OperatorRow,
  OutputStatistics,
  StationSizeRow,
} from "../api/types";
import type { InsightProps } from "../components/ui/Insight";
import { fmtInt, fmtPct } from "../lib/format";
import { ols, pearson, sum } from "../lib/stats";
import type { HeatRow } from "../charts/Heatmap";
import { CH_SRC, EV_SRC, GROWTH_REVISION_NOTE, GROWTH_SNAPSHOT_NOTE, GROWTH_SRC } from "./dataSources";

const B = ({ children }: { children: ReactNode }) => <b>{children}</b>;
const fmtNum = (v: number) =>
  Number.isInteger(v) ? fmtInt(v) : v.toFixed(2).replace(/\.?0+$/, "");
const pct = (a: number, b: number, d = 1) =>
  b ? fmtPct((a / b) * 100, d) : "—";
const shortRegion = (code: string, name: string) =>
  code === "12" ? "전남광주" : name;

const CAPITAL = ["11", "41", "28"];

/* ---------------- G1 지역별 전기차 등록 ---------------- */
export function insightEvRegions(
  rows: EvRegistrationRow[],
  selected?: string,
): InsightProps {
  const sorted = [...rows].sort(
    (a, b) => b.ev_registration_count - a.ev_registration_count,
  );
  const total = sum(rows.map((r) => r.ev_registration_count));
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const top3 = sum(sorted.slice(0, 3).map((r) => r.ev_registration_count));
  const capital = sum(
    rows
      .filter((r) => CAPITAL.includes(r.region_code))
      .map((r) => r.ev_registration_count),
  );
  // 상위 3개 지역이 수도권 3개 시도와 같은 집합이면 같은 비중을 두 번 말하지 않습니다.
  const top3Codes = sorted.slice(0, 3).map((r) => r.region_code);
  const sameTop3Capital =
    top3Codes.length === CAPITAL.length &&
    CAPITAL.every((c) => top3Codes.includes(c));
  const sel = rows.find((r) => r.region_code === selected);
  const findings: ReactNode[] = top
    ? [
        <>
          1위 {top.region_name}{" "}
          <B>{fmtInt(top.ev_registration_count)}대</B>(전국의{" "}
          {pct(top.ev_registration_count, total)}), 최하위{" "}
          {bottom.region_name}{" "}
          <B>{fmtInt(bottom.ev_registration_count)}대</B>로 약{" "}
          <B>
            {(top.ev_registration_count / bottom.ev_registration_count).toFixed(
              1,
            )}
            배
          </B>{" "}
          차이입니다.
        </>,
        sameTop3Capital ? (
          <>
            상위 3개 지역(
            {sorted
              .slice(0, 3)
              .map((r) => r.region_name)
              .join(", ")}
            )이 <B>{pct(top3, total)}</B>를 차지하며, 이 세 지역이 곧 수도권(서울·경기·인천)입니다.
          </>
        ) : (
          <>
            상위 3개 지역(
            {sorted
              .slice(0, 3)
              .map((r) => r.region_name)
              .join(", ")}
            )이 <B>{pct(top3, total)}</B>, 수도권(서울·경기·인천)이{" "}
            <B>{pct(capital, total)}</B>를 차지합니다.
          </>
        ),
      ]
    : [];
  if (sel) {
    const rank =
      sorted.findIndex((r) => r.region_code === sel.region_code) + 1;
    findings.push(
      <>
        선택한 {sel.region_name}:{" "}
        <B>{fmtInt(sel.ev_registration_count)}대</B>, 16개 지역 중{" "}
        <B>{rank}위</B>, 전국의 {pct(sel.ev_registration_count, total)}.
      </>,
    );
  }
  return {
    mode: "fixed",
    modeNote: selected
      ? "전국 16개 지역 기준 고정 분석 (선택 지역 순위 표시)"
      : undefined,
    purpose: "전기차 등록이 어느 지역에 얼마나 집중되어 있는지 비교합니다.",
    reason:
      "16개 지역의 크기를 순위대로 비교하므로 지역명이 잘 읽히는 가로 막대(barh, countplot y축)를 사용했습니다.",
    findings,
    interpretation: top ? (
      <>
        등록 대수는 소수 지역에 크게 몰려 있으며, 수도권 비중이{" "}
        {pct(capital, total)}에 이릅니다. 다만 이 값은 지역의 인구나 전체 차량
        수를 반영하지 않은 절대 대수이므로 보급률 순위로 읽으면 안 됩니다.
      </>
    ) : (
      "—"
    ),
    caution:
      "2026년 9월 기준 16개 지역. 전남광주는 충전기 자료의 코드 12에 대응하며 두 자료의 기준 시점은 다릅니다.",
    source: EV_SRC,
    variables: ["region_name", "ev_registration_count"],
  };
}

/* ---------------- G2 차종별 구성 ---------------- */
export function insightEvTypes(
  s: {
    total: number;
    passenger: number;
    truck: number;
    bus: number;
    special: number;
  },
  regionName: string,
  filtered: boolean,
): InsightProps {
  const parts = [
    { n: "승용", v: s.passenger },
    { n: "화물", v: s.truck },
    { n: "승합", v: s.bus },
    { n: "특수", v: s.special },
  ].sort((a, b) => b.v - a.v);
  return {
    mode: filtered ? "dynamic" : "fixed",
    modeNote: filtered
      ? `선택 지역(${regionName}) 기준으로 계산`
      : "전국 기준 (지역을 선택하면 다시 계산)",
    purpose:
      "전기차가 어떤 차종으로 구성되어 있는지 전체 대비 비율로 확인합니다.",
    reason:
      "4개 차종의 규모 차이가 커서 등록 대수 순 가로 롤리팝으로 비교하고, 점 옆에 실제 대수와 구성비를 함께 적었습니다.",
    findings: s.total
      ? [
          <>
            {parts[0].n} <B>{fmtInt(parts[0].v)}대</B>로{" "}
            <B>{pct(parts[0].v, s.total)}</B>, {parts[1].n} {fmtInt(parts[1].v)}
            대(
            {pct(parts[1].v, s.total)}).
          </>,
          <>
            {parts[2].n} {fmtInt(parts[2].v)}대({pct(parts[2].v, s.total)}),{" "}
            {parts[3].n} {fmtInt(parts[3].v)}대({pct(parts[3].v, s.total, 2)}).
          </>,
        ]
      : [],
    interpretation: s.total ? (
      <>
        {regionName} 전기차의 {pct(s.passenger, s.total)}가 승용이며, 승용을
        제외하면 화물이 {pct(s.truck, s.total)}로 가장 큰 비중입니다. 승합과
        특수는 합쳐도 {pct(s.bus + s.special, s.total)}에 그칩니다.
      </>
    ) : (
      "—"
    ),
    caution: "2026년 9월 기준. 하이브리드·수소전기차는 포함하지 않습니다.",
    source: EV_SRC,
    variables: [
      "ev_passenger_count",
      "ev_truck_count",
      "ev_bus_count",
      "ev_special_count",
    ],
  };
}

/* ---------------- G3 사업용·비사업용 구성 (100% 누적 가로 막대, Python PY03과 같은 기준) ---------------- */
export function insightEvCommercial(
  rows: EvRegistrationRow[],
  selected?: string,
): InsightProps {
  // 그래프와 같은 순서: 사업용 비율 내림차순, 같으면 지역 코드 오름차순. 분모는 지역별 전체 등록 대수.
  const d = rows
    .map((r) => ({
      r,
      name: shortRegion(r.region_code, r.region_name),
      share: r.ev_registration_count
        ? (r.ev_commercial_count / r.ev_registration_count) * 100
        : 0,
    }))
    .sort(
      (a, b) =>
        b.share - a.share || a.r.region_code.localeCompare(b.r.region_code),
    );
  const total = sum(rows.map((r) => r.ev_registration_count));
  const comm = sum(rows.map((r) => r.ev_commercial_count));
  const nat = total ? (comm / total) * 100 : 0;
  const hi = d[0];
  const lo = d[d.length - 1];
  const above = d.filter((x) => x.share > nat);
  const byComm = [...d].sort(
    (a, b) => b.r.ev_commercial_count - a.r.ev_commercial_count,
  );
  const sel = d.find((x) => x.r.region_code === selected);
  const names = (xs: typeof d) => xs.map((x) => x.name).join("·");
  const findings: ReactNode[] = hi
    ? [
        <>
          전국 전기차 {fmtInt(total)}대 중 사업용은 {fmtInt(comm)}대로 사업용
          비율 <B>{fmtPct(nat)}</B>, 비사업용 비율{" "}
          <B>{fmtPct(100 - nat)}</B>입니다.
        </>,
        <>
          사업용 비율이 가장 높은 지역은{" "}
          <B>
            {hi.name} {fmtPct(hi.share)}
          </B>
          , 가장 낮은 지역은{" "}
          <B>
            {lo.name} {fmtPct(lo.share)}
          </B>
          로 <B>{(hi.share - lo.share).toFixed(1)}%p</B> 차이가 납니다.
        </>,
        <>
          사업용 비율 상위 3곳은 {names(d.slice(0, 3))}, 하위 3곳은{" "}
          {names(d.slice(-3))}입니다.
        </>,
        <>
          전국 사업용 비율보다 높은 지역은 {above.length}곳(
          {names(above)}), 나머지 {d.length - above.length}곳은 전국보다
          낮습니다.
        </>,
      ]
    : [];
  if (sel) {
    const rank = d.findIndex((x) => x === sel) + 1;
    findings.push(
      <>
        선택한 {sel.name}: 사업용 <B>{fmtPct(sel.share)}</B>(
        {fmtInt(sel.r.ev_commercial_count)}대) · 비사업용{" "}
        {fmtPct(100 - sel.share)}({fmtInt(sel.r.ev_noncommercial_count)}대),
        16개 지역 중 {rank}위 (전국 대비{" "}
        {(sel.share - nat >= 0 ? "+" : "") + (sel.share - nat).toFixed(1)}%p).
      </>,
    );
  }
  return {
    mode: "fixed",
    modeNote: selected
      ? "전국 16개 지역 기준 고정 분석 (선택 지역 순위 표시)"
      : undefined,
    purpose:
      "지역마다 전기차 등록이 사업용(택시·화물운송 등 영업용)과 비사업용으로 어떻게 나뉘는지 비교해, 구성 차이가 큰 지역을 확인합니다.",
    reason:
      "각 지역의 전체 등록 대수를 100%로 맞춘 누적 가로 막대라 등록 규모와 관계없이 구성비를 같은 길이에서 비교할 수 있습니다. 밝은 막대(사업용)가 끝나는 위치가 곧 사업용 비율이며, 막대 안에 그 값을 적었습니다. Python 그래프 PY03과 같은 정렬·색·축 기준입니다.",
    findings,
    interpretation: hi ? (
      <>
        사업용 비율은 {fmtPct(lo.share)}에서 {fmtPct(hi.share)}까지 퍼져
        있어, 같은 전기차라도 지역에 따라 용도 구성이 크게 다릅니다.{" "}
        {hi.name}의 사업용 비율은 전국 {fmtPct(nat)}의{" "}
        {(hi.share / nat).toFixed(1)}배이고, 가장 낮은 {lo.name}의 비율은
        전국보다 {(nat - lo.share).toFixed(1)}%p 낮습니다.{" "}
        {above.length < d.length / 2
          ? `전국보다 높은 지역은 ${above.length}곳뿐이어서 일부 지역이 전국 사업용 비율을 끌어올립니다.`
          : `전국보다 높은 지역이 ${above.length}곳으로 절반 이상입니다.`}{" "}
        구성비만으로는 지역별 절대 차량 대수를 알 수 없습니다.{" "}
        {byComm[0].r.region_code === hi.r.region_code
          ? `사업용 대수 1위도 같은 지역(${byComm[0].name}, ${fmtInt(byComm[0].r.ev_commercial_count)}대)이지만, 지역 간 규모 차이는 "대수" 보기에서 함께 확인합니다.`
          : `사업용 대수 1위는 ${byComm[0].name}(${fmtInt(byComm[0].r.ev_commercial_count)}대)로 비율 1위 지역과 다르므로, 규모는 "대수" 보기에서 함께 확인합니다.`}
      </>
    ) : (
      "—"
    ),
    caution:
      "2026년 9월 기준, 전남광주를 포함한 16개 지역. 비율의 분모는 지역별 전체 전기차 등록 대수이고, 전국 비율은 16개 지역 합계로 계산했습니다. 구성비는 등록 대수 규모를 반영하지 않습니다. 사업용 여부는 등록 용도 구분이며 실제 운행 용도와 다를 수 있습니다.",
    source: EV_SRC,
    variables: [
      "ev_commercial_count",
      "ev_noncommercial_count",
      "ev_registration_count",
    ],
  };
}

/* ---------------- G3 (대수 보기) 사업용·비사업용 대수 ---------------- */
export function insightCommercialCount(
  rows: EvRegistrationRow[],
  selected?: string,
): InsightProps {
  const byComm = [...rows].sort(
    (a, b) => b.ev_commercial_count - a.ev_commercial_count,
  );
  const byTotal = [...rows].sort(
    (a, b) => b.ev_registration_count - a.ev_registration_count,
  );
  const comm = sum(rows.map((r) => r.ev_commercial_count));
  const top3 = sum(byComm.slice(0, 3).map((r) => r.ev_commercial_count));
  const sel = rows.find((r) => r.region_code === selected);
  const findings: ReactNode[] = byComm.length
    ? [
        <>
          사업용 대수 1위{" "}
          <B>
            {byComm[0].region_name} {fmtInt(byComm[0].ev_commercial_count)}
            대
          </B>
          , 상위 3개 지역(
          {byComm
            .slice(0, 3)
            .map((r) => r.region_name)
            .join("·")}
          )이 전국 사업용 {fmtInt(comm)}대의 <B>{pct(top3, comm)}</B>.
        </>,
        <>
          전체 등록 1위 {byTotal[0].region_name}(
          {fmtInt(byTotal[0].ev_registration_count)}대)의 사업용은{" "}
          {fmtInt(byTotal[0].ev_commercial_count)}대(
          {pct(
            byTotal[0].ev_commercial_count,
            byTotal[0].ev_registration_count,
          )}
          ).
        </>,
      ]
    : [];
  if (sel)
    findings.push(
      <>
        선택한 {sel.region_name}: 사업용{" "}
        <B>{fmtInt(sel.ev_commercial_count)}대</B>, 비사업용{" "}
        {fmtInt(sel.ev_noncommercial_count)}대.
      </>,
    );
  return {
    mode: "fixed",
    purpose: "지역별 사업용·비사업용 전기차의 절대 규모(대수)를 비교합니다.",
    reason:
      "비율이 아니라 실제 대수의 크기를 보기 위해 등록 대수 누적 가로 막대를 썼습니다. 막대 전체 길이 = 지역 전체 등록 대수입니다.",
    findings,
    interpretation: byComm.length ? (
      <>
        사업용 대수는 등록 규모가 큰 지역에 몰려 있어, 비율 순위와 대수 순위가
        다를 수 있습니다. 비율이 높은 지역이 반드시 사업용 대수도 많은 것은
        아니므로 두 보기를 함께 해석합니다.
      </>
    ) : (
      "—"
    ),
    caution:
      "2026년 9월 기준. 지역 규모(인구·전체 차량 수)를 반영하지 않은 절대 대수입니다.",
    source: EV_SRC,
    variables: [
      "ev_commercial_count",
      "ev_noncommercial_count",
      "ev_registration_count",
    ],
  };
}

/* ---------------- G4 충전소 수 vs 충전기 수 ---------------- */
export function insightStationCharger(
  rows: ChargerRegionRow[],
  filtered: boolean,
  selected?: string,
): InsightProps {
  const xs = rows.map((r) => r.station_count);
  const ys = rows.map((r) => r.charger_count);
  const r = pearson(xs, ys);
  const fit = ols(xs, ys);
  const ratio = rows
    .filter((x) => x.station_count > 0)
    .map((x) => ({ x, v: x.charger_count / x.station_count }))
    .sort((a, b) => b.v - a.v);
  const totalC = sum(ys);
  const totalS = sum(xs);
  const sel = ratio.find((q) => q.x.region_code === selected);
  const bigTwo = [...rows]
    .sort((a, b) => b.station_count - a.station_count)
    .slice(0, 2)
    .map((x) => shortRegion(x.region_code, x.region_name))
    .join("·");
  const findings: ReactNode[] = [];
  if (r !== null && fit)
    findings.push(
      <>
        16개 지역의 충전소 수와 충전기 수의 상관계수 <B>r = {r.toFixed(3)}</B>,
        회귀 기울기 <B>{fit.slope.toFixed(2)}</B> (충전소 1곳이 많을수록 충전기
        약 {fit.slope.toFixed(1)}기 증가), 결정계수 R² = {fit.r2.toFixed(3)}.
      </>,
    );
  if (ratio.length)
    findings.push(
      <>
        충전소당 충전기 수가 가장 많은 지역은{" "}
        {shortRegion(ratio[0].x.region_code, ratio[0].x.region_name)}{" "}
        <B>{ratio[0].v.toFixed(2)}기</B>, 가장 적은 지역은{" "}
        {shortRegion(
          ratio[ratio.length - 1].x.region_code,
          ratio[ratio.length - 1].x.region_name,
        )}{" "}
        <B>{ratio[ratio.length - 1].v.toFixed(2)}기</B>입니다 (지역 합산 평균{" "}
        {totalS ? (totalC / totalS).toFixed(2) : "—"}기).
      </>,
    );
  if (sel)
    findings.push(
      <>
        선택한 {shortRegion(sel.x.region_code, sel.x.region_name)}: 충전소당{" "}
        <B>{sel.v.toFixed(2)}기</B>.
      </>,
    );
  return {
    mode: filtered ? "dynamic" : "fixed",
    modeNote: filtered
      ? "현재 충전기 필터 결과로 상관·회귀를 다시 계산"
      : undefined,
    purpose:
      "충전소가 많은 지역이 충전기도 비례해서 많은지, 충전소 한 곳의 규모가 지역마다 다른지 확인합니다.",
    reason:
      "두 연속 변수의 관계를 보기 위해 산점도에 최소제곱 회귀선(Seaborn regplot/lmplot)을 겹쳤습니다. 점선 위에 있는 지역은 같은 충전소 수 대비 충전기가 많은 편입니다.",
    findings,
    interpretation:
      r !== null ? (
        <>
          {Math.abs(r) >= 0.9
            ? "두 변수는 매우 강한 양의 선형 관계"
            : Math.abs(r) >= 0.7
              ? "두 변수는 강한 양의 관계"
              : "두 변수의 선형 관계는 약한 편"}
          입니다. 지역 충전기 규모는 대체로 충전소 수로 설명되지만, 충전소당
          충전기 수는{" "}
          {ratio.length
            ? `${ratio[ratio.length - 1].v.toFixed(1)}~${ratio[0].v.toFixed(1)}기`
            : ""}
          로 달라 지역마다 충전소 한 곳의 규모가 다릅니다. 점이 {rows.length}
          개뿐이고 규모가 큰 {bigTwo}이 회귀선을 크게 좌우한다는 점을 함께
          고려해야 합니다.
        </>
      ) : (
        "점이 3개 미만이라 상관을 계산하지 않았습니다."
      ),
    caution:
      "2026-10-15 조회 기준, 16개 시도 체계(12 전남광주통합특별시). 삭제 표시 충전기는 필터에서 제외할 수 있습니다. 상관은 인과를 뜻하지 않습니다.",
    source: `${CH_SRC}, /api/charger-regions`,
    variables: ["station_count", "charger_count", "region_code"],
  };
}

/* ---------------- G5 충전소당 충전기 수 박스플롯 ---------------- */
const DELETION_TEXT: Record<string, string> = {
  not_deleted: "비삭제 표시(delYn=N) 충전기만",
  deleted: "삭제 표시(delYn=Y) 충전기만",
  all: "삭제 표시 포함 전체 충전기",
};
export function insightBoxplot(
  rows: StationSizeRow[],
  deletionUsed: string,
  filtered: boolean,
  sampleTotal: number,
): InsightProps {
  const byMedian = [...rows].sort((a, b) => b.median - a.median || b.q3 - a.q3);
  const hiMed = byMedian[0];
  const loMed = byMedian[byMedian.length - 1];
  const medHiNames = rows
    .filter((r) => hiMed && r.median === hiMed.median)
    .map((r) => shortRegion(r.region_code, r.region_name));
  const medLoNames = rows
    .filter((r) => loMed && r.median === loMed.median)
    .map((r) => shortRegion(r.region_code, r.region_name));
  // IQR 최댓값이 같은 지역(공동 1위)은 모두 표시합니다. 같은 Q1~Q3 범위끼리 묶습니다.
  const maxIqr = rows.length ? Math.max(...rows.map((r) => r.iqr)) : 0;
  const wideGroups: { q1: number; q3: number; names: string[] }[] = [];
  rows
    .filter((r) => r.iqr === maxIqr)
    .forEach((r) => {
      const g = wideGroups.find((x) => x.q1 === r.q1 && x.q3 === r.q3);
      const name = shortRegion(r.region_code, r.region_name);
      if (g) g.names.push(name);
      else wideGroups.push({ q1: r.q1, q3: r.q3, names: [name] });
    });
  const outliers = sum(rows.map((r) => r.outlier_count));
  const samples = sum(rows.map((r) => r.sample_count));
  const outShare = [...rows]
    .filter((r) => r.sample_count > 0)
    .sort(
      (a, b) =>
        b.outlier_count / b.sample_count - a.outlier_count / a.sample_count,
    )[0];
  const maxSize = Math.max(0, ...rows.map((r) => r.max));
  const maxNames = rows
    .filter((r) => r.max === maxSize)
    .map((r) => shortRegion(r.region_code, r.region_name));
  const meanAbove = rows.filter((r) => r.mean > r.median).length;
  const medianRange =
    hiMed && loMed
      ? hiMed.median === loMed.median
        ? `${fmtNum(hiMed.median)}기`
        : `${fmtNum(loMed.median)}~${fmtNum(hiMed.median)}기`
      : "—";
  const single = rows.length === 1;
  const skewed = meanAbove > rows.length / 2;
  const findings: ReactNode[] = [];
  if (rows.length) {
    const one = rows[0];
    findings.push(
      single ? (
        <>
          {shortRegion(one.region_code, one.region_name)} 표본{" "}
          {fmtInt(one.sample_count)}곳의 중앙값 <B>{fmtNum(one.median)}기</B>,
          Q1~Q3{" "}
          <B>
            {fmtNum(one.q1)}~{fmtNum(one.q3)}기
          </B>
          , 평균 {fmtNum(one.mean)}기.
        </>
      ) : (
        <>
          지역별 중앙값은 <B>{medianRange}</B>입니다. 가장 높은 지역{" "}
          {medHiNames.join("·")}({fmtNum(hiMed.median)}기), 가장 낮은 지역{" "}
          {medLoNames.join("·")}({fmtNum(loMed.median)}기).
        </>
      ),
    );
    if (!single)
      findings.push(
        <>
          상자 폭(IQR)이 가장 넓은 지역은{" "}
          {wideGroups.map((g, i) => (
            <Fragment key={i}>
              {i > 0 && ", "}
              {g.names.join("·")}{" "}
              <B>
                {fmtNum(g.q1)}~{fmtNum(g.q3)}기
              </B>
            </Fragment>
          ))}
          (IQR {fmtNum(maxIqr)}기{wideGroups.flatMap((g) => g.names).length > 1 ? ", 공동" : ""}).
        </>,
      );
    findings.push(
      <>
        이상치(울타리 밖) 충전소는 <B>{fmtInt(outliers)}곳</B>으로 표본{" "}
        {fmtInt(samples)}곳의 {pct(outliers, samples)}입니다.
        {!single && outShare && (
          <>
            {" "}
            비율이 가장 높은 지역은{" "}
            {shortRegion(outShare.region_code, outShare.region_name)}{" "}
            {pct(outShare.outlier_count, outShare.sample_count)}.
          </>
        )}
      </>,
    );
    findings.push(
      <>
        가장 큰 충전소 규모는 <B>{fmtInt(maxSize)}기</B>({maxNames.join("·")})
        {single
          ? "."
          : `이며, ${rows.length}개 지역 중 ${meanAbove}개 지역에서 평균이 중앙값보다 큽니다.`}
      </>,
    );
  }
  return {
    mode: filtered ? "dynamic" : "fixed",
    modeNote: filtered
      ? "현재 필터 결과로 계산한 요약"
      : `전국 기준 (${DELETION_TEXT[deletionUsed] ?? deletionUsed})`,
    purpose:
      "지역마다 충전소 한 곳에 충전기가 몇 기씩 설치되어 있는지, 그 분포(전형적인 규모와 대형 충전소)를 비교합니다.",
    reason:
      "평균 하나로는 소수의 대형 충전소에 끌려가는 분포를 설명할 수 없어, 중앙값·사분위 범위·수염·이상치를 함께 보여 주는 박스플롯(Seaborn boxplot)을 썼습니다. 값의 범위가 넓어 기본은 로그 눈금입니다.",
    findings,
    interpretation: !rows.length ? (
      "—"
    ) : (
      <>
        {single
          ? "이 조건에서 전형적인 충전소는"
          : "대부분 지역에서 전형적인 충전소는"}{" "}
        {medianRange} 규모입니다.{" "}
        {skewed
          ? `평균이 중앙값보다 큰 지역이 ${meanAbove}곳이고 위쪽 이상치가 많아 분포는 오른쪽으로 긴 꼬리를 가집니다. 소수의 대형 충전소가 평균을 끌어올리므로 지역 비교에는 평균보다 중앙값과 사분위 범위가 더 적합합니다.`
          : `평균이 중앙값보다 크지 않아 이 조건에서는 오른쪽 꼬리가 뚜렷하지 않습니다. 이상치는 ${fmtInt(outliers)}곳입니다.`}{" "}
        이상치는 오류로 판단해 제거하지 않았습니다.
      </>
    ),
    caution: `기준: ${DELETION_TEXT[deletionUsed] ?? deletionUsed}을 필터한 뒤 (지역, 충전소 ID)별 고유 충전기 수를 1개 표본으로 집계했습니다. 비삭제 표시는 실제 이용 가능 상태를 뜻하지 않습니다. 사분위수는 선형 보간, 수염은 1.5×IQR 울타리 안 실제 최소·최대이며 min/max와 다릅니다. 유형·기관 필터 시 해당 충전기만으로 산정한 규모입니다.`,
    source: `${CH_SRC}, /api/station-size-distribution (표본 ${fmtInt(sampleTotal)}곳)`,
    variables: [
      "region_code",
      "sample_count",
      "q1",
      "median",
      "q3",
      "whisker_low",
      "whisker_high",
      "outlier_distribution",
      "mean",
    ],
  };
}

/* ---------------- G6 유형 구성 ---------------- */
export function insightTypes(
  rows: ChargerTypeRow[],
  filtered: boolean,
): InsightProps {
  const sorted = [...rows].sort((a, b) => b.charger_count - a.charger_count);
  const total = sum(rows.map((r) => r.charger_count));
  const [a, b] = sorted;
  const restShare = a && b ? 100 - (a.share_pct ?? 0) - (b.share_pct ?? 0) : 0;
  return {
    mode: filtered ? "dynamic" : "fixed",
    purpose: "충전기의 공식 커넥터 유형이 어떻게 구성되어 있는지 확인합니다.",
    reason:
      '전체 대비 구성비를 한눈에 보기 위해 도넛을 사용했습니다. 유형이 11개라 상위 4개만 색으로 구분하고 나머지는 회색 "기타"로 묶었습니다.',
    findings: a
      ? [
          <>
            관측된 유형 {rows.length}종, 총 {fmtInt(total)}기.
          </>,
          <>
            1위 {a.charger_type_code} {a.official_definition}{" "}
            <B>{fmtPct(a.share_pct, 2)}</B>
            {b && (
              <>
                , 2위 {b.charger_type_code} {b.official_definition}{" "}
                <B>{fmtPct(b.share_pct, 2)}</B>
              </>
            )}
            .
          </>,
          ...(b
            ? [
                <>
                  나머지 {rows.length - 2}개 유형 합계 {fmtPct(restShare, 2)}.
                </>,
              ]
            : []),
        ]
      : [],
    interpretation: a ? (
      <>
        {a.official_definition}이 {fmtPct(a.share_pct)}로 압도적이어서 유형
        구성은 사실상 한 유형 중심입니다. 다만 커넥터 유형은 출력(급속·완속)을
        직접 뜻하지 않으므로 충전 속도 구성은 출력 분포(그래프 7)로 따로
        확인합니다.
      </>
    ) : (
      "—"
    ),
    caution:
      "09 NACS는 정의만 있고 관측 0건입니다. 유형을 출력 구간으로 자동 변환하지 않습니다.",
    source: `${CH_SRC}, /api/charger-types (정의: 한국환경공단 활용가이드 v1.25)`,
    variables: [
      "charger_type_code",
      "official_definition",
      "charger_count",
      "share_pct",
    ],
  };
}

/* ---------------- G7 출력 분포 ---------------- */
export function insightOutput(
  rows: ChargerOutputRow[],
  stats: OutputStatistics | undefined,
  filtered: boolean,
): InsightProps {
  const valid = rows.filter(
    (r) => r.value_status === "positive_numeric" && r.output_kw !== null,
  );
  const vTotal = sum(valid.map((r) => r.charger_count));
  const mode = [...valid].sort((a, b) => b.charger_count - a.charger_count)[0];
  const le7 = sum(
    valid.filter((r) => (r.output_kw ?? 0) <= 7).map((r) => r.charger_count),
  );
  const ge100 = sum(
    valid.filter((r) => (r.output_kw ?? 0) >= 100).map((r) => r.charger_count),
  );
  const ge200 = sum(
    valid.filter((r) => (r.output_kw ?? 0) >= 200).map((r) => r.charger_count),
  );
  const outputKinds = new Set(valid.map((r) => r.output_kw)).size;
  const highOutputKinds = new Set(
    valid.filter((r) => (r.output_kw ?? 0) >= 100).map((r) => r.output_kw),
  ).size;
  return {
    mode: filtered ? "dynamic" : "fixed",
    purpose:
      "개별 충전기의 정격 출력(kW)이 어떤 값에 몰려 있고 고출력 충전기가 얼마나 되는지 분포로 확인합니다.",
    reason:
      "정격 출력의 분포를 히스토그램으로 표시하고, 출력 크기의 차이를 비교하기 위해 x축을 로그 눈금으로 했습니다. 분포의 모양을 매끄럽게 보도록 KDE 곡선(Seaborn histplot kde=True)을 겹쳤습니다.",
    findings:
      vTotal && stats
        ? [
            <>
              유효 출력 <B>{fmtInt(vTotal)}기</B>, 중앙값{" "}
              <B>{stats.median_kw}kW</B>, 범위 {stats.min_kw}~{stats.max_kw}kW.
            </>,
            <>
              최빈값 <B>{mode?.output_kw}kW</B> ({fmtInt(mode?.charger_count)}
              기, {pct(mode?.charger_count ?? 0, vTotal)}), 7kW 이하{" "}
              {pct(le7, vTotal)}.
            </>,
            <>
              100kW 이상 <B>{pct(ge100, vTotal)}</B> ({fmtInt(ge100)}기), 200kW
              이상 {pct(ge200, vTotal)} ({fmtInt(ge200)}기).
            </>,
          ]
        : [],
    interpretation: vTotal ? (
      <>
        {outputKinds === 1 ? (
          <>이 조건의 유효 출력은 {mode?.output_kw}kW 한 가지로 동일합니다.</>
        ) : (
          <>
            관측 정격 출력은 {outputKinds}종이며, 최빈값 {mode?.output_kw}kW가{" "}
            {pct(mode?.charger_count ?? 0, vTotal)}를 차지합니다.
          </>
        )}{" "}
        {highOutputKinds === 0 ? (
          <>100kW 이상 출력은 없습니다.</>
        ) : (
          <>
            100kW 이상 출력은 {fmtInt(ge100)}기({pct(ge100, vTotal)})이며,
            관측 정격값은 {highOutputKinds}종입니다.
          </>
        )}
      </>
    ) : (
      "—"
    ),
    caution: `정격 출력은 실제 충전 속도·동시 공급전력이 아닙니다. 결측·무효 값 ${fmtInt(stats?.invalid_or_missing_count)}기는 막대와 KDE에서 제외했습니다. KDE 대역폭은 구간 폭(log10 0.125)으로 고정했습니다. 세로축이 로그일 때는 막대 높이 차이가 선형 대수 차이가 아닙니다.`,
    source: `${CH_SRC}, /api/charger-output (meta.output_statistics)`,
    variables: ["output_kw", "charger_count", "value_status"],
  };
}

/* ---------------- G8 지역 × 출력 구간 ---------------- */
export function insightHeatmap(
  rows: HeatRow[],
  columns: string[],
  filtered: boolean,
  selected?: string,
): InsightProps {
  const colTotals = columns.map((_, c) => sum(rows.map((r) => r.counts[c])));
  const total = sum(colTotals);
  // 100kW 이상 = 100–200, 200 이상 (열 인덱스 3, 4)
  const hi = rows
    .map((r) => {
      const t = sum(r.counts);
      return {
        r,
        t,
        share: t ? ((r.counts[3] + r.counts[4]) / t) * 100 : 0,
        low: t ? (r.counts[0] / t) * 100 : 0,
      };
    })
    .sort((a, b) => b.share - a.share);
  const sel = hi.find((h) => h.r.key === selected);
  const findings: ReactNode[] = total
    ? [
        <>
          전체 구성:{" "}
          {columns
            .map((c, i) => `${c} ${pct(colTotals[i], total)}`)
            .slice(0, 5)
            .join(", ")}
          .
        </>,
        <>
          100kW 이상 비중 최고{" "}
          <B>
            {hi[0].r.label} {fmtPct(hi[0].share)}
          </B>
          , 최저{" "}
          <B>
            {hi[hi.length - 1].r.label} {fmtPct(hi[hi.length - 1].share)}
          </B>
          .
        </>,
      ]
    : [];
  if (sel)
    findings.push(
      <>
        선택한 {sel.r.label}: 30kW 미만 {fmtPct(sel.low)}, 100kW 이상{" "}
        <B>{fmtPct(sel.share)}</B>.
      </>,
    );
  return {
    mode: filtered ? "dynamic" : "fixed",
    modeNote: filtered
      ? "유형·삭제 표시·운영기관 필터 반영 (지역 필터는 행 강조만)"
      : undefined,
    purpose: "지역별로 충전기 출력 구성이 어떻게 다른지 비교합니다.",
    reason:
      "16개 지역 × 6개 출력 구간의 표 형태 자료를 색의 진하기로 비교하기 위해 히트맵(Seaborn heatmap, annot=True)을 썼습니다. 지역 규모 차이를 없애려고 행 기준 비율을 표시합니다.",
    findings,
    interpretation: total ? (
      <>
        모든 지역에서 30kW 미만 저출력이 가장 큰 비중이지만, 고출력(100kW 이상)
        비중은 지역에 따라 {fmtPct(hi[hi.length - 1].share)}에서{" "}
        {fmtPct(hi[0].share)}까지 달라 지역마다 출력 구성이 다릅니다. 색은
        열마다 따로 정규화했으므로 같은 열 안에서 지역을 비교해 읽습니다.
      </>
    ) : (
      "—"
    ),
    caution:
      "구간은 보고서 PNG 10과 같습니다(<30, 30–50, 50–100, 100–200, 200kW 이상, 미상). 출력 구간은 정책상 급속·완속 분류를 대신하지 않습니다.",
    source: `${CH_SRC}, /api/charger-output (지역별 16회 요청)`,
    variables: ["region_code", "output_kw", "charger_count"],
  };
}

/* ---------------- 연간 설치 ---------------- */
export function insightAnnual(rows: GrowthRow[]): InsightProps {
  const complete = rows.filter((r) => !r.is_partial_year);
  const peak = complete.reduce<GrowthRow | null>(
    (m, r) =>
      !m || r.annual_installed_count > m.annual_installed_count ? r : m,
    null,
  );
  const changes = complete
    .slice(1)
    .map((r, i) => ({
      r,
      prev: complete[i],
      d: r.annual_installed_count - complete[i].annual_installed_count,
    }));
  const up = changes.filter((c) => c.d > 0).sort((a, b) => b.d - a.d)[0];
  const down = changes.filter((c) => c.d < 0).sort((a, b) => a.d - b.d)[0];
  const partial = rows.find((r) => r.is_partial_year);
  const lastC = complete[complete.length - 1];
  const findings: ReactNode[] = [];
  if (peak)
    findings.push(
      <>
        선택 구간의 완료 연도 중 최대 설치는{" "}
        <B>
          {peak.year}년 {fmtInt(peak.annual_installed_count)}기
        </B>
        .
      </>,
    );
  if (up && up.d > 0)
    findings.push(
      <>
        가장 큰 증가: {up.prev.year}→{up.r.year}년 <B>+{fmtInt(up.d)}기</B> (
        {fmtInt(up.prev.annual_installed_count)} →{" "}
        {fmtInt(up.r.annual_installed_count)}).
      </>,
    );
  if (down && down.d < 0)
    findings.push(
      <>
        가장 큰 감소: {down.prev.year}→{down.r.year}년 <B>{fmtInt(down.d)}기</B>
        .
      </>,
    );
  if (partial)
    findings.push(
      <>
        2026년(부분 연도)은 현재까지 {fmtInt(partial.annual_installed_count)}
        기로, 연간 합계와 비교하지 않습니다.
      </>,
    );
  return {
    mode: "dynamic",
    modeNote: "선택한 연도 구간으로 계산",
    purpose: "해마다 새로 설치된 충전기 수가 어떻게 변해 왔는지 확인합니다.",
    reason:
      "연도라는 순서형 범주의 값 크기 비교이므로 세로 막대를 썼습니다. 부분 연도는 빗금으로 구분했습니다.",
    findings,
    interpretation:
      peak && complete.length >= 2 ? (
        <>
          {up
            ? `설치량은 ${up.r.year}년에 가장 크게 늘었습니다. `
            : "선택 구간에서 증가한 해는 없습니다. "}
          선택 구간의 최대 설치량은 {peak.year}년
          {" "}{fmtInt(peak.annual_installed_count)}기였습니다.
          {lastC && lastC.year > peak.year
            ? ` 마지막 완료 연도 ${lastC.year}년은 정점의 ${pct(lastC.annual_installed_count, peak.annual_installed_count, 0)} 수준입니다.`
            : ""}{" "}
          연간 설치량이 줄어도 누적 수는 계속 늘어나므로 누적 그래프와 함께
          읽습니다.
        </>
      ) : (
        "선택 구간에 완료 연도가 부족해 변화를 계산하지 않았습니다."
      ),
    caution: `원본 통계 파일의 연간값이며 충전기 API 현황과 모집단이 다릅니다. 2026년은 집계 마감일이 기재되지 않은 부분 연도입니다. ${GROWTH_SNAPSHOT_NOTE} ${GROWTH_REVISION_NOTE}`,
    source: GROWTH_SRC,
    variables: ["year", "annual_installed_count", "is_partial_year"],
  };
}

/* ---------------- G9 누적 설치 ---------------- */
export function insightCumulative(
  rows: GrowthRow[],
  fullRows: GrowthRow[] = rows,
): InsightProps {
  const complete = rows.filter((r) => !r.is_partial_year);
  const first = complete[0];
  const last = complete[complete.length - 1];
  const partial = rows.find((r) => r.is_partial_year);
  // '최초 돌파'는 선택 구간이 아니라 전체 시계열(2011~)에서 판단합니다.
  const fullSorted = [...fullRows].sort((x, y) => x.year - y.year);
  const crossAll = fullSorted.find((r) => r.cumulative_count >= 100_000);
  // 고정 숫자 대신 응답에서 읽은 부분 연도 누적값을 주의사항에 씁니다(구간 선택과 무관하게 전체 시계열 기준).
  const latestPartial = [...fullSorted].reverse().find((r) => r.is_partial_year);
  const isFiltered =
    rows.length > 0 &&
    fullSorted.length > 0 &&
    (rows[0].year !== fullSorted[0].year ||
      rows[rows.length - 1].year !== fullSorted[fullSorted.length - 1].year);
  const crossInRange = crossAll
    ? rows.some((r) => r.year === crossAll.year)
    : false;
  const firstInRange = rows[0];
  const base2021 = complete.find((r) => r.year === 2021);
  const steep = complete.reduce<GrowthRow | null>(
    (m, r) =>
      !m || r.annual_installed_count > m.annual_installed_count ? r : m,
    null,
  );
  const findings: ReactNode[] = [];
  if (last)
    findings.push(
      <>
        {last.year}년 말 누적(2011년부터) <B>{fmtInt(last.cumulative_count)}기</B>.
      </>,
    );
  if (crossAll)
    findings.push(
      <>
        전체 기간(2011년~) 기준 누적 10만 기를 처음 넘은 해:{" "}
        <B>{crossAll.year}년</B> ({fmtInt(crossAll.cumulative_count)}기)
        {isFiltered && !crossInRange ? ", 선택 구간 밖" : ""}.
      </>,
    );
  if (isFiltered && firstInRange)
    findings.push(
      <>
        선택 구간의 첫 관측 연도 {firstInRange.year}년 누적{" "}
        {fmtInt(firstInRange.cumulative_count)}기
        {crossAll && firstInRange.year > crossAll.year
          ? " (이미 10만 기를 넘은 상태)"
          : ""}
        .
      </>,
    );
  if (base2021 && last && last.year > 2021)
    findings.push(
      <>
        2021년 → {last.year}년 누적{" "}
        <B>
          {(last.cumulative_count / base2021.cumulative_count).toFixed(1)}배
        </B>{" "}
        ({fmtInt(base2021.cumulative_count)} → {fmtInt(last.cumulative_count)}).
      </>,
    );
  if (partial)
    findings.push(
      <>2026년 부분 연도 누적 {fmtInt(partial.cumulative_count)}기 (점선).</>,
    );
  return {
    mode: "dynamic",
    modeNote: isFiltered
      ? `선택 구간 ${rows[0].year}–${rows[rows.length - 1].year}년만 표시 · 누적값은 2011년부터의 전체 누적 (최초 돌파 연도도 전체 기간 기준)`
      : "선택한 연도 구간으로 계산 (누적값은 원본 그대로)",
    purpose:
      "충전기 설치가 시간에 따라 얼마나 쌓여 왔는지, 증가 속도가 언제 빨라졌는지 확인합니다.",
    reason:
      "누적량의 시간 변화를 면적으로 강조하기 위해 영역 그래프(fill_between)를 썼습니다. 연간 설치와 단위가 같아도 크기 차이가 커서 이중 축 대신 별도 그래프로 나눴습니다.",
    findings,
    interpretation:
      first && last ? (
        <>
          {isFiltered ? "선택 구간에서 " : ""}
          {first.year}년 {fmtInt(first.cumulative_count)}기에서 {last.year}년{" "}
          {fmtInt(last.cumulative_count)}기로 늘었습니다.
          {complete.length >= 2 && steep ? (
            <>
              {" "}
              곡선의 기울기는 그해 연간 설치량과 같으므로{" "}
              {isFiltered ? "이 구간에서는 " : ""}
              {`${steep.year}년(${fmtInt(steep.annual_installed_count)}기)에 가장 가파르고`}
              {last.year > steep.year
                ? `, ${last.year}년에는 그 ${pct(last.annual_installed_count, steep.annual_installed_count, 0)} 수준으로 완만해졌습니다.`
                : "."}
            </>
          ) : null}
        </>
      ) : (
        "—"
      ),
    caution: `누적값은 선택 구간으로 다시 계산하지 않은 원본 값입니다.${
      latestPartial
        ? ` ${latestPartial.year}년 누적 ${fmtInt(latestPartial.cumulative_count)}기는 프로젝트가 2026-10-15에 저장한 당시 표의 값이며 현재 공식 최신값이 아닙니다.`
        : ""
    } 충전기 API 현황 527,433기와 모집단이 달라 서로 맞추지 않습니다. ${GROWTH_REVISION_NOTE}`,
    source: GROWTH_SRC,
    variables: ["year", "cumulative_count", "is_partial_year"],
  };
}

/* ---------------- G10 운영기관 트리맵 ---------------- */
export function insightOperators(
  top: OperatorRow[],
  matchedTotal: number,
  operatorCount: number,
  filtered: boolean,
  operatorSelected = false,
): InsightProps {
  const s = (n: number) => sum(top.slice(0, n).map((r) => r.charger_count));
  return {
    mode: filtered ? "dynamic" : "fixed",
    // 이 그래프는 운영기관 필터를 계산에서 제외하고(선택 기관은 강조만) 지역·유형·삭제 필터만 적용합니다.
    modeNote: filtered
      ? "지역·유형·삭제 필터 결과로 계산 (운영기관 필터는 계산에서 제외)"
      : operatorSelected
        ? "전국 기준 고정 분석 (운영기관 필터는 계산에서 제외)"
        : undefined,
    purpose:
      "충전기 운영이 소수 기관에 집중되어 있는지, 여러 기관에 분산되어 있는지 확인합니다.",
    reason:
      '100개가 넘는 운영기관의 점유 규모를 면적으로 한 번에 비교하기 위해 트리맵을 썼습니다. 운영기관 ID 기준 상위 20개만 칸으로 그리고 나머지는 "기타" 한 칸으로 묶었습니다.',
    findings:
      top.length && matchedTotal
        ? [
            <>
              1위 {top[0].operator_name}{" "}
              <B>{pct(top[0].charger_count, matchedTotal)}</B> (
              {fmtInt(top[0].charger_count)}기).
            </>,
            <>
              상위 5개 <B>{pct(s(5), matchedTotal)}</B>, 상위 10개{" "}
              <B>{pct(s(10), matchedTotal)}</B>, 운영기관 ID{" "}
              {fmtInt(operatorCount)}개.
            </>,
          ]
        : [],
    interpretation:
      top.length && matchedTotal ? (
        <>
          상위 10개 운영기관이 전체의 {pct(s(10), matchedTotal)}를 운영하고, 나머지{" "}
          {fmtInt(Math.max(0, operatorCount - 10))}개 운영기관이{" "}
          {pct(matchedTotal - s(10), matchedTotal)}를 나눠 갖습니다. 대형 사업자
          중심이지만 소규모 운영 주체도 매우 많은 구조입니다.
        </>
      ) : (
        "—"
      ),
    caution:
      "운영기관 ID(busiId) 기준입니다. 같은 ID의 서로 다른 운영기관명 표기(예: 파워큐브/파워큐브코리아, 사명 변경·위탁 운영사)는 하나로 셉니다. 같은 ID가 반드시 같은 법인이라는 뜻은 아니며, ID와 운영 법인이 다를 수 있는 충전기는 약 1.1%입니다. 운영기관별 충전소 수는 합산하지 않습니다. 운영기관 필터를 선택해도 이 그래프의 계산에는 적용하지 않고 선택한 기관을 강조만 합니다(지역·유형·삭제 필터만 적용).",
    source: `${CH_SRC}, /api/operators (상위 20개) + meta.matched`,
    variables: ["operator_id", "operator_name", "charger_count", "share_pct"],
  };
}
