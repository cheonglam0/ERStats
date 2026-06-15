/**
 * 계산 엔진 — 순수 함수만. 입력(빌드 프로파일 + 스탯 묶음) → 결과값(DPS/EHP).
 *
 * 설계 의도: "스탯 하나로 통일"하지 않고, 캐릭터/무기군의 계수를 넣어
 *   - 공격 라인 → 유효 DPS
 *   - 생존 라인 → 유효 체력(EHP) + 초당 회복
 * 으로 수렴시킨다. 아이템 비교는 "장착 전후 결과값의 변화량(한계효율)"으로 푼다.
 */

import type {
  BuildProfile,
  DpsResult,
  EhpResult,
  Skill,
  StatBlock,
  StatKey,
  TargetProfile,
} from "./types.js";
import {
  attacksPerSecond,
  critMultiplier,
  damageReduction,
  effectiveCooldown,
  effectiveDefense,
} from "./constants.js";

/** 무방비 더미 (방어 0). 순수 출력량 비교 기준. */
export const DUMMY_TARGET: TargetProfile = { defense: 0, maxHp: 10000 };

/** 스탯 묶음에서 키 값을 안전하게 읽기 (없으면 0). */
export function stat(block: StatBlock, key: StatKey): number {
  return block[key] ?? 0;
}

/** 여러 스탯 묶음을 합산. */
export function mergeStats(...blocks: StatBlock[]): StatBlock {
  const out: StatBlock = {};
  for (const b of blocks) {
    for (const k of Object.keys(b) as StatKey[]) {
      out[k] = (out[k] ?? 0) + (b[k] ?? 0);
    }
  }
  return out;
}

/** 캐릭터 기본 스탯을 레벨에 맞춰 선형 스케일. */
export function baseStatsAtLevel(profile: BuildProfile): StatBlock {
  const { character, level } = profile;
  const steps = Math.max(0, level - 1);
  const out: StatBlock = { ...character.baseStats };
  for (const k of Object.keys(character.growthPerLevel) as StatKey[]) {
    out[k] = (out[k] ?? 0) + (character.growthPerLevel[k] ?? 0) * steps;
  }
  return out;
}

/** 빌드의 최종 스탯 = 레벨 보정 기본 스탯 + 추가 스탯(아이템 등). */
export function resolveStats(
  profile: BuildProfile,
  ...extra: StatBlock[]
): StatBlock {
  return mergeStats(baseStatsAtLevel(profile), ...extra);
}

/** 무기군 override를 반영한 실제 스킬 정의. */
function resolvedSkill(profile: BuildProfile, skill: Skill): Skill {
  const ov = profile.weapon.skillOverrides?.[skill.slot];
  return ov ? { ...skill, ...ov } : skill;
}

/** 데미지 유형에 따른 대상 피해 감소 배율 (1 - 감소율). true는 1. */
function mitigationMultiplier(
  damageType: Skill["damageType"],
  target: TargetProfile,
  stats: StatBlock,
): number {
  if (damageType === "true") return 1;
  const effDef = effectiveDefense(
    target.defense,
    stat(stats, "armorPenPct"),
    stat(stats, "armorPenFlat"),
  );
  return 1 - damageReduction(effDef);
}

/** 평타 DPS. */
export function basicAttackDps(
  profile: BuildProfile,
  stats: StatBlock,
  target: TargetProfile = DUMMY_TARGET,
): number {
  const w = profile.weapon;
  const ap = stat(stats, "attackPower");
  const hitDamage = ap * w.basicAdRatio + (w.basicBonus ?? 0);
  const aps = attacksPerSecond(w.baseAttackSpeed, stat(stats, "attackSpeed"));
  const crit = critMultiplier(stat(stats, "critChance"), stat(stats, "critDamage"));
  const mit = mitigationMultiplier(w.basicDamageType ?? "physical", target, stats);
  return hitDamage * aps * crit * mit;
}

/** 단일 스킬 DPS (= 1회 데미지 / 유효 쿨다운). skillRank는 1부터. */
export function skillDps(
  profile: BuildProfile,
  skill: Skill,
  stats: StatBlock,
  skillRank = 1,
  target: TargetProfile = DUMMY_TARGET,
): number {
  const s = resolvedSkill(profile, skill);
  const idx = clampIndex(skillRank - 1, s.baseDamage.length);
  const cdIdx = clampIndex(skillRank - 1, s.cooldown.length);

  const ap = stat(stats, "attackPower");
  const amp = stat(stats, "skillAmp");
  const apR = resolveRatio(s.apRatio, idx);
  const ampR = resolveRatio(s.skillAmpRatio, idx);
  let perHit = (s.baseDamage[idx] ?? 0) + ap * apR + amp * ampR;

  if (s.scalesWithBasicAttack) {
    perHit += ap * profile.weapon.basicAdRatio;
  }

  const hits = s.hitCount ?? 1;
  const crit = critMultiplier(stat(stats, "critChance"), stat(stats, "critDamage"));
  const mit = mitigationMultiplier(s.damageType, target, stats);
  const cd = effectiveCooldown(s.cooldown[cdIdx] ?? 1, stat(stats, "cooldownReduction"));
  const damagePerCast = perHit * hits * crit * mit;
  return cd > 0 ? damagePerCast / cd : 0;
}

