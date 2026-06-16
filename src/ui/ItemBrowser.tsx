import { useMemo, useState } from "react";
import { itemEfficiency, metricDelta, type Metric } from "../engine.js";
import type { BuildProfile, StatBlock, StatKey } from "../types.js";
import {
  gameItems,
  ITEM_SLOTS,
  GRADE_ORDER,
  weaponLabel,
  itemStatsAtLevel,
  type GameItem,
} from "../gameData.js";
import { StatPills, STAT_META } from "./StatPills.js";
import { matchName } from "../hangul.js";

const SLOT_TABS = ["전체", ...ITEM_SLOTS] as const;

type StatMode = "and" | "or";

/** 등급 영문 → 한글 라벨. */
const GRADE_KO: Record<string, string> = {
  Common: "일반",
  Uncommon: "고급",
  Rare: "희귀",
  Epic: "영웅",
  Legend: "전설",
  Mythic: "신화",
};

/** 아이템이 해당 스탯을 (기본 또는 레벨당으로) 가지는지. */
const itemHasStat = (it: GameItem, k: StatKey): boolean =>
  (it.stats[k] ?? 0) !== 0 || (it.statsByLv?.[k] ?? 0) !== 0;

/** 아이템에 실제 등장하는 스탯만 필터 칩으로 노출 (STAT_META 순서 유지). */
const FILTERABLE_STATS: StatKey[] = (Object.keys(STAT_META) as StatKey[]).filter((k) =>
  gameItems.some((it) => itemHasStat(it, k)),
);

/** 데이터에 실제 존재하는 등급만 (GRADE_ORDER 순서). */
const GRADES_PRESENT: string[] = GRADE_ORDER.filter((g) => gameItems.some((it) => it.grade === g));

/** 코드 → 아이템 (장착 표시줄 조회용). */
const ITEM_BY_CODE = new Map(gameItems.map((it) => [String(it.code), it]));

interface Props {
  profile: BuildProfile;
  equippedStats: StatBlock;
  equipped: string[];
  onToggle: (code: string) => void;
  metric: Metric;
  /** 아이템 단독 뷰처럼 장착 목록이 따로 안 보일 때 상단에 장착 표시줄 노출. */
  showEquipped?: boolean;
}

export function ItemBrowser({
  profile,
  equippedStats,
  equipped,
  onToggle,
  metric,
  showEquipped = false,
}: Props) {
  const [slot, setSlot] = useState<(typeof SLOT_TABS)[number]>("전체");
  const [search, setSearch] = useState("");
  const [weaponOnlyThisType, setWeaponOnlyThisType] = useState(true);
  const [statFilter, setStatFilter] = useState<StatKey[]>([]);
  const [statMode, setStatMode] = useState<StatMode>("and");
  const [gradeFilter, setGradeFilter] = useState<string[]>([]);

  const toggleStat = (k: StatKey) =>
    setStatFilter((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  const toggleGrade = (g: string) =>
    setGradeFilter((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  const filtered = useMemo(() => {
    return gameItems.filter((it) => {
      if (slot !== "전체" && it.slot !== slot) return false;
      if (gradeFilter.length > 0 && !gradeFilter.includes(it.grade)) return false;
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
  }, [slot, search, weaponOnlyThisType, profile.weapon.weaponType, statFilter, statMode, gradeFilter]);

  // 현재 빌드 기준 한계효율로 선택 렌즈에 맞춰 정렬 (효율 막대는 제거, 정렬 기준으로만 사용)
  const ranked = useMemo(() => {
    const rows = filtered.map((it) => ({
      item: it,
      leveledStats: itemStatsAtLevel(it, profile.level),
      effDelta: metricDelta(
        itemEfficiency(profile, itemStatsAtLevel(it, profile.level), { baseExtra: equippedStats }),
        metric,
      ).delta,
    }));
    rows.sort((a, b) => b.effDelta - a.effDelta);
    return rows;
  }, [filtered, profile, equippedStats, metric]);

  return (
    <div className="browser">
      {showEquipped && (
        <div className="browser-equipped">
          <span className="be-label">장착 {equipped.length}</span>
          {equipped.length === 0 ? (
            <span className="hint">아래에서 아이템을 클릭하면 장착됩니다.</span>
          ) : (
            equipped.map((code) => {
              const it = ITEM_BY_CODE.get(code);
              if (!it) return null;
              return (
                <button
                  key={code}
                  className="be-chip"
                  onClick={() => onToggle(code)}
                  title="장착 해제"
                >
                  {it.iconUrl && <img className="be-icon" src={it.iconUrl} alt="" loading="lazy" />}
                  <span className="be-name">{it.name}</span>
                  <span className="be-x">✕</span>
                </button>
              );
            })
          )}
        </div>
      )}

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
          <span className="sf-label">등급</span>
          {gradeFilter.length > 0 && (
            <button className="sf-clear" onClick={() => setGradeFilter([])}>
              초기화
            </button>
          )}
        </div>
        <div className="stat-chips">
          {GRADES_PRESENT.map((g) => (
            <button
              key={g}
              className={`stat-chip grade-chip g-${g}${gradeFilter.includes(g) ? " active" : ""}`}
              onClick={() => toggleGrade(g)}
            >
              {GRADE_KO[g] ?? g}
            </button>
          ))}
        </div>
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
        {ranked.map(({ item, leveledStats }) => {
          const isEquipped = equipped.includes(String(item.code));
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
                <div className="item-headtext">
                  <span className="item-name">{item.name}</span>
                  <span className="item-slot">
                    <span className={`item-grade g-${item.grade}`}>{GRADE_KO[item.grade] ?? item.grade}</span>
                    {" · "}
                    {item.slot}
                    {item.weaponType ? ` · ${weaponLabel(item.weaponType)}` : ""}
                  </span>
                </div>
              </div>
              <StatPills stats={leveledStats} />
            </button>
          );
        })}
        {ranked.length === 0 && <p className="empty">조건에 맞는 아이템이 없습니다.</p>}
      </div>
    </div>
  );
}
