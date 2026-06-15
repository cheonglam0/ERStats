/**
 * 데이터 스키마 — 이터널리턴 스탯 비교 엔진
 *
 * 핵심 모델: 분석 단위는 "캐릭터"가 아니라 (캐릭터 × 무기군) = BuildProfile.
 * 같은 캐릭터라도 무기군에 따라 평타 계수와 메인 스탯이 달라지기 때문.
 *
 * 모든 수치는 "게임 내 표기값" 기준. 공식 데이터(API) 연동 전까지는 샘플값을 사용하며,
 * 검증이 필요한 값에는 데이터 파일에서 `// VERIFY` 주석을 단다.
 */

/** 게임에 존재하는 스탯 종류. UI 라벨/단위는 STAT_META(별도)에서 관리. */
export type StatKey =
  // --- 공격 라인 ---
  | "attackPower" // 공격력 (AP)
  | "skillAmp" // 스킬 증폭
  | "attackSpeed" // 공격 속도 (보너스 비율, 0.30 = +30%)
  | "critChance" // 치명타 확률 (0~1)
  | "critDamage" // 치명타 피해 배율 추가분 (0.30 = 치명타 시 +30%)
  | "armorPenFlat" // 방어 관통 (고정)
  | "armorPenPct" // 방어 관통 (퍼센트, 0~1)
  | "cooldownReduction" // 쿨다운 감소 (0~ , 0.20 = -20%)
  // --- 생존 라인 ---
  | "maxHp" // 최대 체력
  | "defense" // 방어력
  | "hpRegen" // 초당 체력 재생
  | "lifesteal" // 모든 피해 흡혈 (0~1)
  | "healAmp" // 회복량 증가 (0~1)
  // --- 유틸 라인 (DPS/EHP로 환산 불가, 별도 표기) ---
  | "moveSpeed" // 이동 속도
  | "tenacity"; // 방해 효과 저항 (0~1)

/** 스탯 한 묶음. 누락된 키는 0으로 간주. */
export type StatBlock = Partial<Record<StatKey, number>>;

/** 스탯이 어느 라인에 속하는지 — 결과값 수렴 분류용. */
export type StatLine = "offense" | "survival" | "utility";

/** 데미지 유형 (방어/관통 적용 방식이 다름). */
export type DamageType = "physical" | "magic" | "true";

/** 스킬 하나의 계수 정의. 레벨별 배열은 [1렙, 2렙, ...] 순. */
export interface Skill {
  /** 식별자: "Q" | "W" | "E" | "R" | "P"(패시브) 등 */
  slot: string;
  name: string;
  damageType: DamageType;
  /** 레벨별 기본 데미지 */
  baseDamage: number[];
  /**
   * 공격력 계수 (예: 0.8 = AP의 80%). 스킬당 공격력·스킬증폭 계수를 동시에 가질 수 있음.
   * 레벨에 따라 계수가 달라지면 배열로([20%,30%,...] → [0.2,0.3,...]) 줄 수 있다.
   */
  apRatio: number | number[];
  /** 스킬 증폭 계수 (스칼라 또는 레벨별 배열) */
  skillAmpRatio: number | number[];
  /** 레벨별 쿨다운(초) */
  cooldown: number[];
  /** 한 번 시전에 데미지가 적용되는 횟수 (다단히트). 기본 1. */
  hitCount?: number;
  /** 평타 계수도 함께 받는 스킬이면 true (예: 평타 강화류). 기본 false. */
  scalesWithBasicAttack?: boolean;
  /** 패시브/DoT 등 회전 DPS 계산에서 제외할 스킬이면 true (정보 표시용으로만 저장). */
  excludeFromDps?: boolean;
  /** 데이터 입력 시 참고/한계 메모 (예: 대상 현재 체력 비례분 미반영). */
  note?: string;
}

/** 무기군 하나 = 평타 메커니즘 + 그 무기에서의 주력 스탯. */
export interface WeaponBuild {
  /** 무기군 이름: "글러브" | "양손검" | "권총" | ... */
  weaponType: string;
  /** 평타 1회 데미지 = attackPower * basicAdRatio (+ basicBonus) */
  basicAdRatio: number;
  /** 평타 고정 추가 데미지 (있으면) */
  basicBonus?: number;
  /** 기본 공격 속도 (초당 평타 횟수, 보너스 0%일 때) */
  baseAttackSpeed: number;
  /** 평타 데미지 유형 (대부분 physical) */
  basicDamageType?: DamageType;
  /** 이 무기군에서 주력으로 올리는 스탯 (UI 정렬/추천용) */
  primaryStats: StatKey[];
  /** 이 무기군에서 다르게 동작하는 스킬 override (slot → 부분 갱신) */
  skillOverrides?: Record<string, Partial<Skill>>;
}

/** 포지션 (참고/필터용; 빌드 방향에 따라 달라질 수 있음). */
export type Position = "tanker" | "dealer" | "support" | "assassin" | "flex";

/** 캐릭터 한 명. 여러 무기군과 공통 스킬셋을 가짐. */
export interface Character {
  id: string;
  name: string;
  /** 캐릭터 프로필 일러스트 URL (목록 가시성용). */
  iconUrl?: string;
  positions: Position[];
  /** 1레벨 기본 스탯 */
  baseStats: StatBlock;
  /** 레벨당 성장치 (선형 가정; 비선형이면 추후 확장) */
  growthPerLevel: StatBlock;
  /** 공통 스킬셋 (무기군별 차이는 WeaponBuild.skillOverrides로) */
  skills: Skill[];
  /** 보유 무기군 목록 */
  weapons: WeaponBuild[];
}

/** 특정 캐릭터의 특정 무기군 + 레벨로 고정된 분석 단위. */
export interface BuildProfile {
  character: Character;
  weapon: WeaponBuild;
  level: number;
}

/** 가상의 대상(데미지 계산 기준). 기본은 무방비 더미(방어 0). */
export interface TargetProfile {
  defense: number;
  maxHp: number;
}

/** DPS 계산 결과 (디버깅/표시용 분해 포함). */
export interface DpsResult {
  total: number;
  basicAttackDps: number;
  skillDps: number;
  /** 슬롯별 스킬 DPS 분해 */
  perSkill: Record<string, number>;
}

/** EHP(유효 체력) 계산 결과. */
export interface EhpResult {
  /** 유효 체력 = 실제 체력 / (1 - 피해감소율) */
  effectiveHp: number;
  rawHp: number;
  damageReduction: number; // 0~1
  hpRegenPerSec: number;
}
