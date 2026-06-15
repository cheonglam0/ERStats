import type { Character, StatBlock, StatKey } from "../types.js";
import { STAT_META } from "./StatPills.js";

/**
 * 스탯 구성 비율 분해 — 각 스탯이 어디서 왔는지(기여도)를 보여준다.
 *   - 기본:  1레벨 기본 스탯
 *   - 성장:  레벨당 증가율 × (레벨-1)
 *   - 아이템: 장착 아이템 합산(레벨 환산 후)
 * 합계 대비 각 출처의 비율(%)을 누적 막대로 표시.
 */

interface Row {
  key: StatKey;
  base: number;
  growth: number;
  item: number;
  total: number;
}

const ORDER = Object.keys(STAT_META) as StatKey[];

function buildRows(character: Character, level: number, itemStats: StatBlock): Row[] {
  const steps = Math.max(0, level - 1);
  const rows: Row[] = [];
  for (const key of ORDER) {
    const base = character.baseStats[key] ?? 0;
    const growth = (character.growthPerLevel[key] ?? 0) * steps;
    const item = itemStats[key] ?? 0;
    const total = base + growth + item;
    if (total === 0) continue;
    rows.push({ key, base, growth, item, total });
  }
  return rows;
}

const fmtVal = (k: StatKey, v: number) =>
  STAT_META[k].pct ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 10) / 10}`;
const share = (part: number, total: number) => (total !== 0 ? (part / total) * 100 : 0);

export function StatBreakdown({
  character,
  level,
  itemStats,
}: {
  character: Character;
  level: number;
  itemStats: StatBlock;
}) {
  const rows = buildRows(character, level, itemStats);
  if (rows.length === 0) return <p className="hint">표시할 스탯이 없습니다.</p>;

  return (
    <div className="stat-breakdown">
      <div className="bd-legend">
        <span className="bd-key bd-base">기본</span>
        <span className="bd-key bd-growth">성장(레벨)</span>
        <span className="bd-key bd-item">아이템</span>
      </div>
      <ul className="bd-list">
        {rows.map((r) => {
          const bP = share(r.base, r.total);
          const gP = share(r.growth, r.total);
          const iP = share(r.item, r.total);
          return (
            <li key={r.key} className="bd-row">
              <div className="bd-head">
                <span className="bd-label">{STAT_META[r.key].label}</span>
                <span className="bd-total">{fmtVal(r.key, r.total)}</span>
              </div>
              <div className="bd-bar" title={`기본 ${bP.toFixed(0)}% · 성장 ${gP.toFixed(0)}% · 아이템 ${iP.toFixed(0)}%`}>
                {bP > 0 && <span className="bd-seg bd-base" style={{ width: `${bP}%` }} />}
                {gP > 0 && <span className="bd-seg bd-growth" style={{ width: `${gP}%` }} />}
                {iP > 0 && <span className="bd-seg bd-item" style={{ width: `${iP}%` }} />}
              </div>
              <div className="bd-shares">
                {r.base !== 0 && <span className="bd-base">기본 {bP.toFixed(0)}%</span>}
                {r.growth !== 0 && <span className="bd-growth">성장 {gP.toFixed(0)}%</span>}
                {r.item !== 0 && <span className="bd-item">아이템 {iP.toFixed(0)}%</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
