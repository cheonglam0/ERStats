import { useState } from "react";
import { DEFENSE_K } from "../constants.js";
import { HP_DEF_RATIO } from "../gameData.js";

/**
 * 실질 체력(EHP) 효율 분석 — 방어력과 체력의 상관관계를 수치로 보여준다.
 *
 * 게임 피해 공식의 방어력 항: 받는 피해 × 100 / (100 + 방어력)
 *   → 피해감소율 = 방어력 / (방어력 + K),  K = DEFENSE_K(=100, 게임 실상수)
 *   → 실질체력(EHP) = 체력 / (1 - 감소율) = 체력 × (방어력 + K) / K = 체력 × (1 + 방어력/K)
 *
 * 한계효율(1포인트당 EHP):
 *   - 방어력 +1 → HP / K            (방어력과 무관하게 일정)
 *   - 체력  +1 → (DEF + K) / K       (방어력이 높을수록 체력이 더 값짐)
 *
 * 단, 방어력 +1 vs 체력 +1 비교는 불공정하다. 실제 아이템·소비템이 주는 양 자체가
 * 체력은 방어력의 약 10배(데이터상 평균 ~10.6배)다. 그래서 "같은 아이템 예산" 기준으로,
 * 방어력 1 ≈ 체력 R(기본 10)로 환산해 비교한다:
 *   - 방어력 +1   → EHP + HP/K
 *   - 체력  +R    → EHP + R·(DEF+K)/K
 *   두 효율이 같아지는 균형점: DEF = HP/R - K  (이보다 방어력이 낮으면 방어력이 이득).
 *
 * 동치: 방어력 1의 "실질체력 가치"는 체력 HP/(DEF+K)점. 이 값이 아이템 환산비 R보다 크면
 *       방어력 투자가 이득이다 (DEF < HP/R - K 와 동일).
 */

const fmt = (x: number): string =>
  Number.isFinite(x) ? x.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "∞";

const CHART_DEFS = [0, 50, 100, 150, 200, 250, 300];

/** 등급 영문 → 한글 라벨. */
const GRADE_KO: Record<string, string> = {
  Common: "일반",
  Uncommon: "고급",
  Rare: "희귀",
  Epic: "영웅",
  Legend: "전설",
  Mythic: "신화",
};
/** 환산비 기준으로 쓸 등급(데이터 있는 것만, 높은 등급 우선). */
const RATIO_GRADES = ["Legend", "Epic", "Rare", "Uncommon", "Common", "Mythic"].filter(
  (g) => HP_DEF_RATIO.byGrade[g] != null,
);

