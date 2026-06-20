/**
 * 빌드 자동 최적화 추천.
 * 기존 한계효율 엔진(itemEfficiency)을 슬롯별로 돌려,
 * "이 슬롯에 무엇을 넣으면 선택한 목표(딜/생존/밸런스)가 가장 오르나"를 제안한다.
 * 다른 슬롯의 현재 장착분을 기준선(baseExtra)으로 두므로, 같은 아이템도 빌드에 따라 추천이 달라진다.
 * 목표를 '생존/밸런스'로 두면 딜이 필요 없는 탱커·서포터에도 맞는 빌드를 뽑는다.
 */

import { useMemo, useState } from "react";
import { itemEfficiency, mergeStats, type ItemEfficiency, type Metric } from "../engine.js";
import type { BuildProfile, StatBlock, TargetProfile } from "../types.js";
import { gameItems, ITEM_SLOTS, itemStatsAtLevel } from "../gameData.js";
import { Sparkles, Check, ArrowUp } from "lucide-react";
import { Button, Icon } from "./kit/index.js";

const ITEM_BY_CODE = new Map(gameItems.map((it) => [String(it.code), it]));
const fmt = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString("ko-KR") : "∞");

type Objective = "dps" | "skill" | "ehp" | "balance";
const OBJECTIVES: { id: Objective; label: string }[] = [
  { id: "dps", label: "딜" },
  { id: "skill", label: "스킬딜" },
  { id: "ehp", label: "생존" },
  { id: "balance", label: "밸런스" },
];
const OBJ_UNIT: Record<Objective, string> = { dps: "DPS", skill: "스킬 DPS", ehp: "EHP", balance: "%p" };
const OBJ_DESC: Record<Objective, string> = {
  dps: "종합 DPS가 가장 오르는 아이템 (딜러용)",
  skill: "스킬 DPS 기준 (스킬 의존 캐릭터)",
  ehp: "유효 체력이 가장 오르는 아이템 (탱커·생존)",
  balance: "딜 증가율 + 생존 증가율 합 (서포터·브루저)",
};

/** 목표별 점수 — 밸런스는 스케일이 다른 DPS·EHP를 변화율(%)로 더한다. */
function score(eff: ItemEfficiency, obj: Objective): number {
  switch (obj) {
    case "ehp":
      return eff.deltaEhp;
    case "skill":
      return eff.deltaSkillDps;
    case "balance":
      return eff.deltaDpsPct + eff.deltaEhpPct;
    default:
      return eff.deltaDps;
  }
}

const defaultObjective = (metric: Metric): Objective =>
  metric === "ehp" ? "ehp" : metric === "skill" ? "skill" : "dps";

interface Props {
  profile: BuildProfile;
  loadout: Record<string, string>;
  metric: Metric;
  target: TargetProfile;
  /** 한 슬롯을 추천 아이템으로 교체. */
  onEquip: (code: string) => void;
  /** 모든 슬롯을 최적 추천으로 한 번에 적용. */
  onApply: (codes: string[]) => void;
}

export function BuildOptimizer({ profile, loadout, metric, target, onEquip, onApply }: Props) {
  const [objective, setObjective] = useState<Objective>(() => defaultObjective(metric));

  const recos = useMemo(() => {
    const slotStats: Record<string, StatBlock> = {};
    for (const [s, code] of Object.entries(loadout)) {
      const it = ITEM_BY_CODE.get(code);
      if (it) slotStats[s] = itemStatsAtLevel(it, profile.level);
    }
    // 후보 슬롯을 제외한 나머지 장착분 = 그 슬롯 교체효율의 기준선
    const baseExtraForSlot = (slot: string): StatBlock =>
      mergeStats(
        ...Object.entries(slotStats)
          .filter(([s]) => s !== slot)
          .map(([, v]) => v),
      );
    const scoreOf = (stats: StatBlock, base: StatBlock) =>
      score(itemEfficiency(profile, stats, { baseExtra: base, target }), objective);

    return ITEM_SLOTS.map((slot) => {
      const base = baseExtraForSlot(slot);
      const cands = gameItems.filter(
        (it) => it.slot === slot && (!it.weaponType || it.weaponType === profile.weapon.weaponType),
      );
      let best: { code: string; name: string; iconUrl?: string; sc: number } | null = null;
      for (const it of cands) {
        const sc = scoreOf(itemStatsAtLevel(it, profile.level), base);
        if (!best || sc > best.sc)
          best = { code: String(it.code), name: it.name, iconUrl: it.iconUrl, sc };
      }
      const curCode = loadout[slot];
      const cur = curCode ? ITEM_BY_CODE.get(curCode) : undefined;
      const curScore = cur ? scoreOf(itemStatsAtLevel(cur, profile.level), base) : 0;
      const isCurrentBest = best != null && cur != null && String(cur.code) === best.code;
      return {
        slot,
        best,
        hasCurrent: cur != null,
        isCurrentBest,
        gain: best ? best.sc - curScore : 0, // 현재 대비 향상폭
      };
    });
  }, [loadout, profile, objective, target]);

  const optimalCodes = recos.map((r) => r.best?.code).filter((c): c is string => Boolean(c));
  const allOptimal = recos.every((r) => r.best == null || r.isCurrentBest);
  const unit = OBJ_UNIT[objective];
  const showVal = (v: number) =>
    objective === "balance" ? `${(v * 100).toFixed(1)}${unit}` : `${fmt(v)} ${unit}`;

  return (
    <div className="optimizer">
      <div className="opt-head">
        <span className="opt-title">
          <Icon icon={Sparkles} size={15} /> 슬롯별 최적 아이템
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onApply(optimalCodes)}
          disabled={allOptimal || optimalCodes.length === 0}
        >
          최적 빌드 적용
        </Button>
      </div>

      <div className="opt-obj">
        {OBJECTIVES.map((o) => (
          <button
            key={o.id}
            className={objective === o.id ? "seg active" : "seg"}
            onClick={() => setObjective(o.id)}
            title={OBJ_DESC[o.id]}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="hint opt-basis">
        <b>{OBJ_DESC[objective]}</b> · 대상 방어력 {target.defense} 기준
      </p>

      <ul className="opt-list">
        {recos.map((r) => (
          <li key={r.slot} className={`opt-row${r.isCurrentBest ? " best" : ""}`}>
            <span className="opt-slot">{r.slot}</span>
            {r.best ? (
              <>
                {r.best.iconUrl && (
                  <img className="opt-icon" src={r.best.iconUrl} alt="" loading="lazy" />
                )}
                <span className="opt-name">{r.best.name}</span>
                <span className="opt-gain">
                  {r.isCurrentBest ? (
                    <span className="opt-iscur">
                      <Icon icon={Check} size={13} /> 현재 최적
                    </span>
                  ) : r.hasCurrent ? (
                    <>
                      <Icon icon={ArrowUp} size={13} /> +{showVal(r.gain)}
                    </>
                  ) : (
                    <>+{showVal(r.best.sc)}</>
                  )}
                </span>
                <Button size="sm" onClick={() => onEquip(r.best!.code)} disabled={r.isCurrentBest}>
                  적용
                </Button>
              </>
            ) : (
              <span className="opt-name opt-empty">추천할 아이템 없음</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
