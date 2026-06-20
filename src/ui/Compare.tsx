/**
 * 두 빌드 좌우 비교(head-to-head). 같은 레벨·대상 방어력 기준으로
 * (캐릭터 × 무기군) A vs B 의 DPS·EHP·핵심 스탯을 시각 막대로 비교한다.
 * 아이템 미장착 소체(素體) 기준 — 캐릭터 고유 성능 비교.
 */

import { useMemo, useState } from "react";
import { computeDps, computeEhp, resolveStats } from "../engine.js";
import type { BuildProfile, StatBlock, StatKey, TargetProfile } from "../types.js";
import { gameCharacters, weaponLabel, hasSkillData } from "../gameData.js";
import { metaTier } from "../gameExtra.js";
import { matchName } from "../hangul.js";
import { ArrowLeftRight } from "lucide-react";
import { Icon } from "./kit/index.js";

const fmt = (x: number) =>
  Number.isFinite(x) ? x.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "∞";
const pctStr = (x: number) => `${(x * 100).toFixed(1)}%`;

/** 실험체 이름 → 대표 티어 (헤더 배지용). */
const tierByName = new Map(metaTier.rows.map((r) => [r.name, r.tier]));

interface SideState {
  characterId: string;
  weaponType: string;
}

type Row = { key: string; label: string; a: number; b: number; fmtA: string; fmtB: string };

/** 비교 스탯 그룹 (모두 높을수록 유리). */
const STAT_GROUPS: { title: string; cls: string; stats: { key: StatKey; label: string; pct?: boolean }[] }[] = [
  {
    title: "공격",
    cls: "offense",
    stats: [
      { key: "attackPower", label: "공격력" },
      { key: "skillAmp", label: "스킬증폭" },
      { key: "attackSpeed", label: "공속 보너스", pct: true },
      { key: "critChance", label: "치명확률", pct: true },
      { key: "critDamage", label: "치명피해", pct: true },
      { key: "cooldownReduction", label: "쿨감", pct: true },
    ],
  },
  {
    title: "생존",
    cls: "survival",
    stats: [
      { key: "maxHp", label: "체력" },
      { key: "defense", label: "방어력" },
      { key: "hpRegen", label: "초당 회복" },
    ],
  },
  { title: "유틸", cls: "utility", stats: [{ key: "moveSpeed", label: "이동속도" }] },
];

const TARGET_PRESETS = [
  { label: "무방비", defense: 0 },
  { label: "초반", defense: 50 },
  { label: "중반", defense: 120 },
  { label: "탱커", defense: 220 },
];

function sideMetrics(side: SideState, level: number, target: TargetProfile) {
  const character = gameCharacters.find((c) => c.id === side.characterId)!;
  const weapon =
    character.weapons.find((w) => w.weaponType === side.weaponType) ?? character.weapons[0]!;
  const profile: BuildProfile = { character, weapon, level };
  const stats: StatBlock = resolveStats(profile);
  const dps = computeDps(profile, stats, { target });
  const ehp = computeEhp(stats);
  return { character, weapon, stats, dps, ehp, hasSkills: hasSkillData(character.id) };
}