/** 전체 DPS = 평타 + 모든 스킬 (분해 포함). */
export function computeDps(
  profile: BuildProfile,
  stats: StatBlock,
  opts: { skillRanks?: Record<string, number>; target?: TargetProfile } = {},
): DpsResult {
  const target = opts.target ?? DUMMY_TARGET;
  const basic = basicAttackDps(profile, stats, target);
  const perSkill: Record<string, number> = {};
  let skillTotal = 0;
  for (const sk of profile.character.skills) {
    if (sk.excludeFromDps) continue; // 패시브/DoT 등은 회전 DPS에서 제외
    const rank = opts.skillRanks?.[sk.slot] ?? 1;
    const d = skillDps(profile, sk, stats, rank, target);
    perSkill[sk.slot] = d;
    skillTotal += d;
  }
  return {
    total: basic + skillTotal,
    basicAttackDps: basic,
    skillDps: skillTotal,
    perSkill,
  };
}

/** 유효 체력(EHP). */
export function computeEhp(stats: StatBlock): EhpResult {
  const hp = stat(stats, "maxHp");
  const dr = damageReduction(stat(stats, "defense"));
  return {
    rawHp: hp,
    damageReduction: dr,
    effectiveHp: dr < 1 ? hp / (1 - dr) : Infinity,
    hpRegenPerSec: stat(stats, "hpRegen"),
  };
}

// ---------------------------------------------------------------------------
// 아이템 한계효율 비교
// ---------------------------------------------------------------------------

/** 비교 렌즈: 종합 DPS / 스킬 DPS / 평타 DPS / 유효체력. */
export type Metric = "total" | "skill" | "basic" | "ehp";

export interface ItemEfficiency {
  /** 장착 후 절대값 (종합 DPS) */
  dps: number;
  ehp: number;
  /** 기준 대비 변화량 (종합 DPS) */
  deltaDps: number;
  deltaEhp: number;
  /** 기준 대비 변화율 (0.12 = +12%) */
  deltaDpsPct: number;
  deltaEhpPct: number;
  /** 성분별 변화량 (스킬/평타 DPS) */
  deltaSkillDps: number;
  deltaSkillDpsPct: number;
  deltaBasicDps: number;
  deltaBasicDpsPct: number;
}

/** 렌즈별 (변화량, 변화율) 추출. */
export function metricDelta(eff: ItemEfficiency, metric: Metric): { delta: number; pct: number } {
  switch (metric) {
    case "skill":
      return { delta: eff.deltaSkillDps, pct: eff.deltaSkillDpsPct };
    case "basic":
      return { delta: eff.deltaBasicDps, pct: eff.deltaBasicDpsPct };
    case "ehp":
      return { delta: eff.deltaEhp, pct: eff.deltaEhpPct };
    default:
      return { delta: eff.deltaDps, pct: eff.deltaDpsPct };
  }
}

const pctOf = (after: number, before: number) => (before > 0 ? (after - before) / before : 0);

/**
 * 특정 빌드에 어떤 스탯 묶음(=아이템/조합)을 더했을 때의 효율.
 * baseExtra: 이미 깔려 있는 추가 스탯(다른 장착 아이템). 없으면 기본 스탯만 기준.
 */
export function itemEfficiency(
  profile: BuildProfile,
  itemStats: StatBlock,
  opts: {
    baseExtra?: StatBlock;
    skillRanks?: Record<string, number>;
    target?: TargetProfile;
  } = {},
): ItemEfficiency {
  const baseExtra = opts.baseExtra ?? {};
  const beforeStats = resolveStats(profile, baseExtra);
  const afterStats = resolveStats(profile, baseExtra, itemStats);

  const before = computeDps(profile, beforeStats, opts);
  const after = computeDps(profile, afterStats, opts);
  const beforeEhp = computeEhp(beforeStats).effectiveHp;
  const afterEhp = computeEhp(afterStats).effectiveHp;

  return {
    dps: after.total,
    ehp: afterEhp,
    deltaDps: after.total - before.total,
    deltaEhp: afterEhp - beforeEhp,
    deltaDpsPct: pctOf(after.total, before.total),
    deltaEhpPct: pctOf(afterEhp, beforeEhp),
    deltaSkillDps: after.skillDps - before.skillDps,
    deltaSkillDpsPct: pctOf(after.skillDps, before.skillDps),
    deltaBasicDps: after.basicAttackDps - before.basicAttackDps,
    deltaBasicDpsPct: pctOf(after.basicAttackDps, before.basicAttackDps),
  };
}

/**
 * 여러 아이템 후보를 같은 빌드에서 비교 → 한계효율 높은 순 정렬.
 * 정렬 기준 metric: "dps" | "ehp".
 */
export function compareItems(
  profile: BuildProfile,
  items: { name: string; stats: StatBlock }[],
  opts: {
    metric?: Metric;
    baseExtra?: StatBlock;
    skillRanks?: Record<string, number>;
    target?: TargetProfile;
  } = {},
): { name: string; eff: ItemEfficiency }[] {
  const metric = opts.metric ?? "total";
  const rows = items.map((it) => ({
    name: it.name,
    eff: itemEfficiency(profile, it.stats, opts),
  }));
  rows.sort((a, b) => metricDelta(b.eff, metric).delta - metricDelta(a.eff, metric).delta);
  return rows;
}

function clampIndex(i: number, len: number): number {
  if (len <= 0) return 0;
  return Math.min(len - 1, Math.max(0, i));
}

/** 스칼라면 그대로, 배열이면 레벨 인덱스로(범위 밖은 마지막 값). */
function resolveRatio(ratio: number | number[], idx: number): number {
  if (typeof ratio === "number") return ratio;
  if (ratio.length === 0) return 0;
  return ratio[clampIndex(idx, ratio.length)] ?? 0;
}
