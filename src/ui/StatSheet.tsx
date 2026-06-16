import type { StatBlock, StatKey } from "../types.js";
import { STAT_LINE } from "../constants.js";
import { STAT_META } from "./StatPills.js";

/**
 * 현재 종합 스탯을 공격/생존/유틸 라인으로 묶어 라벨:값 형태로 보여준다.
 * (dak.gg 등 이터널리턴 스탯 사이트의 그룹 표기 관례를 따른 가독성 개선.)
 */

const LINES = [
  { key: "offense", label: "공격", cls: "offense" },
  { key: "survival", label: "생존", cls: "survival" },
  { key: "utility", label: "유틸", cls: "utility" },
] as const;

const ORDER = Object.keys(STAT_META) as StatKey[];

const fmtVal = (k: StatKey, v: number): string =>
  STAT_META[k].pct ? `${(v * 100).toFixed(0)}%` : `${Math.round(v * 10) / 10}`;

export function StatSheet({ stats }: { stats: StatBlock }) {
  const groups = LINES.map((line) => ({
    ...line,
    rows: ORDER.filter((k) => STAT_LINE[k] === line.key && (stats[k] ?? 0) !== 0),
  })).filter((g) => g.rows.length > 0);

  if (groups.length === 0) return <span className="hint">—</span>;

  return (
    <div className="stat-sheet">
      {groups.map((g) => (
        <div key={g.key} className={`ss-group ss-${g.cls}`}>
          <div className="ss-head">{g.label}</div>
          {g.rows.map((k) => (
            <div key={k} className="ss-row">
              <span className="ss-label">{STAT_META[k].label}</span>
              <span className="ss-val">{fmtVal(k, stats[k]!)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
