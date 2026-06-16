import { DEFENSE_K } from "../constants.js";

/**
 * 실질 체력(EHP) 효율 분석 — 방어력과 체력의 상관관계를 수치로 보여준다.
 *
 * 게임 피해 공식의 방어력 항: 받는 피해 × 100 / (100 + 방어력)
 *   → 피해감소율 = 방어력 / (방어력 + K),  K = DEFENSE_K(=100, 게임 실상수)
 *   → 실질체력(EHP) = 체력 / (1 - 감소율) = 체력 × (방어력 + K) / K = 체력 × (1 + 방어력/K)
 *
 * 핵심 관계 (체력 = HP, 방어력 = DEF):
 *   - 방어력 +1당 EHP 증가 = HP / K            (절대값은 방어력과 무관하게 일정)
 *   - 체력  +1당 EHP 증가 = (DEF + K) / K       (방어력이 높을수록 체력이 더 값짐)
 *   두 한계효율이 같아지는 지점: DEF = HP - K  → 이보다 방어력이 낮으면 방어력 투자가 이득.
 *
 * "방어력은 높을수록 효율 감소"는 배수(비율) 관점의 표현:
 *   EHP는 DEF=0에서도 HP만큼 존재(절편)하므로 EHP = (HP/K)·DEF + HP 의 1차식(정비례 아님).
 *   그래서 평균효율 EHP/DEF 는 DEF가 커질수록 감소한다.
 */

const fmt = (x: number): string =>
  Number.isFinite(x) ? x.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "∞";

const CHART_DEFS = [0, 50, 100, 150, 200, 250, 300];

export function EhpAnalyzer({ maxHp, defense }: { maxHp: number; defense: number }) {
  const K = DEFENSE_K;
  const ehp = (hp: number, def: number) => (hp * (def + K)) / K;
  const curEhp = ehp(maxHp, defense);

  // 한계효율: 지금 상태에서 1포인트 추가 시 EHP 증가량
  const perDef = maxHp / K; // 방어력 +1 → EHP
  const perHp = (defense + K) / K; // 체력 +1 → EHP
  const defMoreEfficient = perDef >= perHp;

  // 등가 환산 (같은 EHP 증가를 내는 양)
  const defEqHp = perDef / perHp; // 방어력 1 ≡ 체력 defEqHp 점
  const hpEqDef = perHp / perDef; // 체력 1 ≡ 방어력 hpEqDef 점

  // 한계효율이 같아지는(균형) 방어력
  const balanceDef = Math.max(0, maxHp - K);

  const maxBar = Math.max(perDef, perHp);

  return (
    <div className="ehp-analyzer">
      <div className="ehp-cur">
        체력 <b>{fmt(maxHp)}</b> · 방어력 <b>{fmt(defense)}</b>
        <span className="ehp-arrow">→</span>
        실질체력 <b className="ehp-big">{fmt(curEhp)}</b>
        <span className="ehp-formula">= {fmt(maxHp)} × (100+{fmt(defense)})/100</span>
      </div>

      {/* 한계효율: 1포인트당 EHP 증가 비교 */}
      <div className="ehp-block">
        <div className="ehp-block-title">지금 1포인트 투자 시 실질체력 증가</div>
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
          <span className="ehp-mlabel">체력 +1</span>
          <span className="ehp-mbar">
            <span
              className="ehp-mfill hp"
              style={{ width: `${maxBar > 0 ? (perHp / maxBar) * 100 : 0}%` }}
            />
          </span>
          <span className="ehp-mval">+{fmt(perHp)}</span>
        </div>
        <p className="ehp-reco">
          현재는 <b className={defMoreEfficient ? "def" : "hp"}>
            {defMoreEfficient ? "방어력" : "체력"}
          </b>{" "}
          투자가 더 효율적입니다.
          {" "}
          (균형점: 방어력 <b>{fmt(balanceDef)}</b> — 이보다 낮으면 방어력, 높으면 체력 우위)
        </p>
      </div>

      {/* 등가 환산 */}
      <div className="ehp-block">
        <div className="ehp-block-title">같은 실질체력을 내려면 (등가 환산)</div>
        <ul className="ehp-eq">
          <li>
            방어력 <b>+1</b> ≡ 체력 <b className="hp">+{fmt(defEqHp)}</b>
          </li>
          <li>
            체력 <b>+1</b> ≡ 방어력 <b className="def">+{fmt(hpEqDef)}</b>
          </li>
          <li className="ehp-eq-ex">
            예) 방어력 <b>+40</b> ≡ 체력 <b className="hp">+{fmt(defEqHp * 40)}</b> (둘 다 실질체력 +{fmt(perDef * 40)})
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
