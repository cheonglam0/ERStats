import { useMemo, useState } from "react";
import { computeDps, computeEhp, mergeStats, resolveStats, type Metric } from "../engine.js";
import type { BuildProfile, StatBlock } from "../types.js";
import { gameCharacters, gameItems, weaponLabel, hasSkillData, itemStatsAtLevel, mainStatById } from "../gameData.js";
import { matchName } from "../hangul.js";
import { hasMastery, masteryStatsAt, WEAPON_MASTERY } from "../weaponMastery.js";
import { StatPills } from "./StatPills.js";
import { StatBreakdown } from "./StatBreakdown.js";
import { StatScaling } from "./StatScaling.js";
import { EhpAnalyzer } from "./EhpAnalyzer.js";
import { SkillPanel } from "./SkillPanel.js";
import { ItemBrowser } from "./ItemBrowser.js";
import { InfoPanel } from "./InfoPanel.js";

const METRIC_LABEL: Record<Metric, string> = {
  total: "종합 DPS",
  skill: "스킬 DPS",
  basic: "평타 DPS",
  ehp: "유효 체력",
};

/** 렌즈 버튼 hover 설명 (텍스트 안내 대신 툴팁으로 제공). */
const METRIC_DESC: Record<Metric, string> = {
  total: "평타 + 스킬 합산 DPS. 평타 절대 공속은 임시값이라 다소 과대평가될 수 있음",
  skill: "스킬 회전 DPS. 스킬 의존형 비교에 적합 (스킬 계수 입력된 캐릭만)",
  basic: "평타 DPS. 평타 캐리 비교에 적합",
  ehp: "유효 체력 = 체력 ÷ (1 − 피해감소). 생존력 비교",
};

const fmt = (x: number) =>
  Number.isFinite(x) ? x.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "∞";
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const itemByCode = new Map(gameItems.map((it) => [String(it.code), it]));

type View = "all" | "stats" | "skill" | "items" | "info";
const VIEW_LABEL: Record<View, string> = {
  all: "전체 보기",
  stats: "스탯",
  skill: "스킬",
  items: "아이템",
  info: "정보",
};

const MAIN_STAT_LABEL: Record<"attackPower" | "skillAmp", string> = {
  attackPower: "공격력",
  skillAmp: "스킬증폭",
};

