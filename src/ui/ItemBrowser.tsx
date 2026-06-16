import { useMemo, useState } from "react";
import { itemEfficiency, metricDelta, type Metric } from "../engine.js";
import type { BuildProfile, StatBlock, StatKey } from "../types.js";
import { gameItems, ITEM_SLOTS, weaponLabel, itemStatsAtLevel, type GameItem } from "../gameData.js";
import { StatPills, STAT_META } from "./StatPills.js";
import { matchName } from "../hangul.js";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const SLOT_TABS = ["전체", ...ITEM_SLOTS] as const;
const isEhp = (m: Metric) => m === "ehp";

type StatMode = "and" | "or";

/** 아이템이 해당 스탯을 (기본 또는 레벨당으로) 가지는지. */
const itemHasStat = (it: GameItem, k: StatKey): boolean =>
  (it.stats[k] ?? 0) !== 0 || (it.statsByLv?.[k] ?? 0) !== 0;

/** 아이템에 실제 등장하는 스탯만 필터 칩으로 노출 (STAT_META 순서 유지). */
const FILTERABLE_STATS: StatKey[] = (Object.keys(STAT_META) as StatKey[]).filter((k) =>
  gameItems.some((it) => itemHasStat(it, k)),
);

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
  const [statFilter, setStatFilter] = useState<StatKey[]>([]);
  const [statMode, setStatMode] = useState<StatMode>("and");

  const toggleStat = (k: StatKey) =>
    setStatFilter((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const filtered = useMemo(() => {
    return gameItems.filter((it) => {
      if (slot !== "전체" && it.slot !== slot) return false;
      if (
        weaponOnlyThisType &&
        it.itemType === "Weapon" &&
        it.weaponType !== profile.weapon.weaponType
      )
        return false;
      if (!matchName(it.name, search)) return false;
      if (statFilter.length > 0) {
        const ok =
          statMode === "and"
            ? statFilter.every((k) => itemHasStat(it, k))
            : statFilter.some((k) => itemHasStat(it, k));
        if (!ok) return false;
      }
      return true;
    });
  }, [slot, search, weaponOnlyThisType, profile.weapon.weaponType, statFilter, statMode]);

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

      <div className="stat-filter">
        <div className="stat-filter-head">
          <span className="sf-label">옵션 필터</span>
          <div className="mode-toggle">
            <button
              className={statMode === "and" ? "active" : ""}
              onClick={() => setStatMode("and")}
              title="선택한 옵션을 모두 가진 아이템"
            >
              AND
            </button>
            <button
              className={statMode === "or" ? "active" : ""}
              onClick={() => setStatMode("or")}
              title="선택한 옵션 중 하나라도 가진 아이템"
            >
              OR
            </button>
          </div>
          {statFilter.length > 0 && (
            <button className="sf-clear" onClick={() => setStatFilter([])}>
              초기화
            </button>
          )}
        </div>
        <div className="stat-chips">
          {FILTERABLE_STATS.map((k) => (
            <button
              key={k}
              className={statFilter.includes(k) ? "stat-chip active" : "stat-chip"}
              onClick={() => toggleStat(k)}
            >
              {STAT_META[k].label}
            </button>
          ))}
        </div>
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
