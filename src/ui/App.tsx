import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { computeDps, computeEhp, mergeStats, resolveStats, type Metric } from "../engine.js";
import type { BuildProfile, StatBlock, TargetProfile } from "../types.js";
import {
  gameCharacters,
  gameItems,
  weaponLabel,
  hasSkillData,
  itemStatsAtLevel,
  mainStatById,
  ITEM_SLOTS,
} from "../gameData.js";
import { matchName } from "../hangul.js";
import { hasMastery, masteryStatsAt, WEAPON_MASTERY } from "../weaponMastery.js";
import {
  encodeHash,
  decodeHash,
  loadSavedBuilds,
  addSavedBuild,
  removeSavedBuild,
  type SavedBuild,
} from "./buildStore.js";
import { StatPills } from "./StatPills.js";
import { StatSheet } from "./StatSheet.js";
import { StatBreakdown } from "./StatBreakdown.js";
import { StatScaling } from "./StatScaling.js";
import { EhpAnalyzer } from "./EhpAnalyzer.js";
import { SkillPanel } from "./SkillPanel.js";
import { ItemBrowser } from "./ItemBrowser.js";
import { InfoPanel } from "./InfoPanel.js";
import { PatchNotes } from "./PatchNotes.js";

// 부피가 큰 보조 뷰는 지연 로딩 — 초기 진입을 가볍게.
const Codex = lazy(() => import("./Codex.js").then((m) => ({ default: m.Codex })));
const MetaTier = lazy(() => import("./MetaTier.js").then((m) => ({ default: m.MetaTier })));
const Compare = lazy(() => import("./Compare.js").then((m) => ({ default: m.Compare })));

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
const SLOT_SET = new Set<string>(ITEM_SLOTS);

/** 장착 코드 목록 → 슬롯형 로드아웃(슬롯당 1개). */
function codesToLoadout(codes: string[]): Record<string, string> {
  const lo: Record<string, string> = {};
  for (const code of codes) {
    const it = itemByCode.get(code);
    if (it && SLOT_SET.has(it.slot)) lo[it.slot] = code;
  }
  return lo;
}

/** 무기 슬롯 아이템이 현재 무기군과 안 맞으면 비운다. */
function dropInvalidWeapon(lo: Record<string, string>, weaponType: string): Record<string, string> {
  const code = lo["무기"];
  if (!code) return lo;
  const it = itemByCode.get(code);
  if (it && it.weaponType && it.weaponType !== weaponType) {
    const { ["무기"]: _drop, ...rest } = lo;
    return rest;
  }
  return lo;
}

type View =
  | "meta"
  | "all"
  | "stats"
  | "skill"
  | "items"
  | "compare"
  | "codex"
  | "info"
  | "patch";
const VIEW_LABEL: Record<View, string> = {
  meta: "티어",
  all: "전체 보기",
  stats: "스탯",
  skill: "스킬",
  items: "아이템",
  compare: "비교",
  codex: "도감",
  info: "정보",
  patch: "패치",
};
const VIEW_ORDER: View[] = [
  "meta",
  "all",
  "stats",
  "skill",
  "items",
  "compare",
  "codex",
  "info",
  "patch",
];

const MAIN_STAT_LABEL: Record<"attackPower" | "skillAmp", string> = {
  attackPower: "공격력",
  skillAmp: "스킬증폭",
};

/** 대상 방어력 프리셋 (DPS 비교 기준). 방관 스탯의 가치는 대상 방어가 높을수록 커진다. */
const TARGET_PRESETS: { label: string; defense: number }[] = [
  { label: "무방비", defense: 0 },
  { label: "초반", defense: 50 },
  { label: "중반", defense: 120 },
  { label: "탱커", defense: 220 },
];

/** URL 해시에서 초기 상태를 복원(유효성 검사 포함). */
function resolveInitial() {
  const h = decodeHash(typeof window !== "undefined" ? window.location.hash : "");
  const character = gameCharacters.find((c) => c.id === h.c) ?? gameCharacters[0]!;
  const weaponType =
    character.weapons.find((w) => w.weaponType === h.w)?.weaponType ??
    character.weapons[0]!.weaponType;
  const level = Number.isFinite(h.l) && h.l! >= 1 && h.l! <= 20 ? h.l! : 9;
  const masteryLevel = Number.isFinite(h.m) && h.m! >= 1 ? h.m! : 1;
  const metric: Metric =
    h.lens === "skill" || h.lens === "basic" || h.lens === "ehp" ? (h.lens as Metric) : "total";
  // 해시에 뷰가 없으면 '티어' 랜딩으로 시작 (공유 링크는 지정된 뷰 유지).
  const view: View = VIEW_ORDER.includes(h.v as View) ? (h.v as View) : "meta";
  const targetDefense = Number.isFinite(h.td) && h.td! >= 0 ? h.td! : 0;
  const loadout = dropInvalidWeapon(codesToLoadout(h.eq ?? []), weaponType);
  return {
    characterId: character.id,
    weaponType,
    level,
    masteryLevel,
    metric,
    view,
    targetDefense,
    loadout,
  };
}

