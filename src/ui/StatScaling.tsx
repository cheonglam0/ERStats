import type { Character, StatBlock, StatKey } from "../types.js";
import { STAT_META, fmtCooldownResult } from "./StatPills.js";

/**
 * 스탯 성장·효율 표 — "구성 비율"만으로는 안 보이는 두 가지를 수치로 보여준다.
 *
 *  1) 레벨당 성장:  캐릭터의 growthPerLevel (이 레벨에서 1레벨 올릴 때 늘어나는 양)
 *  2) 균등 +N% 필요량:  모든 스탯을 같은 비율(N%)로 올리려면 각 스탯을 얼마나 더해야 하는지
 *                       = 현재값 × N%.  현재값이 클수록 더 많은 절대량이 필요하다.
 *  3) +1당 효율:  스탯 1단위(%스탯은 1%p)를 올렸을 때 그 스탯이 몇 % 오르는지 = 단위 / 현재값.
 *                 현재값이 작을수록 효율이 높다 → 다른 스탯과의 상대 효율을 막대로 비교.
 *
 *  (2)와 (3)은 서로 역수 관계로, "어디에 투자해야 전체가 고르게 오르는가"를 양방향에서 본다.
 */

const ORDER = Object.keys(STAT_META) as StatKey[];

/** 균등 증가 기준 비율(10%). 모든 스탯을 +10% 했을 때의 필요량을 보여준다. */
const UNIFORM_P = 0.1;

interface Row {
  key: StatKey;
  total: number;
  growth: number; // 레벨당 성장
  uniformStep: number; // 균등 +10%에 필요한 추가량
  marginalPct: number; // +1단위당 상승률(%). 현재값 0이면 0(별도 표기)
  isMain: boolean;
}

const fmtVal = (k: StatKey, v: number): string =>
  STAT_META[k].pct ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 10) / 10}`;
/** 증가 단위: 일반 스탯은 +1, 퍼센트 스탯은 +1%p(0.01). */
const unitOf = (k: StatKey): number => (STAT_META[k].pct ? 0.01 : 1);
const unitLabel = (k: StatKey): string => (STAT_META[k].pct ? "+1%p" : "+1");

export function StatScaling({
  character,
  level,
  totalStats,
  mainStat,
}: {
  character: Character;
  level: number;
  totalStats: StatBlock;
  mainStat: "attackPower" | "skillAmp";
}) {
  const rows: Row[] = [];
  for (const key of ORDER) {
    const total = totalStats[key] ?? 0;
    const growth = character.growthPerLevel[key] ?? 0;
    const isMain = key === mainStat;
    // 값도 성장도 없는 스탯은 생략. 단, 주 공격 스탯은 0이라도 항상 노출(요구사항).
    if (total === 0 && growth === 0 && !isMain) continue;
    const unit = unitOf(key);
    const marginalPct = total > 0 ? (unit / total) * 100 : 0;
    rows.push({ key, total, growth, uniformStep: total * UNIFORM_P, marginalPct, isMain });
  }
  if (rows.length === 0) return <p className="hint">표시할 스탯이 없습니다.</p>;

  const maxMarg = Math.max(...rows.map((r) => r.marginalPct), 0);

  return (
    <div className="stat-scaling">
      <table className="sc-table">
        <thead>
          <tr>
            <th className="sc-stat">스탯</th>
            <th>현재값</th>
            <th title="이 레벨에서 1레벨 올릴 때 늘어나는 양">레벨당</th>
            <th title={`모든 스탯을 +${UNIFORM_P * 100}% 하려면 이 스탯에 더해야 하는 양`}>
              균등 +{UNIFORM_P * 100}%
            </th>
            <th title="스탯 1단위(%스탯은 1%p) 추가 시 그 스탯이 오르는 비율 — 낮은 현재값일수록 효율↑">
              1당 효율
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const m = STAT_META[r.key];
            const relW = maxMarg > 0 ? (r.marginalPct / maxMarg) * 100 : 0;
            const zeroMain = r.isMain && r.total === 0;
            return (
              <tr key={r.key} className={r.isMain ? "sc-row sc-main" : "sc-row"}>
                <td className="sc-stat">
                  {m.label}
                  {r.isMain && <span className="sc-badge">주</span>}
                </td>
                <td className="sc-num">
                  {r.key === "cooldownReduction" ? fmtCooldownResult(r.total) : fmtVal(r.key, r.total)}
                </td>
                <td className="sc-num sc-growth">
                  {r.growth !== 0 ? `+${fmtVal(r.key, r.growth)}` : "—"}
                </td>
                <td className="sc-num">
                  {r.uniformStep !== 0 ? `+${fmtVal(r.key, r.uniformStep)}` : "—"}
                </td>
                <td className="sc-eff">
                  {zeroMain ? (
                    <span className="sc-note">아이템으로 확보</span>
                  ) : r.marginalPct > 0 ? (
                    <span className="sc-eff-wrap" title={`${unitLabel(r.key)} 당 +${r.marginalPct.toFixed(2)}%`}>
                      <span className="sc-eff-bar">
                        <span className="sc-eff-fill" style={{ width: `${relW}%` }} />
                      </span>
                      <span className="sc-eff-val">+{r.marginalPct.toFixed(2)}%</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <details className="mini-help">
        <summary>설명</summary>
        <p className="hint sc-hint">
          <b>균등 +{UNIFORM_P * 100}%</b>: 모든 스탯을 같은 비율로 올릴 때 이 스탯에 더해야 하는 양(=현재값×{UNIFORM_P * 100}%).
          <b> 1당 효율</b>: 스탯을 1{`(%`}스탯은 1%p{`)`} 올릴 때 그 스탯이 오르는 비율 — 막대가 길수록 다른 스탯보다 투자 효율이 높습니다.
        </p>
      </details>
    </div>
  );
}
