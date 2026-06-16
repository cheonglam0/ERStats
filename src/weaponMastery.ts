/**
 * 무기 숙련도(무기군별) 보너스 레지스트리.
 *
 * 이터널리턴은 무기군을 쓸수록 숙련도 레벨이 올라가고, 무기군마다 서로 다른 스탯이 증가한다
 * (예: 공격속도 / 스킬증폭 / 평타 증폭 / 사거리 등). 무기군별 레벨당 정확한 증가 수치는
 * 공식 데이터 확보 후 입력한다.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * TODO(무기 숙련도 데이터 입력): 아래 WEAPON_MASTERY 를 무기군별로 채운다.
 *   - 출처: 인게임/공식 자료에서 무기군 숙련도 레벨당 증가 스탯 확보
 *   - perLevel 에 레벨당 증가분(선형 가정), base 에 1레벨 시점 기본 보너스
 *   - 데이터가 채워지면 UI에 자동으로 슬라이더가 활성화되고 스탯/DPS에 반영됨
 * 예시 스키마(값은 검증 필요, 실제 아님):
 *   OneHandSword: { maxLevel: 20, perLevel: { attackSpeed: 0.008 } }
 *   Glove:        { maxLevel: 20, perLevel: { attackSpeed: 0.01 } }
 *   TwoHandSword: { maxLevel: 20, perLevel: { skillAmp: 1 } }
 * ──────────────────────────────────────────────────────────────────────────
 */

import type { StatBlock, StatKey } from "./types.js";

export interface WeaponMastery {
  /** 숙련도 최대 레벨. */
  maxLevel: number;
  /** 레벨당 증가 스탯(선형 가정). 무기군마다 증가 스탯 종류가 다르다. */
  perLevel: StatBlock;
  /** 1레벨 시점 기본 보너스(있으면). */
  base?: StatBlock;
  /** 참고 메모(출처/한계). */
  note?: string;
}

/** 무기군(영문 weaponType) → 숙련도 보너스. 데이터 확보 전까지 비어 있음. */
export const WEAPON_MASTERY: Record<string, WeaponMastery> = {};

/** 해당 무기군에 숙련도 데이터가 입력돼 있는지. */
export function hasMastery(weaponType: string): boolean {
  return Object.prototype.hasOwnProperty.call(WEAPON_MASTERY, weaponType);
}

/** 무기군 숙련도 레벨에 따른 보너스 스탯(데이터 없으면 빈 객체). */
export function masteryStatsAt(weaponType: string, level: number): StatBlock {
  const m = WEAPON_MASTERY[weaponType];
  if (!m) return {};
  const lv = Math.max(1, Math.min(level, m.maxLevel));
  const steps = lv - 1;
  const out: StatBlock = { ...(m.base ?? {}) };
  for (const k of Object.keys(m.perLevel) as StatKey[]) {
    out[k] = (out[k] ?? 0) + (m.perLevel[k] ?? 0) * steps;
  }
  return out;
}
