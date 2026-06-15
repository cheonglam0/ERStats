import { useMemo, useState } from "react";
import { itemEfficiency, metricDelta, type Metric } from "../engine.js";
import type { BuildProfile, StatBlock } from "../types.js";
import { gameItems, ITEM_SLOTS, weaponLabel, itemStatsAtLevel } from "../gameData.js";
import { StatPills } from "./StatPills.js";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const SLOT_TABS = ["전체", ...ITEM_SLOTS] as const;
const isEhp = (m: Metric) => m === "ehp";

interface Props {
  profile: BuildProfile;
  equippedStats: StatBlock;
  equipped: string[];
  onToggle: (code: string) => void;
  metric: Metric;
}

export function ItemBrowser({ profile, equippedStats, equipped, onToggle, metric }: Props) {
  const [slot, setSlot] = useState<(typeof SLOT_TABS)[number]>("전체");
  const [search, setSearch] = useState("");
  const [weaponOnlyThisType, setWeaponOnlyThisType] = useState(true);

  const filtered = useMemo(() => {
    const q = search.trim();
    return gameItems.filter((it) => {
      if (slot !== "전체" && it.slot !== slot) return false;
      if (
        weaponOnlyThisType &&
        it.itemType === "Weapon" &&
        it.weaponType !== profile.weapon.weaponType
      )
        return false;
      if (q && !it.name.includes(q)) return false;
      return true;
    });
  }, [slot, search, weaponOnlyThisType, profile.weapon.weaponType]);

  // 현재 빌드 기준 한계효율 계산 후 선택 렌즈로 정렬 (아이템 스탯은 레벨 환산)
  const ranked = useMemo(() => {
    const rows = filtered.map((it) => ({
      item: it,
      leveledStats: itemStatsAtLevel(it, profile.level),
      eff: itemEfficiency(profile, itemStatsAtLevel(it, profile.level), {
        baseExtra: equippedStats,
      }),
    }));
    rows.sort((a, b) => metricDelta(b.eff, metric).delta - metricDelta(a.eff, metric).delta);
    return rows;
  }, [filtered, profile, equippedStats, metric]);

  const maxDelta = Math.max(1, ...ranked.map((r) => metricDelta(r.eff, metric).delta));
  const barClass = isEhp(metric) ? "ehp" : "dps";

  return (
    <div className="browser">
      <div className="browser-controls">
        <div className="slot-tabs">
          {SLOT_TABS.map((s) => (
            <button
              key={s}
              className={s === slot ? "tab active" : "tab"}
              onClick={() => setSlot(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          className="search"
          placeholder="아이템 검색…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="weapon-filter">
          <input
            type="checkbox"
            checked={weaponOnlyThisType}
            onChange={(e) => setWeaponOnlyThisType(e.target.checked)}
          />
          이 빌드 무기군({weaponLabel(profile.weapon.weaponType)})만
        </label>
        <span className="count">{ranked.length}개</span>
      </div>

      <div className="item-grid">
        {ranked.map(({ item, eff, leveledStats }) => {
          const { delta, pct: deltaPct } = metricDelta(eff, metric);
          const isEquipped = equipped.includes(String(item.code));
          const barW = Math.max(0, Math.min(100, (delta / maxDelta) * 100));
          return (
            <button
              key={item.code}
              className={`item-card grade-${item.grade}${isEquipped ? " equipped" : ""}`}
              onClick={() => onToggle(String(item.code))}
              title={isEquipped ? "장착 해제" : "장착"}
            >
              <div className="item-head">
                {item.iconUrl && (
                  <img className="item-icon" src={item.iconUrl} alt="" loading="lazy" />
                )}
                <span className="item-name">{item.name}</span>
                <span className={`item-grade g-${item.grade}`}>{item.grade}</span>
              </div>
              <div className="item-slot">
                {item.slot}
                {item.weaponType ? ` · ${weaponLabel(item.weaponType)}` : ""}
              </div>
              <StatPills stats={leveledStats} />
              <div className="item-eff">
                <div className="bar">
                  <div className={`bar-fill ${barClass}`} style={{ width: `${barW}%` }} />
                </div>
                <span className={delta > 0 ? "eff-pos" : "eff-zero"}>
                  {delta > 0 ? "+" : ""}
                  {pct(deltaPct)}
                </span>
              </div>
            </button>
          );
        })}
        {ranked.length === 0 && <p className="empty">조건에 맞는 아이템이 없습니다.</p>}
      </div>
    </div>
  );
}