export function App() {
  const [search, setSearch] = useState("");
  const [characterId, setCharacterId] = useState(gameCharacters[0]!.id);
  const [weaponType, setWeaponType] = useState(gameCharacters[0]!.weapons[0]!.weaponType);
  const [level, setLevel] = useState(9);
  const [equipped, setEquipped] = useState<string[]>([]);
  const [metric, setMetric] = useState<Metric>("total");
  const [view, setView] = useState<View>("all");
  const [masteryLevel, setMasteryLevel] = useState(1);

  const character = gameCharacters.find((c) => c.id === characterId)!;
  const weapon =
    character.weapons.find((w) => w.weaponType === weaponType) ?? character.weapons[0]!;
  const profile: BuildProfile = { character, weapon, level };

  const filteredChars = gameCharacters.filter((c) => matchName(c.name, search));

  function selectCharacter(id: string) {
    const c = gameCharacters.find((x) => x.id === id)!;
    setCharacterId(id);
    setWeaponType(c.weapons[0]!.weaponType);
    setEquipped([]);
    if (metric === "skill" && !hasSkillData(id)) setMetric("total");
  }

  function toggleItem(code: string) {
    setEquipped((prev) =>
      prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code],
    );
  }

  const equippedStats: StatBlock = useMemo(
    () =>
      mergeStats(
        ...equipped
          .map((code) => {
            const it = itemByCode.get(code);
            return it ? itemStatsAtLevel(it, level) : undefined;
          })
          .filter((s): s is StatBlock => Boolean(s)),
      ),
    [equipped, level],
  );

  const masteryStats = useMemo(
    () => masteryStatsAt(weapon.weaponType, masteryLevel),
    [weapon.weaponType, masteryLevel],
  );
  const currentStats = resolveStats(profile, equippedStats, masteryStats);
  const dps = computeDps(profile, currentStats);
  const ehp = computeEhp(currentStats);
  const hasSkills = hasSkillData(character.id);
  const mainStat = mainStatById.get(character.id) ?? "attackPower";

  return (
    <div className="app">
      <header className="topbar">
        <h1>이터널리턴 스탯 비교</h1>
        <div className="view-tabs">
          {(["all", "stats", "skill", "items", "info"] as View[]).map((v) => (
            <button
              key={v}
              className={view === v ? "active" : ""}
              onClick={() => setView(v)}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
      </header>

      <div className={`layout view-${view}`}>
        {/* 1) 실험체 + 무기군 + 레벨 */}
        <section className="panel">
          <h2>1. 실험체 ({gameCharacters.length})</h2>
          <input
            className="search"
            placeholder="실험체 검색…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className="char-list scroll">
            {filteredChars.map((c) => (
              <li key={c.id}>
                <button
                  className={c.id === characterId ? "char active" : "char"}
                  onClick={() => selectCharacter(c.id)}
                >
                  {c.iconUrl && (
                    <img className="char-icon" src={c.iconUrl} alt="" loading="lazy" />
                  )}
                  <span className="char-name">
                    {c.name}
                    {mainStatById.get(c.id) === "skillAmp" && (
                      <em className="main-badge amp" title="스킬증폭 메인 캐릭터">스증</em>
                    )}
                    {hasSkillData(c.id) && <em className="skill-badge" title="스킬 계수 입력됨">★</em>}
                  </span>
                </button>
              </li>
            ))}
            {filteredChars.length === 0 && <li className="empty">검색 결과 없음</li>}
          </ul>

          <h3>무기군</h3>
          <div className="weapon-tabs">
            {character.weapons.map((w) => (
              <button
                key={w.weaponType}
                className={w.weaponType === weaponType ? "tab active" : "tab"}
                onClick={() => {
                  setWeaponType(w.weaponType);
                }}
              >
                {weaponLabel(w.weaponType)}
              </button>
            ))}
          </div>

          <h3>무기 숙련도</h3>
          {hasMastery(weapon.weaponType) ? (
            <div className="mastery">
              <div className="mastery-head">
                <span>{weaponLabel(weapon.weaponType)} 숙련도</span>
                <b>Lv {masteryLevel}</b>
              </div>
              <input
                type="range"
                min={1}
                max={WEAPON_MASTERY[weapon.weaponType]!.maxLevel}
                value={masteryLevel}
                onChange={(e) => setMasteryLevel(Number(e.target.value))}
              />
              <StatPills stats={masteryStats} />
            </div>
          ) : (
            <p className="hint">
              {weaponLabel(weapon.weaponType)} 숙련도 보너스 데이터 미입력. (무기군별 공속·스증·평타증폭
              등 증가 — 추후 업데이트 예정)
            </p>
          )}

          <h3>레벨: {level}</h3>
          <input
            type="range"
            min={1}
            max={20}
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
          />

          <h3>비교 렌즈</h3>
          <div className="metric-toggle lens">
            {(["total", "skill", "basic", "ehp"] as Metric[]).map((m) => (
              <button
                key={m}
                className={metric === m ? "active" : ""}
                onClick={() => setMetric(m)}
                disabled={m === "skill" && !hasSkills}
                title={
                  m === "skill" && !hasSkills
                    ? "스킬 계수 미입력 캐릭터 — 스킬 DPS 비교 불가"
                    : METRIC_DESC[m]
                }
              >
                {METRIC_LABEL[m]}
              </button>
            ))}
          </div>
        </section>

        {/* 2) 현재 빌드 결과값 + 장착 아이템 */}
        <section className="panel stats-panel">
          <h2>2. 현재 빌드</h2>
          <div className="result-cards">
            <div className="card dps" title={hasSkills ? "" : "스킬 계수 미입력 캐릭터 — 평타 DPS만 표시"}>
              <div className="card-label">{hasSkills ? "유효 DPS" : "평타 DPS"}</div>
              <div className="card-value">{fmt(hasSkills ? dps.total : dps.basicAttackDps)}</div>
              <div className="card-sub">
                평타 {fmt(dps.basicAttackDps)}
                {hasSkills ? ` · 스킬 ${fmt(dps.skillDps)}` : ""}
              </div>
            </div>
            <div className="card ehp">
              <div className="card-label">유효 체력(EHP)</div>
              <div className="card-value">{fmt(ehp.effectiveHp)}</div>
              <div className="card-sub">
                체력 {fmt(ehp.rawHp)} · 피해감소 {pct(ehp.damageReduction)}
              </div>
            </div>
          </div>

          <h3>장착 아이템 ({equipped.length})</h3>
          {equipped.length === 0 ? (
            <p className="hint">장착된 아이템 없음</p>
          ) : (
            <ul className="equipped">
              {equipped.map((code) => {
                const it = itemByCode.get(code);
                if (!it) return null;
                return (
                  <li key={code}>
                    <button className="remove" onClick={() => toggleItem(code)}>✕</button>
                    {it.iconUrl && (
                      <img className="item-icon" src={it.iconUrl} alt="" loading="lazy" />
                    )}
                    <span className="eq-name">{it.name}</span>
                    <StatPills stats={itemStatsAtLevel(it, level)} />
                  </li>
                );
              })}
            </ul>
          )}

          <h4>
            현재 종합 스탯
            <span className={`main-stat-tag ${mainStat === "skillAmp" ? "amp" : "ad"}`}>
              주 공격 스탯: {MAIN_STAT_LABEL[mainStat]}
            </span>
          </h4>
          <StatPills stats={currentStats} />

          <h3>스탯 성장 · 효율</h3>
          <StatScaling
            character={character}
            level={level}
            totalStats={currentStats}
            mainStat={mainStat}
          />

          <h3>실질 체력(EHP) — 방어력 vs 체력 효율</h3>
          <EhpAnalyzer
            maxHp={currentStats.maxHp ?? 0}
            defense={currentStats.defense ?? 0}
          />
        </section>

        {/* 스킬 정보 (스킬 뷰 전용) */}
        <section className="panel skill-panel">
          <h2>스킬 — {character.name} · {weaponLabel(weapon.weaponType)}</h2>
          <SkillPanel profile={profile} stats={currentStats} hasSkills={hasSkills} />
        </section>

        {/* 3) ER2Route식 아이템 그리드 + 부위 필터 */}
        <section className="panel browser-panel">
          <h2>3. 아이템 ({METRIC_LABEL[metric]} 효율순)</h2>
          <ItemBrowser
            profile={profile}
            equippedStats={equippedStats}
            equipped={equipped}
            onToggle={toggleItem}
            metric={metric}
            showEquipped={view === "items"}
          />
        </section>

        {/* 정보 뷰 전용 — 스탯 구성 비율 + 안내문 */}
        <section className="panel info-panel">
          <h2>정보 — {character.name}</h2>
          <StatBreakdown character={character} level={level} itemStats={equippedStats} />
          <h3>도움말</h3>
          <InfoPanel />
        </section>
      </div>
    </div>
  );
}
