/**
 * 샘플 캐릭터 데이터 (구조 시연용).
 *
 * ⚠️ 모든 수치는 임시 샘플값이다. 공식 API/인게임 실측으로 교체 전까지
 *    실제 밸런스를 반영하지 않는다. // SAMPLE 표기.
 *
 * 두 원형을 의도적으로 대비시켜 엔진이 캐릭터 맥락을 구분하는지 보여준다:
 *   - "공격력형 + 공속 무기군"  vs  "스킬증폭형 + 쿨감 의존"
 */

import type { Character } from "../src/types.js";

/** 공격력/공속 기반 원거리 딜러 (예: 권총·SMG형). */
export const sampleAdDealer: Character = {
  id: "sample-ad-dealer",
  name: "샘플 AD 딜러",
  positions: ["dealer"],
  baseStats: {
    attackPower: 50, // SAMPLE
    maxHp: 600, // SAMPLE
    defense: 25, // SAMPLE
    hpRegen: 2, // SAMPLE
    critChance: 0,
    critDamage: 0.3, // SAMPLE: 기본 치명타 피해 추가분
  },
  growthPerLevel: {
    attackPower: 4, // SAMPLE
    maxHp: 80, // SAMPLE
    defense: 3, // SAMPLE
  },
  skills: [
    {
      slot: "Q",
      name: "조준 사격",
      damageType: "physical",
      baseDamage: [40, 70, 100, 130, 160], // SAMPLE
      apRatio: 0.8, // 공격력 계수
      skillAmpRatio: 0, // 스킬증폭 계수 없음
      cooldown: [7, 6.5, 6, 5.5, 5], // SAMPLE
    },
    {
      slot: "E",
      name: "강화 탄환",
      damageType: "physical",
      baseDamage: [0, 0, 0, 0, 0],
      apRatio: 0.4,
      skillAmpRatio: 0,
      cooldown: [10, 9, 8, 7, 6], // SAMPLE
      scalesWithBasicAttack: true, // 평타 강화류
    },
  ],
  weapons: [
    {
      weaponType: "권총",
      basicAdRatio: 1.0, // 평타 = 공격력 100%
      baseAttackSpeed: 0.85, // SAMPLE
      basicDamageType: "physical",
      primaryStats: ["attackPower", "attackSpeed", "critChance", "critDamage"],
    },
    {
      weaponType: "돌격소총",
      basicAdRatio: 0.75, // 다단히트형: 발당 데미지 낮고 공속 높음
      baseAttackSpeed: 1.2, // SAMPLE
      basicDamageType: "physical",
      primaryStats: ["attackPower", "attackSpeed", "armorPenPct"],
    },
  ],
};

/** 스킬증폭/쿨감 기반 마법 딜러 (예: 스킬 의존형). */
export const sampleApMage: Character = {
  id: "sample-ap-mage",
  name: "샘플 AP 메이지",
  positions: ["dealer", "support"],
  baseStats: {
    skillAmp: 0, // 시작은 0, 아이템으로 확보
    attackPower: 30, // SAMPLE: 평타는 약함
    maxHp: 580, // SAMPLE
    defense: 22, // SAMPLE
    hpRegen: 2,
    critDamage: 0.3,
  },
  growthPerLevel: {
    attackPower: 2,
    maxHp: 75,
    defense: 3,
  },
  skills: [
    {
      slot: "Q",
      name: "마력 폭발",
      damageType: "magic",
      baseDamage: [60, 100, 140, 180, 220], // SAMPLE
      apRatio: 0.1, // 공격력 계수 약간
      skillAmpRatio: 1.0, // 스킬증폭 계수 큼
      cooldown: [5, 4.7, 4.4, 4.1, 3.8], // SAMPLE
    },
    {
      slot: "W",
      name: "연쇄 마법",
      damageType: "magic",
      baseDamage: [40, 65, 90, 115, 140],
      apRatio: 0,
      skillAmpRatio: 0.8,
      cooldown: [7, 6.5, 6, 5.5, 5], // SAMPLE
      hitCount: 2, // 다단
    },
    {
      slot: "R",
      name: "궁극 마법",
      damageType: "magic",
      baseDamage: [200, 320, 440], // SAMPLE: 3렙
      apRatio: 0,
      skillAmpRatio: 2.0,
      cooldown: [90, 78, 66], // SAMPLE
    },
  ],
  weapons: [
    {
      weaponType: "지팡이",
      // 스킬 의존형: 평타가 약하다 (낮은 계수 + 느린 공속)
      basicAdRatio: 0.5, // SAMPLE
      baseAttackSpeed: 0.55, // SAMPLE: 느림
      basicDamageType: "magic",
      primaryStats: ["skillAmp", "cooldownReduction", "maxHp"],
    },
  ],
};

export const sampleCharacters: Character[] = [sampleAdDealer, sampleApMage];