export function Compare({ initialA }: { initialA?: { characterId: string; weaponType: string } }) {
  const [level, setLevel] = useState(15);
  const [targetDefense, setTargetDefense] = useState(0);
  const [a, setA] = useState<SideState>(
    initialA ?? { characterId: gameCharacters[0]!.id, weaponType: gameCharacters[0]!.weapons[0]!.weaponType },
  );
  const [b, setB] = useState<SideState>(() => {
    const second = gameCharacters[1] ?? gameCharacters[0]!;
    return { characterId: second.id, weaponType: second.weapons[0]!.weaponType };
  });
  const target: TargetProfile = useMemo(
    () => ({ defense: targetDefense, maxHp: 10000 }),
    [targetDefense],
  );

  const mA = sideMetrics(a, level, target);
  const mB = sideMetrics(b, level, target);
  const dpsA = mA.hasSkills ? mA.dps.total : mA.dps.basicAttackDps;
  const dpsB = mB.hasSkills ? mB.dps.total : mB.dps.basicAttackDps;

  const keyRows: Row[] = [
    { key: "dps", label: "유효 DPS", a: dpsA, b: dpsB, fmtA: fmt(dpsA), fmtB: fmt(dpsB) },
    {
      key: "ehp",
      label: "유효 체력(EHP)",
      a: mA.ehp.effectiveHp,
      b: mB.ehp.effectiveHp,
      fmtA: fmt(mA.ehp.effectiveHp),
      fmtB: fmt(mB.ehp.effectiveHp),
    },
  ];

  // 요약 한 줄 — 핵심 두 지표의 우위/격차
  const summary = keyRows.map((r) => {
    const win = r.a === r.b ? null : r.a > r.b ? "a" : "b";
    const hi = Math.max(r.a, r.b);
    const lo = Math.min(r.a, r.b);
    const gap = lo > 0 ? (hi - lo) / lo : 0;
    return { label: r.label, win, gap };
  });

  function swap() {
    setA(b);
    setB(a);
  }

  return (
    <div className="compare">
      <div className="compare-controls">
        <div className="cc-level">
          <span>레벨 {level}</span>
          <input type="range" min={1} max={20} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
        </div>
        <div className="cc-target">
          <span>대상 방어력 {targetDefense}</span>
          <div className="target-presets">
            {TARGET_PRESETS.map((p) => (
              <button
                key={p.label}
                className={targetDefense === p.defense ? "tab active" : "tab"}
                onClick={() => setTargetDefense(p.defense)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <button className="cc-swap" onClick={swap} title="좌우 교체">
          <Icon icon={ArrowLeftRight} size={16} /> 교체
        </button>
      </div>
      <p className="hint compare-note">아이템·숙련도 미적용 소체(素體) 비교 · 대상 방어력은 DPS에만 반영</p>

      <div className="compare-grid">
        <SidePicker side={a} setSide={setA} corner="a" hasSkills={mA.hasSkills} />
        <div className="compare-vs">VS</div>
        <SidePicker side={b} setSide={setB} corner="b" hasSkills={mB.hasSkills} />
      </div>

      <div className="cmp-summary">
        {summary.map((s) => (
          <div key={s.label} className="cmp-sum-item">
            <span className="cmp-sum-label">{s.label}</span>
            {s.win == null ? (
              <span className="cmp-sum-tie">동률</span>
            ) : (
              <span className={`cmp-sum-win side-${s.win}`}>
                {s.win === "a" ? mA.character.name : mB.character.name} 우위 +{pctStr(s.gap)}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="cmp-bars">
        {keyRows.map((r) => (
          <CmpRow key={r.key} row={r} keyMetric />
        ))}
        {STAT_GROUPS.map((g) => (
          <div key={g.title} className={`cmp-group cmp-${g.cls}`}>
            <div className="cmp-group-title">{g.title}</div>
            {g.stats.map(({ key, label, pct }) => {
              const va = mA.stats[key] ?? 0;
              const vb = mB.stats[key] ?? 0;
              if (va === 0 && vb === 0) return null;
              return (
                <CmpRow
                  key={key}
                  row={{
                    key,
                    label,
                    a: va,
                    b: vb,
                    fmtA: pct ? pctStr(va) : fmt(va),
                    fmtB: pct ? pctStr(vb) : fmt(vb),
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function CmpRow({ row, keyMetric = false }: { row: Row; keyMetric?: boolean }) {
  const { label, a, b, fmtA, fmtB } = row;
  const aw = a > b;
  const bw = b > a;
  const total = a + b;
  const fracA = total > 0 ? a / total : 0.5;
  return (
    <div className={`cmp2-row${keyMetric ? " key" : ""}`}>
      <div className="cmp2-head">
        <span className={`cmp2-a${aw ? " win" : ""}`}>{fmtA}</span>
        <span className="cmp2-label">{label}</span>
        <span className={`cmp2-b${bw ? " win" : ""}`}>{fmtB}</span>
      </div>
      <div className="cmp2-bar">
        <div className={`cmp2-fill a${aw ? " win" : ""}`} style={{ width: `${fracA * 100}%` }} />
        <div className={`cmp2-fill b${bw ? " win" : ""}`} style={{ width: `${(1 - fracA) * 100}%` }} />
      </div>
    </div>
  );
}

function SidePicker({
  side,
  setSide,
  corner,
  hasSkills,
}: {
  side: SideState;
  setSide: (s: SideState) => void;
  corner: "a" | "b";
  hasSkills: boolean;
}) {
  const [q, setQ] = useState("");
  const character = gameCharacters.find((c) => c.id === side.characterId)!;
  const list = gameCharacters.filter((c) => matchName(c.name, q));
  const tier = tierByName.get(character.name);

  return (
    <div className={`compare-side side-${corner}`}>
      <div className="compare-charhead">
        {character.iconUrl && <img className="char-icon" src={character.iconUrl} alt="" />}
        <div className="cch-text">
          <b>{character.name}</b>
          <div className="cch-meta">
            {tier && <span className={`tier-badge sm tier-${tier}`}>{tier}</span>}
            <span className="cch-weapon">{weaponLabel(side.weaponType)}</span>
            {!hasSkills && <span className="cch-noskill">평타 기준</span>}
          </div>
        </div>
      </div>
      <input
        className="search"
        placeholder="실험체 검색…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="compare-charlist scroll">
        {list.map((c) => (
          <li key={c.id}>
            <button
              className={c.id === side.characterId ? "char active" : "char"}
              onClick={() => setSide({ characterId: c.id, weaponType: c.weapons[0]!.weaponType })}
            >
              {c.iconUrl && <img className="char-icon" src={c.iconUrl} alt="" loading="lazy" />}
              <span className="char-name">{c.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="weapon-tabs">
        {character.weapons.map((w) => (
          <button
            key={w.weaponType}
            className={w.weaponType === side.weaponType ? "tab active" : "tab"}
            onClick={() => setSide({ ...side, weaponType: w.weaponType })}
          >
            {weaponLabel(w.weaponType)}
          </button>
        ))}
      </div>
    </div>
  );
}
