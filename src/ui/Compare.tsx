/**
 * 두 빌드 좌우 비교(head-to-head). 같은 레벨·대상 방어력 기준으로
 * (캐릭터 × 무기군) A vs B 의 DPS·EHP·핵심 스탯을 나란히 비교한다.
 */

import { useMemo, useState } from "react";
import { computeDps, computeEhp, resolveStats } from "../engine.js";
import type { BuildProfile, StatBlock, StatKey, TargetProfile } from "../types.js";
import { gameCharacters, weaponLabel, hasSkillData } from "../gameData.js";
import { matchName } from "../hangul.js";

const fmt = (x: number) =>
  Number.isFinite(x) ? x.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "∞";

interface SideState {
  characterId: string;
  weaponType: string;
}

/** 비교에 표시할 스탯(모두 높을수록 유리). */
const COMPARE_STATS: { key: StatKey; label: string; pct?: boolean }[] = [
  { key: "attackPower", label: "공격력" },
  { key: "skillAmp", label: "스킬증폭" },
  { key: "attackSpeed", label: "공속 보너스", pct: true },
  { key: "critChance", label: "치명확률", pct: true },
  { key: "maxHp", label: "체력" },
  { key: "defense", label: "방어력" },
  { key: "moveSpeed", label: "이동속도" },
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

const statVal = (s: StatBlock, k: StatKey) => s[k] ?? 0;

export function Compare({ initialA }: { initialA?: { characterId: string; weaponType: string } }) {
  const [level, setLevel] = useState(15);
  const [a, setA] = useState<SideState>(
    initialA ?? { characterId: gameCharacters[0]!.id, weaponType: gameCharacters[0]!.weapons[0]!.weaponType },
  );
  const [b, setB] = useState<SideState>(() => {
    const second = gameCharacters[1] ?? gameCharacters[0]!;
    return { characterId: second.id, weaponType: second.weapons[0]!.weaponType };
  });
  const target: TargetProfile = useMemo(() => ({ defense: 0, maxHp: 10000 }), []);

  const mA = sideMetrics(a, level, target);
  const mB = sideMetrics(b, level, target);

  const dpsA = mA.hasSkills ? mA.dps.total : mA.dps.basicAttackDps;
  const dpsB = mB.hasSkills ? mB.dps.total : mB.dps.basicAttackDps;

  return (
    <div className="compare">
      <div className="compare-level">
        <span>레벨 {level} 기준 · 무방비 대상 · 아이템 미장착(소체 비교)</span>
        <input
          type="range"
          min={1}
          max={20}
          value={level}
          onChange={(e) => setLevel(Number(e.target.value))}
        />
      </div>

      <div className="compare-grid">
        <SidePicker side={a} setSide={setA} corner="a" />
        <div className="compare-vs">VS</div>
        <SidePicker side={b} setSide={setB} corner="b" />
      </div>

      <div className="compare-results">
        <ResultRow
          label="유효 DPS"
          a={dpsA}
          b={dpsB}
          fmtA={fmt(dpsA)}
          fmtB={fmt(dpsB)}
          highlight
        />
        <ResultRow
          label="유효 체력(EHP)"
          a={mA.ehp.effectiveHp}
          b={mB.ehp.effectiveHp}
          fmtA={fmt(mA.ehp.effectiveHp)}
          fmtB={fmt(mB.ehp.effectiveHp)}
          highlight
        />
        {COMPARE_STATS.map(({ key, label, pct }) => {
          const va = statVal(mA.stats, key);
          const vb = statVal(mB.stats, key);
          return (
            <ResultRow
              key={key}
              label={label}
              a={va}
              b={vb}
              fmtA={pct ? `${(va * 100).toFixed(1)}%` : fmt(va)}
              fmtB={pct ? `${(vb * 100).toFixed(1)}%` : fmt(vb)}
            />
          );
        })}
      </div>
    </div>
  );
}

function SidePicker({
  side,
  setSide,
  corner,
}: {
  side: SideState;
  setSide: (s: SideState) => void;
  corner: "a" | "b";
}) {
  const [q, setQ] = useState("");
  const character = gameCharacters.find((c) => c.id === side.characterId)!;
  const list = gameCharacters.filter((c) => matchName(c.name, q));

  return (
    <div className={`compare-side side-${corner}`}>
      <div className="compare-charhead">
        {character.iconUrl && <img className="char-icon" src={character.iconUrl} alt="" />}
        <b>{character.name}</b>
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

function ResultRow({
  label,
  a,
  b,
  fmtA,
  fmtB,
  highlight = false,
}: {
  label: string;
  a: number;
  b: number;
  fmtA: string;
  fmtB: string;
  highlight?: boolean;
}) {
  const aw = a > b;
  const bw = b > a;
  return (
    <div className={`cmp-row${highlight ? " key" : ""}`}>
      <span className={`cmp-a${aw ? " win" : ""}`}>{fmtA}</span>
      <span className="cmp-label">{label}</span>
      <span className={`cmp-b${bw ? " win" : ""}`}>{fmtB}</span>
    </div>
  );
}
