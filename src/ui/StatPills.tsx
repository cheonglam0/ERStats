import type { StatBlock, StatKey } from "../types.js";
import { STAT_LINE } from "../constants.js";

/** 스탯 표시용 메타: 라벨 + 값 포맷(퍼센트형 여부). */
export const STAT_META: Record<StatKey, { label: string; pct?: boolean }> = {
  attackPower: { label: "공격력" },
  skillAmp: { label: "스킬증폭" },
  attackSpeed: { label: "공격속도", pct: true },
  critChance: { label: "치명확률", pct: true },
  critDamage: { label: "치명피해", pct: true },
  armorPenFlat: { label: "방관(고정)" },
  armorPenPct: { label: "방관", pct: true },
  cooldownReduction: { label: "쿨감", pct: true },
  maxHp: { label: "체력" },
  defense: { label: "방어력" },
  hpRegen: { label: "체력재생" },
  lifesteal: { label: "흡혈", pct: true },
  healAmp: { label: "회복증가", pct: true },
  moveSpeed: { label: "이동속도" },
  tenacity: { label: "방해저항", pct: true },
};

const ORDER: StatKey[] = Object.keys(STAT_META) as StatKey[];

export function StatPills({ stats }: { stats: StatBlock }) {
  const entries = ORDER.filter((k) => (stats[k] ?? 0) !== 0);
  if (entries.length === 0) return <span className="pills empty">—</span>;
  return (
    <span className="pills">
      {entries.map((k) => {
        const v = stats[k]!;
        const m = STAT_META[k];
        const text = m.pct ? `${(v * 100).toFixed(0)}%` : `${Math.round(v)}`;
        return (
          <span key={k} className={`pill ${STAT_LINE[k]}`}>
            {m.label} <b>{text}</b>
          </span>
        );
      })}
    </span>
  );
}