export function EhpAnalyzer({ maxHp, defense }: { maxHp: number; defense: number }) {
  const K = DEFENSE_K;
  // 환산비 기준 등급("all" = 전체). 데이터에서 산출된 값을 R로 사용.
  const [ratioGrade, setRatioGrade] = useState<string>("all");
  const ratio =
    ratioGrade === "all" ? HP_DEF_RATIO.all : HP_DEF_RATIO.byGrade[ratioGrade] ?? HP_DEF_RATIO.all;
  const r = ratio > 0 ? ratio : 1;

  const ehp = (hp: number, def: number) => (hp * (def + K)) / K;
  const curEhp = ehp(maxHp, defense);

  const perDef = maxHp / K; // 방어력 +1 → EHP
  const perHpUnit = (defense + K) / K; // 체력 +1 → EHP
  const perHpBudget = r * perHpUnit; // 체력 +R → EHP (방어력 1과 동일 예산)
  const defMoreEfficient = perDef >= perHpBudget;

  // 방어력 1의 실질체력 가치(= 체력 몇 점과 같은가). 이 값이 R보다 크면 방어력 이득.
  const defEqHp = perDef / perHpUnit; // = HP / (DEF + K)

  // 같은 아이템 예산 기준 균형 방어력
  const balanceDef = Math.max(0, maxHp / r - K);

  const maxBar = Math.max(perDef, perHpBudget);

  return (
    <div className="ehp-analyzer">
      <div className="ehp-cur">
        체력 <b>{fmt(maxHp)}</b> · 방어력 <b>{fmt(defense)}</b>
        <span className="ehp-arrow">→</span>
        실질체력 <b className="ehp-big">{fmt(curEhp)}</b>
        <span className="ehp-formula">= {fmt(maxHp)} × (100+{fmt(defense)})/100</span>
      </div>

      {/* 환산비 기준 (아이템 데이터에서 산출) */}
      <div className="ehp-ratio">
        <div className="ehp-ratio-head">
          <span className="sf-label">환산비 기준</span>
          <div className="mode-toggle">
            <button
              className={ratioGrade === "all" ? "active" : ""}
              onClick={() => setRatioGrade("all")}
            >
              전체
            </button>
            {RATIO_GRADES.map((g) => (
              <button
                key={g}
                className={ratioGrade === g ? "active" : ""}
                onClick={() => setRatioGrade(g)}
              >
                {GRADE_KO[g] ?? g}
              </button>
            ))}
          </div>
        </div>
        <span className="hint">
          방어력 <b className="def">1</b> ≈ 체력 <b className="hp">{fmt(r)}</b> — 같은 부위·등급
          방어구의 체력÷방어력 평균(데이터 산출). 부위마다 8~20으로 달라 등급으로 보정합니다.
        </span>
      </div>

      {/* 같은 아이템 예산 기준 효율 비교 */}
      <div className="ehp-block">
        <div className="ehp-block-title">같은 아이템 예산 투자 시 실질체력 증가</div>
        <div className="ehp-mrow">
          <span className="ehp-mlabel">방어력 +1</span>
          <span className="ehp-mbar">
            <span
              className="ehp-mfill def"
              style={{ width: `${maxBar > 0 ? (perDef / maxBar) * 100 : 0}%` }}
            />
          </span>
          <span className="ehp-mval">+{fmt(perDef)}</span>
        </div>
        <div className="ehp-mrow">
          <span className="ehp-mlabel">체력 +{fmt(r)}</span>
          <span className="ehp-mbar">
            <span
              className="ehp-mfill hp"
              style={{ width: `${maxBar > 0 ? (perHpBudget / maxBar) * 100 : 0}%` }}
            />
          </span>
          <span className="ehp-mval">+{fmt(perHpBudget)}</span>
        </div>
        <p className="ehp-reco">
          현재 빌드(방어력 {fmt(defense)})에선{" "}
          <b className={defMoreEfficient ? "def" : "hp"}>
            {defMoreEfficient ? "방어력" : "체력"}
          </b>{" "}
          투자가 더 효율적입니다. (균형점: 방어력 <b>{fmt(balanceDef)}</b> — 이보다 낮으면 방어력,
          높으면 체력 우위)
        </p>
      </div>

      {/* 등가 환산 (실질체력 기준 + 아이템 환산비 비교) */}
      <div className="ehp-block">
        <div className="ehp-block-title">방어력 1의 가치 vs 아이템 환산비</div>
        <ul className="ehp-eq">
          <li>
            방어력 <b>+1</b>의 실질체력 가치 = 체력 <b className="hp">{fmt(defEqHp)}</b>점
          </li>
          <li className="ehp-eq-ex">
            아이템은 방어력 1당 체력 <b>~{fmt(r)}</b>를 주므로,{" "}
            {defEqHp >= r ? (
              <>
                <b className="def">방어력</b>이 더 이득 ({fmt(defEqHp)} ≥ {fmt(r)})
              </>
            ) : (
              <>
                <b className="hp">체력</b>이 더 이득 ({fmt(defEqHp)} &lt; {fmt(r)})
              </>
            )}
          </li>
        </ul>
      </div>

      {/* 방어력 구간별 차트: 배수가 '한 칸 밀려' 고방어 효율이 떨어짐을 시각화 */}
      <details className="ehp-chart">
        <summary>방어력 구간별 실질체력 (현재 체력 {fmt(maxHp)} 기준)</summary>
        <table className="ehp-table">
          <thead>
            <tr>
              <th>방어력</th>
              <th>실질체력</th>
              <th title="직전 구간(−50) 대비 실질체력 배수">직전 배수</th>
              <th title="실질체력 ÷ 방어력 — 방어력이 높을수록 감소(고방어 효율↓)">방어력 1당(평균)</th>
            </tr>
          </thead>
          <tbody>
            {CHART_DEFS.map((d, i) => {
              const e = ehp(maxHp, d);
              const prev = i > 0 ? ehp(maxHp, CHART_DEFS[i - 1]!) : 0;
              const mult = prev > 0 ? e / prev : 0;
              const avg = d > 0 ? e / d : 0;
              return (
                <tr key={d} className={d === Math.round(defense) ? "ehp-here" : ""}>
                  <td>{d}</td>
                  <td className="num">{fmt(e)}</td>
                  <td className="num">{mult > 0 ? `×${mult.toFixed(2)}` : "—"}</td>
                  <td className="num">{avg > 0 ? fmt(avg) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="hint">
          방어력 1당 <b>한계</b> 증가량은 항상 +{fmt(perDef)}(체력/100)로 일정하지만,
          <b> 평균</b>(실질체력÷방어력)은 60→45→40…처럼 감소합니다. 0방어에서 이미 체력만큼의
          실질체력이 있어서(절편), 방어력이 그 배수를 따라잡지 못해 생기는 "한 칸 밀림"이 고방어 효율 감소의 원인입니다.
        </p>
      </details>
    </div>
  );
}
