/**
 * 게임 공식 상수 모듈.
 *
 * ⚠️ 여기 있는 수치/공식은 "구조"는 맞지만 정확한 상수는 게임 패치/검증이 필요하다.
 *    공식 API 데이터나 인게임 실측으로 검증 후 교체할 것. 각 항목에 // VERIFY 표기.
 *    엔진 로직은 이 모듈만 바꾸면 전체가 일관되게 갱신되도록 격리해 둔다.
 */

import type { StatKey, StatLine } from "./types.js";

/**
 * 방어력 → 피해 감소율.
 *   감소율 = defense / (defense + DEFENSE_K)
 *   유효체력 = HP * (defense + DEFENSE_K) / DEFENSE_K
 *   => 방어력 1의 유효체력 환산 = HP / DEFENSE_K
 *
 * 확인됨: 이터널리턴 공식 피해 공식의 방어력 항 = 받는 피해 × 100/(100+방어력) 이므로
 *   DEFENSE_K = 100 은 게임 실상수와 일치한다. (출처: 공식 피해 공식)
 */
export const DEFENSE_K = 100;

/**
 * 공격 속도 상한 (초당 평타 횟수). VERIFY: 게임 내 공속 캡 확인 필요.
 */
export const ATTACK_SPEED_CAP = 2.5; // VERIFY

/**
 * 쿨다운 감소 상한 (0~1). VERIFY.
 */
export const CDR_CAP = 0.6; // VERIFY

/**
 * 방어력에 따른 피해 감소율 (0~1). 관통 적용 후의 방어력을 받는다.
 */
export function damageReduction(effectiveDefense: number): number {
  const d = Math.max(0, effectiveDefense);
  return d / (d + DEFENSE_K);
}

/**
 * 관통 적용 후 유효 방어력.
 *   먼저 퍼센트 관통, 그 다음 고정 관통 적용 (음수 방지).
 * VERIFY: 관통 적용 순서/방식.
 */
export function effectiveDefense(
  targetDefense: number,
  armorPenPct: number,
  armorPenFlat: number,
): number {
  const afterPct = targetDefense * (1 - clamp01(armorPenPct));
  return Math.max(0, afterPct - Math.max(0, armorPenFlat));
}

/** 치명타 기댓값 배율: 1 + critChance * critDamage. */
export function critMultiplier(critChance: number, critDamage: number): number {
  return 1 + clamp01(critChance) * Math.max(0, critDamage);
}

/** 초당 평타 횟수 = baseAttackSpeed * (1 + 보너스), 캡 적용. */
export function attacksPerSecond(base: number, bonusRatio: number): number {
  return Math.min(ATTACK_SPEED_CAP, base * (1 + Math.max(0, bonusRatio)));
}

/** 유효 쿨다운(초) = base * (1 - min(cdr, cap)). */
export function effectiveCooldown(base: number, cdr: number): number {
  const r = Math.min(CDR_CAP, Math.max(0, cdr));
  return base * (1 - r);
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** 각 스탯이 속한 라인 (결과값 수렴 분류). */
export const STAT_LINE: Record<StatKey, StatLine> = {
  attackPower: "offense",
  skillAmp: "offense",
  attackSpeed: "offense",
  critChance: "offense",
  critDamage: "offense",
  armorPenFlat: "offense",
  armorPenPct: "offense",
  cooldownReduction: "offense",
  maxHp: "survival",
  defense: "survival",
  hpRegen: "survival",
  lifesteal: "survival",
  healAmp: "survival",
  moveSpeed: "utility",
  tenacity: "utility",
};
