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

/** number | number[] 계수의 대표값(레벨 평균). */
function avgRatio(r: number | number[] | undefined): number {
  if (r == null) return 0;
  if (typeof r === "number") return r;
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
}

/**
 * 캐릭터의 주 공격 스탯 판별.
 *
 * 캐릭터 기본 스탯에는 스킬증폭이 모두 0이라(전 캐릭 공격력만 존재), 어떤 캐릭터가
 * "스킬증폭 메인"인지 기본 스탯만으로는 알 수 없다. 그래서 스킬 계수 합으로 추정한다:
 *   - 회전 DPS 대상 스킬들의 skillAmpRatio 합 > apRatio 합  →  "skillAmp"
 *   - 그 외(스킬 데이터 없음 포함)                         →  "attackPower"
 */
export function mainOffenseStat(character: Character): "attackPower" | "skillAmp" {
  let ap = 0;
  let amp = 0;
  for (const s of character.skills) {
    if (s.excludeFromDps) continue;
    ap += avgRatio(s.apRatio);
    amp += avgRatio(s.skillAmpRatio);
  }
  return amp > ap ? "skillAmp" : "attackPower";
}

/** 캐릭터 id → 주 공격 스탯 (목록/배지에서 반복 조회용 캐시). */
export const mainStatById = new Map<string, "attackPower" | "skillAmp">(
  gameCharacters.map((c) => [c.id, mainOffenseStat(c)]),
);

/** 슬롯 필터 옵션 (등장 순서 고정). 장신구는 삭제된 부위라 제외. */
export const ITEM_SLOTS = ["무기", "머리", "가슴", "팔", "다리"] as const;

/** 등급 표시 순서/색상용. */
export const GRADE_ORDER = ["Legend", "Mythic", "Epic", "Rare", "Uncommon", "Common"];

// ---------------------------------------------------------------------------
// 체력 ↔ 방어력 아이템 환산비 (실질체력 효율 비교용)
// ---------------------------------------------------------------------------

/** 방어력/체력이 붙는 방어구 부위. (무기는 체력·방어 옵션 비교 대상에서 제외) */
const ARMOR_SLOTS = ["머리", "가슴", "팔", "다리"] as const;

/** 레벨 환산 스탯값(level 기준, base + byLv*(level-1)). */
function statAt(item: GameItem, key: StatKey, level: number): number {
  return (item.stats[key] ?? 0) + (item.statsByLv?.[key] ?? 0) * Math.max(0, level - 1);
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export interface HpDefRatio {
  /** 전체(모든 등급) 환산비. */
  all: number;
  /** 등급별 환산비 (데이터가 충분한 등급만). */
  byGrade: Record<string, number>;
}

/**
 * "방어력 1 대신 얻는 체력(R)"을 아이템 데이터에서 산출.
 *
 * 같은 (부위, 등급) 버킷에서 방어력 위주 아이템과 체력 위주 아이템은 동일한 아이템 예산을
 * 쓴다고 보고, 각 버킷의 (체력 평균 / 방어력 평균)을 그 등급/부위의 교환비로 본다.
 * 부위별 스탯 크기 차이가 평균을 왜곡하지 않도록 버킷 비율들의 중앙값으로 집계한다.
 * (장비 비교 기준이라 레벨은 만렙 부근인 18로 환산.)
 */
function computeHpDefRatio(level = 18): HpDefRatio {
  const byBucket = new Map<string, { def: number[]; hp: number[] }>();
  for (const it of gameItems) {
    if (!(ARMOR_SLOTS as readonly string[]).includes(it.slot)) continue;
    const key = `${it.slot}|${it.grade}`;
    const b = byBucket.get(key) ?? { def: [], hp: [] };
    const dv = statAt(it, "defense", level);
    const hv = statAt(it, "maxHp", level);
    if (dv > 0) b.def.push(dv);
    if (hv > 0) b.hp.push(hv);
    byBucket.set(key, b);
  }
  const allRatios: number[] = [];
  const gradeRatios = new Map<string, number[]>();
  for (const [key, b] of byBucket) {
    if (b.def.length === 0 || b.hp.length === 0) continue;
    const ratio = mean(b.hp) / mean(b.def);
    allRatios.push(ratio);
    const grade = key.split("|")[1]!;
    const arr = gradeRatios.get(grade) ?? [];
    arr.push(ratio);
    gradeRatios.set(grade, arr);
  }
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const byGrade: Record<string, number> = {};
  for (const [grade, arr] of gradeRatios) byGrade[grade] = round1(median(arr));
  return { all: round1(median(allRatios)) || 10, byGrade };
}

/** 체력↔방어력 아이템 환산비 (실질체력 분석 기본값). */
export const HP_DEF_RATIO: HpDefRatio = computeHpDefRatio();