export function App() {
  const init = useMemo(resolveInitial, []);
  const [search, setSearch] = useState("");
  const [characterId, setCharacterId] = useState(init.characterId);
  const [weaponType, setWeaponType] = useState(init.weaponType);
  const [level, setLevel] = useState(init.level);
  const [loadout, setLoadout] = useState<Record<string, string>>(init.loadout);
  const [metric, setMetric] = useState<Metric>(init.metric);
  const [view, setView] = useState<View>(init.view);
  const [masteryLevel, setMasteryLevel] = useState(init.masteryLevel);
  const [targetDefense, setTargetDefense] = useState(init.targetDefense);
  const [saved, setSaved] = useState<SavedBuild[]>(() => loadSavedBuilds());
  const [copied, setCopied] = useState(false);

  const character = gameCharacters.find((c) => c.id === characterId)!;
  const weapon =
    character.weapons.find((w) => w.weaponType === weaponType) ?? character.weapons[0]!;
  const profile: BuildProfile = { character, weapon, level };

  const filteredChars = gameCharacters.filter((c) => matchName(c.name, search));

  /** 슬롯 순서대로 장착된 코드들. */
  const equipped = ITEM_SLOTS.map((s) => loadout[s]).filter((x): x is string => Boolean(x));
  const eqKey = equipped.join(",");

  // URL 해시 동기화 (공유/새로고침 보존). replaceState라 렌더 루프 없음.
  useEffect(() => {
    const next = `#${encodeHash({ c: characterId, w: weaponType, l: level, m: masteryLevel, lens: metric, v: view, td: targetDefense, eq: equipped })}`;
    if (next !== window.location.hash) window.history.replaceState(null, "", next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, weaponType, level, masteryLevel, metric, view, targetDefense, eqKey]);

  function selectCharacter(id: string) {
    const c = gameCharacters.find((x) => x.id === id)!;
    const newWeapon = c.weapons[0]!.weaponType;
    setCharacterId(id);
    setWeaponType(newWeapon);
    setLoadout((prev) => dropInvalidWeapon(prev, newWeapon));
    if (metric === "skill" && !hasSkillData(id)) setMetric("total");
  }

  function changeWeapon(wt: string) {
    setWeaponType(wt);
    setLoadout((prev) => dropInvalidWeapon(prev, wt));
  }

  /** 티어표에서 실험체 선택 → 스탯 비교로 이동. */
  function pickFromMeta(name: string) {
    const c = gameCharacters.find((x) => x.name === name);
    if (!c) return;
    selectCharacter(c.id);
    setView("stats");
  }

  function toggleItem(code: string) {
    const it = itemByCode.get(code);
    if (!it || !SLOT_SET.has(it.slot)) return;
    const slot = it.slot;
    setLoadout((prev) => {
      const next = { ...prev };
      if (next[slot] === code) delete next[slot];
      else next[slot] = code; // 같은 슬롯이면 교체
      return next;
    });
  }

  function saveCurrent() {
    const name = window.prompt(
      "빌드 이름을 입력하세요",
      `${character.name} · ${weaponLabel(weaponType)}`,
    );
    if (!name || !name.trim()) return;
    setSaved(
      addSavedBuild({
        name: name.trim(),
        c: characterId,
        w: weaponType,
        l: level,
        m: masteryLevel,
        eq: equipped,
      }),
    );
  }

  function loadBuild(b: SavedBuild) {
    const c = gameCharacters.find((x) => x.id === b.c);
    if (!c) return;
    const wt = c.weapons.find((w) => w.weaponType === b.w)?.weaponType ?? c.weapons[0]!.weaponType;
    setCharacterId(b.c);
    setWeaponType(wt);
    setLevel(b.l);
    setMasteryLevel(b.m);
    setLoadout(dropInvalidWeapon(codesToLoadout(b.eq), wt));
    if (metric === "skill" && !hasSkillData(b.c)) setMetric("total");
  }

  function copyShareLink() {
    const url = window.location.href;
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => {},
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eqKey, level],
  );

  const masteryStats = useMemo(
    () => masteryStatsAt(weapon.weaponType, masteryLevel),
    [weapon.weaponType, masteryLevel],
  );
  const target: TargetProfile = useMemo(
    () => ({ defense: targetDefense, maxHp: 10000 }),
    [targetDefense],
  );
  const currentStats = resolveStats(profile, equippedStats, masteryStats);
  const dps = computeDps(profile, currentStats, { target });
  const ehp = computeEhp(currentStats);
  const hasSkills = hasSkillData(character.id);
  const mainStat = mainStatById.get(character.id) ?? "attackPower";

  return (
    <div className="app">
      <header className="topbar">
        <h1>이터널리턴 스탯 비교</h1>
        <div className="view-tabs">
          {VIEW_ORDER.map((v) => (
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
                onClick={() => changeWeapon(w.weaponType)}
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

          <h3>
            대상 방어력: {targetDefense}
            <span className="hint inline"> · 방관 스탯의 가치 기준</span>
          </h3>
          <div className="target-presets">
            {TARGET_PRESETS.map((p) => (
              <button
                key={p.label}
                className={targetDefense === p.defense ? "tab active" : "tab"}
                onClick={() => setTargetDefense(p.defense)}
                title={`대상 방어력 ${p.defense}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={300}
            step={5}
            value={targetDefense}
            onChange={(e) => setTargetDefense(Number(e.target.value))}
          />
        </section>

        {/* 2) 현재 빌드 결과값 + 장착 슬롯 */}
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

          <div className="build-actions">
            <button className="ba-save" onClick={saveCurrent}>＋ 빌드 저장</button>
            <button className="ba-share" onClick={copyShareLink}>
              {copied ? "복사됨 ✓" : "🔗 공유 링크 복사"}
            </button>
          </div>

          {saved.length > 0 && (
            <div className="saved-builds">
              <h4>내 빌드 ({saved.length})</h4>
              <ul>
                {saved.map((b) => (
                  <li key={b.id}>
                    <button className="sb-load" onClick={() => loadBuild(b)} title="이 빌드 불러오기">
                      <b className="sb-name">{b.name}</b>
                      <small className="sb-meta">
                        {gameCharacters.find((c) => c.id === b.c)?.name ?? b.c} ·{" "}
                        {weaponLabel(b.w)} · Lv{b.l} · 아이템 {b.eq.length}
                      </small>
                    </button>
                    <button
                      className="remove"
                      onClick={() => setSaved(removeSavedBuild(b.id))}
                      title="삭제"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h3>장착 ({equipped.length}/{ITEM_SLOTS.length})</h3>
          <div className="loadout">
            {ITEM_SLOTS.map((slot) => {
              const code = loadout[slot];
              const it = code ? itemByCode.get(code) : undefined;
              return (
                <div key={slot} className={it ? "slot filled" : "slot empty"}>
                  <span className="slot-name">{slot}</span>
                  {it ? (
                    <>
                      {it.iconUrl && (
                        <img className="item-icon" src={it.iconUrl} alt="" loading="lazy" />
                      )}
                      <span className="slot-item">{it.name}</span>
                      <button className="remove" onClick={() => toggleItem(code!)} title="해제">
                        ✕
                      </button>
                    </>
                  ) : (
                    <span className="slot-empty-text">비어 있음</span>
                  )}
                </div>
              );
            })}
          </div>

          <h4>
            현재 종합 스탯
            <span className={`main-stat-tag ${mainStat === "skillAmp" ? "amp" : "ad"}`}>
              주 공격 스탯: {MAIN_STAT_LABEL[mainStat]}
            </span>
          </h4>
          <StatSheet stats={currentStats} />

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
            loadout={loadout}
            onToggle={toggleItem}
            metric={metric}
            target={target}
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

        {/* 패치 뷰 — 수동 한글 노트(data/patchNotes.ts) + Steam 자동 수집분 병합 */}
        <section className="panel patch-panel">
          <h2>패치 변경점</h2>
          <p className="hint">
            <b>Steam</b> 배지가 붙은 항목은 공식 Steam 공지에서 자동 수집됩니다(패치 즉시 반영).
            한글 설명은 <code>data/patchNotes.ts</code> 에 직접 추가하면 날짜순으로 함께 표시됩니다.
          </p>
          <PatchNotes />
        </section>

        {/* 티어/메타 랜딩 — dak.gg 통계 기반 */}
        <section className="panel meta-panel">
          <h2>티어 / 메타</h2>
          {view === "meta" && (
            <Suspense fallback={<p className="hint">티어 불러오는 중…</p>}>
              <MetaTier onPick={pickFromMeta} />
            </Suspense>
          )}
        </section>

        {/* 두 빌드 좌우 비교 */}
        <section className="panel compare-panel">
          <h2>실험체 비교</h2>
          {view === "compare" && (
            <Suspense fallback={<p className="hint">비교 불러오는 중…</p>}>
              <Compare initialA={{ characterId, weaponType }} />
            </Suspense>
          )}
        </section>

        {/* 도감 뷰 — 특성 / 전술 / 제작 트리 / 야생동물 / 지역 */}
        <section className="panel codex-panel">
          <h2>도감 — 게임 시스템</h2>
          {view === "codex" && (
            <Suspense fallback={<p className="hint">도감 불러오는 중…</p>}>
              <Codex />
            </Suspense>
          )}
        </section>
      </div>
    </div>
  );
}
