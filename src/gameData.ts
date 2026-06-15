/**
 * 정규화된 실데이터(data/game/*.json) → 엔진 타입 어댑터.
 *
 * 현재 한계(보류 항목):
 *  - 스킬 계수는 공식 API에 없어 skills=[] 로 둔다 → 스킬 DPS는 0. (추후 data/skills 오버레이)
 *  - 무기군 평타 계수(basicAdRatio)·기준 공속(baseAttackSpeed)은 API에 없어 기본값 사용. // VERIFY
 *  이 때문에 절대 DPS보다 "아이템 간 상대 효율(한계효율)"이 신뢰 가능한 지표다.
 */

import type {
  Character,
  Position,
  StatBlock,
  StatKey,
  WeaponBuild,
} from "./types.js";
import charactersJson from "../data/game/characters.json";
import itemsJson from "../data/game/items.json";
import { getSkillsFor, charactersWithSkills } from "./skillData.js";

// --- 원본 JSON 형태 ---
interface RawWeapon {
  weaponType: string;
  weaponTypeKo: string;
  radar: { attack: number; defense: number; disruptor: number; move: number; assistance: number };
}
interface RawCharacter {
  code: number;
  id: string;
  name: string;
  iconUrl?: string;
  baseStats: Record<string, number>;
  growthPerLevel: Record<string, number>;
  attackSpeedBase: number;
  attackSpeedLimit: number;
  weapons: RawWeapon[];
}
export interface GameItem {
  code: number;
  name: string;
  iconUrl?: string;
  itemType: "Weapon" | "Armor" | "Special";
  slot: string; // 무기/머리/가슴/팔/다리/장신구
  weaponType?: string;
  grade: string;
  stats: StatBlock;
  /** 레벨당 추가 스탯(있을 때만). */
  statsByLv?: StatBlock;
}

/** 아이템 스탯을 캐릭터 레벨 기준으로 환산 (base + byLv*(level-1)). */
export function itemStatsAtLevel(item: GameItem, level: number): StatBlock {
  if (!item.statsByLv) return item.stats;
  const steps = Math.max(0, level - 1);
  const out: StatBlock = { ...item.stats };
  for (const k of Object.keys(item.statsByLv) as StatKey[]) {
    out[k] = (out[k] ?? 0) + (item.statsByLv[k] ?? 0) * steps;
  }
  return out;
}

const rawCharacters = charactersJson as unknown as RawCharacter[];
export const gameItems = itemsJson as unknown as GameItem[];

/** VERIFY: 평타 기준 공속(무기군별 실제 값 미확보, 임시 공통 기본값). */
const DEFAULT_BASE_ATTACK_SPEED = 1.0;
/** VERIFY: 평타 공격력 계수(대부분 100% AP 가정). */
const DEFAULT_BASIC_AD_RATIO = 1.0;

const KNOWN_STATS: StatKey[] = [
  "attackPower", "skillAmp", "attackSpeed", "critChance", "critDamage",
  "armorPenFlat", "armorPenPct", "cooldownReduction",
  "maxHp", "defense", "hpRegen", "lifesteal", "healAmp",
  "moveSpeed", "tenacity",
];

function pickStats(src: Record<string, number>): StatBlock {
  const out: StatBlock = {};
  for (const k of KNOWN_STATS) if (src[k]) out[k] = src[k];
  return out;
}

/** 무기군 레이더 값으로 대략적 포지션 추정 (UI 표기용, 참고치). */
function guessPositions(weapons: RawWeapon[]): Position[] {
  const sum = weapons.reduce(
    (a, w) => ({
      attack: a.attack + w.radar.attack,
      defense: a.defense + w.radar.defense,
      assistance: a.assistance + w.radar.assistance,
    }),
    { attack: 0, defense: 0, assistance: 0 },
  );
  const top = Math.max(sum.attack, sum.defense, sum.assistance);
  const pos: Position[] = [];
  if (sum.attack === top) pos.push("dealer");
  if (sum.defense === top) pos.push("tanker");
  if (sum.assistance === top) pos.push("support");
  return pos.length ? pos : ["flex"];
}

/** 무기군 영문 → 한글 라벨 (표시용). */
export const WEAPON_KO: Record<string, string> = {};
for (const rc of rawCharacters)
  for (const w of rc.weapons) WEAPON_KO[w.weaponType] = w.weaponTypeKo;

export const weaponLabel = (type: string): string => WEAPON_KO[type] ?? type;

function toWeaponBuild(w: RawWeapon): WeaponBuild {
  return {
    weaponType: w.weaponType, // 영문 식별자 (아이템 weaponType과 매칭)
    basicAdRatio: DEFAULT_BASIC_AD_RATIO, // VERIFY
    baseAttackSpeed: DEFAULT_BASE_ATTACK_SPEED, // VERIFY
    basicDamageType: "physical",
    primaryStats: [],
  };
}

function toCharacter(rc: RawCharacter): Character {
  return {
    id: rc.id,
    name: rc.name,
    iconUrl: rc.iconUrl,
    positions: guessPositions(rc.weapons),
    baseStats: pickStats(rc.baseStats),
    growthPerLevel: pickStats(rc.growthPerLevel),
    skills: getSkillsFor(rc.id), // 나무위키 기준 스킬 오버레이(없으면 빈 배열)
    weapons: rc.weapons.map(toWeaponBuild),
  };
}

export const gameCharacters: Character[] = rawCharacters
  .map(toCharacter)
  .filter((c) => c.weapons.length > 0)
  .sort((a, b) => a.name.localeCompare(b.name, "ko"));

/** 스킬 계수가 입력된 캐릭터인지 (UI 배지/안내용). */
export function hasSkillData(characterId: string): boolean {
  return charactersWithSkills.has(characterId);
}

/** 슬롯 필터 옵션 (등장 순서 고정). 장신구는 삭제된 부위라 제외. */
export const ITEM_SLOTS = ["무기", "머리", "가슴", "팔", "다리"] as const;

/** 등급 표시 순서/색상용. */
export const GRADE_ORDER = ["Legend", "Mythic", "Epic", "Rare", "Uncommon", "Common"];
