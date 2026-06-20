/**
 * 공식 API 데이터 수집 + 정규화 스크립트.
 *   실행: npm run fetch:data
 *
 * 동작:
 *   1) .env 의 ER_API_KEY 로드 (키는 절대 출력/커밋하지 않음)
 *   2) 메타데이터(Character / 성장 / 무기군 / 아이템)와 한글 l10n 수집
 *   3) data/raw/*.json 에 원본 저장 (디버깅/재현용)
 *   4) 엔진이 쓰는 형태로 정규화 → data/game/characters.json, items.json, meta.json
 *
 * ⚠️ 공식 API에는 "스킬 데미지 계수(공격력/스킬증폭 비율)" 메타데이터가 없다.
 *    따라서 스킬 DPS는 별도 큐레이션 오버레이(data/skills/*)로 관리한다. 아래 SKILL GAP 참고.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = resolve(ROOT, "data/raw");
const GAME_DIR = resolve(ROOT, "data/game");
const BASE = "https://open-api.bser.io";

// ---------------------------------------------------------------------------
// 환경/유틸
// ---------------------------------------------------------------------------

function loadApiKey(): string {
  // 1) 환경변수 우선 — GitHub Actions Secrets(ER_API_KEY)가 env로 주입된다.
  //    키 교체 시 Secrets(또는 .env) 값만 바꾸면 되고 코드 수정은 불필요.
  const fromEnv = process.env.ER_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  // 2) 로컬 개발용 .env 파일 폴백.
  const envPath = resolve(ROOT, ".env");
  if (!existsSync(envPath))
    throw new Error("ER_API_KEY 가 없습니다. 환경변수(Secrets) 또는 .env 에 설정하세요.");
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("ER_API_KEY="));
  const key = line?.split("=").slice(1).join("=").trim();
  if (!key) throw new Error(".env 의 ER_API_KEY 가 비어 있습니다.");
  return key;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 호출 간 기본 간격(ms). 무료 티어 rate limit 대응. */
const REQUEST_DELAY = 1200;

async function apiGet(key: string, path: string): Promise<any> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${BASE}${path}`, { headers: { "x-api-key": key } });
    if (res.status === 429 || res.status >= 500) {
      const wait = 2000 * (attempt + 1);
      console.log(`    (HTTP ${res.status} — ${wait}ms 대기 후 재시도)`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`API ${path} → HTTP ${res.status}`);
    await sleep(REQUEST_DELAY);
    return res.json();
  }
  throw new Error(`API ${path} → 재시도 한계 초과(429/5xx)`);
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

// ---------------------------------------------------------------------------
// 메타데이터 수집
// ---------------------------------------------------------------------------

const META_TYPES = [
  "Character",
  "CharacterLevelUpStat",
  "CharacterAttributes",
  "ItemWeapon",
  "ItemArmor",
  "ItemSpecial",
  "ItemConsumable",
  "ItemMisc", // 제작 재료(잡템) 이름/등급
  "Trait", // 특성
  "TacticalSkillSet", // 전술 스킬
  "Monster", // 야생동물
  "MonsterDropGroup", // 야생동물 드랍
  "Area", // 지역
] as const;

/** --refresh 가 없고 캐시가 있으면 API 대신 디스크 원본을 쓴다. */
const USE_CACHE = !process.argv.includes("--refresh");

function readCache<T>(path: string): T | null {
  return USE_CACHE && existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
}

/** 빌드 비교의 필수 테이블이 아니어서, 수집 실패해도 중단하지 않고 건너뛰는 부가 테이블. */
const OPTIONAL_TYPES = new Set<string>([
  "ItemMisc",
  "Trait",
  "TacticalSkillSet",
  "Monster",
  "MonsterDropGroup",
  "Area",
]);

async function fetchMeta(key: string): Promise<Record<string, any[]>> {
  const out: Record<string, any[]> = {};
  for (const t of META_TYPES) {
    const cachePath = resolve(RAW_DIR, `${t}.json`);
    const cached = readCache<any[]>(cachePath);
    let rows: any[];
    if (cached) {
      rows = cached;
      console.log(`  [meta] ${t}: ${rows.length} rows (캐시)`);
    } else {
      try {
        const json = await apiGet(key, `/v1/data/${t}`);
        rows = json.data ?? [];
        writeJson(cachePath, rows);
        console.log(`  [meta] ${t}: ${rows.length} rows`);
      } catch (e) {
        if (!OPTIONAL_TYPES.has(t)) throw e; // 필수 테이블은 그대로 실패
        rows = [];
        console.warn(`  [meta] ${t}: 수집 실패 — 건너뜀 (${(e as Error).message})`);
      }
    }
    out[t] = rows;
  }
  return out;
}

/** l10n(한글) → { "Character/Name/1": "재키", ... } */
async function fetchL10n(key: string): Promise<Record<string, string>> {
  const cachePath = resolve(RAW_DIR, "l10n-ko.json");
  const cached = readCache<Record<string, string>>(cachePath);
  if (cached) {
    console.log(`  [l10n] ${Object.keys(cached).length} keys (캐시)`);
    return cached;
  }
  const meta = await apiGet(key, "/v1/l10n/Korean");
  const url: string = meta.data?.l10Path;
  if (!url) throw new Error("l10n 경로를 받지 못했습니다.");
  const txt = await (await fetch(url)).text();
  const map: Record<string, string> = {};
  for (const line of txt.split(/\r?\n/)) {
    // 형식: <키><구분자 1글자><값>  (키는 ASCII [\w/])
    const m = line.match(/^([\w/]+).(.*)$/);
    if (m && m[1]) map[m[1]] = m[2] ?? "";
  }
  writeJson(resolve(RAW_DIR, "l10n-ko.json"), map);
  console.log(`  [l10n] ${Object.keys(map).length} keys`);
  return map;
}

// ---------------------------------------------------------------------------
// 정규화: 캐릭터
// ---------------------------------------------------------------------------

interface NormCharacter {
  code: number;
  id: string; // 영문 resource 이름
  name: string; // 한글
  iconUrl?: string; // 캐릭터 프로필 일러스트 (dak.gg CDN)
  baseStats: Record<string, number>;
  growthPerLevel: Record<string, number>;
  attackSpeedBase: number; // VERIFY: 평타 기준 공속 모델 확정 필요
  attackSpeedLimit: number;
  weapons: {
    weaponType: string; // mastery (영문)
    weaponTypeKo: string;
    radar: { attack: number; defense: number; disruptor: number; move: number; assistance: number };
  }[];
}

const WEAPON_TYPE_KO: Record<string, string> = {
  Glove: "글러브",
  Tonfa: "톤파",
  Bat: "방망이",
  Whip: "채찍",
  // 자히르 전용 — 곡사/직사는 dak.gg에서 별개 무기군(별개 빌드)으로 취급된다. 라벨을 구분해야 중복으로 합쳐지지 않음.
  HighAngleFire: "투척(곡사)",
  DirectFire: "투척(직사)",
  Throw: "암기",
  Shuriken: "암기",
  Bow: "활",
  Crossbow: "석궁",
  CrossBow: "석궁", // dak.gg는 대문자 B 표기 사용
  Pistol: "권총",
  AssaultRifle: "돌격소총",
  SniperRifle: "저격총",
  Dagger: "단검",
  TwoHandSword: "양손검",
  OneHandSword: "한손검",
  Axe: "도끼",
  DualSword: "쌍검",
  Spear: "창",
  Nunchaku: "쌍절곤",
  Rapier: "레이피어",
  Hammer: "망치",
  Guitar: "기타",
  Camera: "카메라",
  Arcana: "아르카나",
  VFArcana: "아르카나",
  VFArm: "VF의수",
};

/** dak.gg 프로토콜 상대경로(//cdn…) → 절대 https URL. */
function dakIconUrl(url: unknown): string | undefined {
  if (typeof url !== "string" || !url) return undefined;
  return url.startsWith("//") ? `https:${url}` : url;
}

/** dak.gg 프로필 이미지로 캐릭터 일러스트(iconUrl) 채우기 (공식 API엔 없음). */
function enrichIcons(characters: NormCharacter[]): void {
  const cachePath = resolve(RAW_DIR, "dakgg-characters.json");
  if (!existsSync(cachePath)) return;
  const dak = JSON.parse(readFileSync(cachePath, "utf8")) as any[];
  const byKey = new Map(dak.map((c) => [c.key, c]));
  const byCode = new Map(dak.map((c) => [c.id, c]));
  for (const c of characters) {
    if (c.iconUrl) continue;
    const m = byKey.get(c.id) ?? byCode.get(c.code);
    const url = dakIconUrl(m?.imageUrl);
    if (url) c.iconUrl = url;
  }
}

/** 공식 API에 무기군(CharacterAttributes)이 누락된 캐릭터 수동 보강 (영문 mastery). */
const MANUAL_WEAPONS: Record<string, string[]> = {
  LiDailin: ["Glove", "Nunchaku"],
};

function normalizeCharacters(
  meta: Record<string, any[]>,
  l10n: Record<string, string>,
): NormCharacter[] {
  const levelUp = new Map<number, any>();
  for (const r of meta.CharacterLevelUpStat ?? []) levelUp.set(r.code, r);

  const attrsByChar = new Map<string, any[]>();
  for (const r of meta.CharacterAttributes ?? []) {
    const list = attrsByChar.get(r.character) ?? [];
    list.push(r);
    attrsByChar.set(r.character, list);
  }

  return (meta.Character ?? []).map((c) => {
    const lv = levelUp.get(c.code) ?? {};
    const attrs = attrsByChar.get(c.name) ?? [];
    const manual = MANUAL_WEAPONS[c.name];
    const masteries = attrs.length
      ? attrs.map((a) => ({ mastery: a.mastery, a }))
      : (manual ?? []).map((m) => ({ mastery: m, a: null as any }));
    const weapons = masteries.map(({ mastery, a }) => ({
      weaponType: mastery,
      weaponTypeKo: WEAPON_TYPE_KO[mastery] ?? mastery,
      radar: {
        attack: num(a?.attack),
        defense: num(a?.defense),
        disruptor: num(a?.disruptor),
        move: num(a?.move),
        assistance: num(a?.assistance),
      },
    }));
    return {
      code: c.code,
      id: c.name,
      name: l10n[`Character/Name/${c.code}`] ?? c.name,
      baseStats: {
        maxHp: num(c.maxHp),
        attackPower: num(c.attackPower),
        defense: num(c.defense),
        skillAmp: num(c.skillAmp),
        critChance: num(c.criticalStrikeChance),
        hpRegen: num(c.hpRegen),
        moveSpeed: num(c.moveSpeed),
      },
      growthPerLevel: {
        maxHp: num(lv.maxHp),
        attackPower: num(lv.attackPower),
        defense: num(lv.defense),
        skillAmp: num(lv.skillAmp),
        critChance: num(lv.criticalChance),
        hpRegen: num(lv.hpRegen),
      },
      attackSpeedBase: num(c.attackSpeed), // VERIFY
      attackSpeedLimit: num(c.attackSpeedLimit) || 2.5,
      weapons,
    };
  });
}

/**
 * 공식 API Character가 stale(신규 캐릭터 누락)이라, dak.gg에서 누락분을 보강한다.
 * dak.gg는 비공식 내부 API지만 최신 로스터/기본 스탯/무기군을 제공.
 */
async function fetchDakSupplement(existingCodes: Set<number>): Promise<NormCharacter[]> {
  const cachePath = resolve(RAW_DIR, "dakgg-characters.json");
  let chars: any[];
  const cached = readCache<any[]>(cachePath);
  if (cached) {
    chars = cached;
  } else {
    const res = await fetch("https://er.dakgg.io/api/v1/data/characters?hl=ko");
    chars = (await res.json()).characters ?? [];
    writeJson(cachePath, chars);
  }
  const supplement = chars.filter((c) => !existingCodes.has(c.id));
  console.log(`  [dak.gg] 보강 캐릭터: ${supplement.length}명`);
  return supplement.map((c) => {
    const lv = c.levelUpStat ?? {};
    return {
      code: c.id,
      id: c.key,
      name: c.name,
      iconUrl: dakIconUrl(c.imageUrl),
      baseStats: {
        maxHp: num(c.maxHp),
        attackPower: num(c.attackPower),
        defense: num(c.defense),
        skillAmp: 0,
        critChance: 0,
        hpRegen: num(c.hpRegen),
        moveSpeed: num(c.moveSpeed),
      },
      growthPerLevel: {
        maxHp: num(lv.maxHp),
        attackPower: num(lv.attackPower),
        defense: num(lv.defense),
        skillAmp: 0,
        critChance: 0,
        hpRegen: num(lv.hpRegen),
      },
      attackSpeedBase: num(c.attackSpeed),
      attackSpeedLimit: 2.5,
      weapons: (c.masteries ?? []).map((m: string) => ({
        weaponType: m,
        weaponTypeKo: WEAPON_TYPE_KO[m] ?? m,
        radar: { attack: 0, defense: 0, disruptor: 0, move: 0, assistance: 0 },
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// 정규화: 아이템
// ---------------------------------------------------------------------------

interface NormItem {
  code: number;
  name: string; // 한글 (원본 name 이 이미 한글)
  iconUrl?: string; // 아이템 아이콘 (dak.gg CDN)
  itemType: "Weapon" | "Armor" | "Special";
  slot: string; // 머리/가슴/팔/다리/장신구/무기
  weaponType?: string; // 무기일 때 mastery
  grade: string; // Common/Uncommon/Rare/Epic/Legendary
  stats: Record<string, number>;
  /** 레벨당 추가 스탯 (있을 때만). 총합 = stats + statsByLv*(level-1). VERIFY: 적용 기준 레벨. */
  statsByLv?: Record<string, number>;
}

const ARMOR_SLOT_KO: Record<string, string> = {
  Head: "머리",
  Chest: "가슴",
  Arm: "팔",
  Leg: "다리",
  Trinket: "장신구",
  Accessory: "장신구",
};

/** 원본 아이템 레코드 → 우리 StatKey 묶음 (0은 제거). */
function mapItemStats(r: any): Record<string, number> {
  const s: Record<string, number> = {
    attackPower: num(r.attackPower),
    skillAmp: num(r.skillAmp),
    defense: num(r.defense),
    maxHp: num(r.maxHp),
    hpRegen: num(r.hpRegen),
    attackSpeed: num(r.attackSpeedRatio),
    critChance: num(r.criticalStrikeChance),
    critDamage: num(r.criticalStrikeDamage),
    cooldownReduction: num(r.cooldownReduction),
    lifesteal: num(r.lifeSteal) + num(r.normalLifeSteal),
    moveSpeed: num(r.moveSpeed),
    armorPenFlat: num(r.penetrationDefense),
    armorPenPct: num(r.penetrationDefenseRatio),
    healAmp: num(r.hpHealedIncreaseRatio),
    tenacity: num(r.uniqueTenacity),
  };
  for (const k of Object.keys(s)) if (s[k] === 0) delete s[k];
  return s;
}

/** 아이템의 레벨당 추가 스탯 (0이 아닌 것만). 우리가 모델링하는 스탯만 매핑. */
function mapItemStatsByLv(r: any): Record<string, number> {
  const s: Record<string, number> = {
    attackPower: num(r.attackPowerByLv),
    skillAmp: num(r.skillAmpByLevel),
    maxHp: num(r.maxHpByLv),
    attackSpeed: num(r.attackSpeedRatioByLv),
  };
  for (const k of Object.keys(s)) if (s[k] === 0) delete s[k];
  return s;
}

function normalizeItems(meta: Record<string, any[]>): NormItem[] {
  const out: NormItem[] = [];

  for (const r of meta.ItemWeapon ?? []) {
    if (!r.isCompletedItem) continue; // 완성 아이템만 빌드 비교 대상
    out.push({
      code: r.code,
      name: r.name,
      itemType: "Weapon",
      slot: "무기",
      weaponType: r.weaponType,
      grade: r.itemGrade,
      stats: mapItemStats(r),
      ...(Object.keys(mapItemStatsByLv(r)).length ? { statsByLv: mapItemStatsByLv(r) } : {}),
    });
  }
  for (const r of meta.ItemArmor ?? []) {
    if (!r.isCompletedItem) continue;
    if (r.armorType === "Trinket" || r.armorType === "Accessory") continue; // 장신구는 삭제된 부위 — 제외
    out.push({
      code: r.code,
      name: r.name,
      itemType: "Armor",
      slot: ARMOR_SLOT_KO[r.armorType] ?? r.armorType,
      grade: r.itemGrade,
      stats: mapItemStats(r),
      ...(Object.keys(mapItemStatsByLv(r)).length ? { statsByLv: mapItemStatsByLv(r) } : {}),
    });
  }
  return out;
}

/**
 * dak.gg 아이템 아이콘으로 iconUrl 채우기 (공식 API엔 이미지가 없음).
 * dak.gg item.id == 우리 item.code.
 */
async function enrichItemIcons(items: NormItem[]): Promise<void> {
  const cachePath = resolve(RAW_DIR, "dakgg-items.json");
  let list: any[];
  const cached = readCache<{ items: any[] }>(cachePath);
  if (cached) {
    list = cached.items ?? [];
  } else {
    const res = await fetch("https://er.dakgg.io/api/v1/data/items?hl=ko");
    const json = await res.json();
    list = json.items ?? [];
    writeJson(cachePath, json);
  }
  const byId = new Map<number, any>(list.map((x) => [x.id, x]));
  let n = 0;
  for (const it of items) {
    const url = byId.get(it.code)?.imageUrl;
    if (typeof url === "string" && url) {
      it.iconUrl = url;
      n++;
    }
  }
  console.log(`  [dak.gg] 아이템 아이콘: ${n}/${items.length}`);
}

// ---------------------------------------------------------------------------
// 정규화: 특성 / 야생동물 / 지역 / 제작 트리 (부가 데이터 — 게임 시스템 뷰용)
// ---------------------------------------------------------------------------

/** 게임 텍스트의 서식 태그/플레이스홀더 제거 → 읽기용 한 줄. */
function cleanText(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/<[^>]+>/g, "") // <color=...> 등 태그 제거
    .replace(/\\n/g, " ")
    .replace(/\{\d+\}/g, "?") // 수치 플레이스홀더
    .replace(/\s+/g, " ")
    .trim();
}

interface NormTrait {
  code: number;
  name: string;
  group: string; // traitGroup (Havoc 등)
  type: string; // Core / Sub 등
  desc: string;
}

function normalizeTraits(meta: Record<string, any[]>, l10n: Record<string, string>): NormTrait[] {
  return (meta.Trait ?? [])
    .filter((t) => t.active !== false)
    .map((t) => ({
      code: t.code,
      name: l10n[`Trait/Name/${t.code}`] ?? String(t.code),
      group: t.traitGroup ?? "",
      type: t.traitType ?? "",
      desc: cleanText(l10n[`Trait/Tooltip/${t.code}`]),
    }))
    .filter((t) => t.name && t.name !== String(t.code));
}

interface NormMonster {
  code: number;
  name: string;
  grade: string;
  maxHp: number;
  attackPower: number;
  defense: number;
  attackSpeed: number;
  moveSpeed: number;
  gainExp: number;
  regenTime: number;
  isMutant: boolean;
}

function normalizeMonsters(
  meta: Record<string, any[]>,
  l10n: Record<string, string>,
): NormMonster[] {
  return (meta.Monster ?? [])
    .map((m) => ({
      code: m.code,
      name: l10n[`Monster/Name/${m.code}`] ?? m.monster,
      grade: m.grade ?? "Common",
      maxHp: num(m.maxHp),
      attackPower: num(m.attackPower),
      defense: num(m.defense),
      attackSpeed: num(m.attackSpeed),
      moveSpeed: num(m.moveSpeed),
      gainExp: num(m.gainExp),
      regenTime: num(m.regenTime),
      isMutant: Boolean(m.isMutant),
    }))
    .filter((m) => m.name);
}

interface NormArea {
  code: number;
  name: string;
  areaType: string;
  startingArea: boolean;
}

function normalizeAreas(meta: Record<string, any[]>, l10n: Record<string, string>): NormArea[] {
  return (meta.Area ?? [])
    .map((a) => ({
      code: a.code,
      name: l10n[`Area/Name/${a.code}`] ?? a.name,
      areaType: a.areaType ?? "",
      startingArea: Boolean(a.startingArea),
    }))
    .filter((a) => a.name);
}

interface NormRecipe {
  code: number;
  name: string;
  grade: string;
  kind: string; // Weapon/Armor/Special/Consumable/Misc
  slot?: string; // 방어구/무기 부위 (있으면)
  weaponType?: string;
  m1: number; // 재료1 코드 (0=기본 재료)
  m2: number;
  iconUrl?: string;
}

/** 모든 아이템 테이블에서 제작 레시피(makeMaterial) 사전 구성. 재료 추적은 코드로. */
function normalizeRecipes(meta: Record<string, any[]>): NormRecipe[] {
  const out: NormRecipe[] = [];
  const push = (r: any, kind: string, extra: Partial<NormRecipe> = {}) => {
    out.push({
      code: r.code,
      name: r.name,
      grade: r.itemGrade ?? "Common",
      kind,
      m1: num(r.makeMaterial1),
      m2: num(r.makeMaterial2),
      ...extra,
    });
  };
  for (const r of meta.ItemWeapon ?? []) push(r, "Weapon", { weaponType: r.weaponType, slot: "무기" });
  for (const r of meta.ItemArmor ?? [])
    push(r, "Armor", { slot: ARMOR_SLOT_KO[r.armorType] ?? r.armorType });
  for (const r of meta.ItemSpecial ?? []) push(r, "Special");
  for (const r of meta.ItemConsumable ?? []) push(r, "Consumable");
  for (const r of meta.ItemMisc ?? []) push(r, "Misc");
  return out;
}

/** dak.gg 아이콘으로 레시피 아이템 아이콘 보강 (재료 포함 전체). */
async function enrichRecipeIcons(recipes: NormRecipe[]): Promise<void> {
  const cachePath = resolve(RAW_DIR, "dakgg-items.json");
  if (!existsSync(cachePath)) return;
  const cached = JSON.parse(readFileSync(cachePath, "utf8")) as { items?: any[] };
  const byId = new Map<number, any>((cached.items ?? []).map((x) => [x.id, x]));
  for (const r of recipes) {
    const url = byId.get(r.code)?.imageUrl;
    if (typeof url === "string" && url) r.iconUrl = url;
  }
}

// ---------------------------------------------------------------------------
// 부가 수집: 전술 스킬 + 티어/메타 (dak.gg, 공식 API 미제공분)
// ---------------------------------------------------------------------------

interface NormTactical {
  code: number;
  name: string;
  desc: string;
  iconUrl?: string;
}

/** dak.gg 전술 스킬(공식 /v1/data/TacticalSkillSet 은 502). 이름 중복 제거. */
async function fetchTacticalSkills(): Promise<NormTactical[]> {
  const cachePath = resolve(RAW_DIR, "dakgg-tactical-skills.json");
  let raw: any;
  const cached = readCache<any>(cachePath);
  if (cached) {
    raw = cached;
  } else {
    try {
      const res = await fetch("https://er.dakgg.io/api/v1/data/tactical-skills?hl=ko");
      raw = await res.json();
      writeJson(cachePath, raw);
    } catch (e) {
      console.warn(`  [dak.gg] 전술 스킬 수집 실패 — 건너뜀 (${(e as Error).message})`);
      return [];
    }
  }
  const list: any[] = raw.tacticalSkills ?? [];
  const seen = new Set<string>();
  const out: NormTactical[] = [];
  for (const t of list) {
    if (!t.name || seen.has(t.name)) continue;
    seen.add(t.name);
    out.push({ code: t.id, name: t.name, desc: cleanText(t.tooltip), iconUrl: t.imageUrl });
  }
  return out;
}

interface MetaBuild {
  weapon: string; // 무기군 한글
  tier: string; // S/A/B/C/D
  tierScore: number;
  games: number;
  pickRate: number;
  winRate: number;
  top3Rate: number;
}
interface MetaRow {
  name: string;
  games: number;
  pickRate: number;
  winRate: number;
  top3Rate: number;
  tier: string; // 대표(최다 픽 빌드) 티어
  builds: MetaBuild[];
}
interface NormMetaTier {
  patch: number;
  tier: string;
  updatedAt: number;
  totalGames: number;
  rows: MetaRow[];
}

/** dak.gg 캐릭터 통계 → (캐릭터별) 티어/픽률/승률/Top3. 무기군별 빌드 분해 포함. */
async function fetchMetaTier(): Promise<NormMetaTier | null> {
  const cachePath = resolve(RAW_DIR, "dakgg-character-stats.json");
  let raw: any;
  const cached = readCache<any>(cachePath);
  if (cached) {
    raw = cached;
  } else {
    try {
      const res = await fetch("https://er.dakgg.io/api/v1/character-stats?hl=ko");
      raw = await res.json();
      writeJson(cachePath, raw);
    } catch (e) {
      console.warn(`  [dak.gg] 티어/메타 수집 실패 — 건너뜀 (${(e as Error).message})`);
      return null;
    }
  }
  const snap = raw.characterStatSnapshot;
  if (!snap?.characterStats) return null;

  // 매핑: dak.gg 캐릭터 id→이름, 무기 id→무기군 key
  const dakCharsPath = resolve(RAW_DIR, "dakgg-characters.json");
  if (!existsSync(dakCharsPath)) return null;
  const dakChars = JSON.parse(readFileSync(dakCharsPath, "utf8")) as any[];
  const nameByKey = new Map<number, string>(dakChars.map((c) => [c.id, c.name]));
  const weaponKeyToType = new Map<number, string>();
  for (const c of dakChars)
    for (const w of c.weaponTypes ?? []) weaponKeyToType.set(w.id, w.key);

  const totalGames = num(snap.tierGameCount) || 1; // 표본 게임 수 (표시용)
  // 픽률 분모 = 전체 픽 수(tierCount). 게임 수로 나누면 BR 특성상 등장률(>100% 합산)이 되어 dak.gg 표기와 다름.
  const totalPicks = num(snap.tierCount) || totalGames;
  const rows: MetaRow[] = [];
  for (const cs of snap.characterStats) {
    const name = nameByKey.get(cs.key);
    if (!name) continue;
    // 같은 무기군 라벨로 병합 — 서로 다른 dak key가 한 무기군으로 모이는 경우
    // (예: HighAngleFire + DirectFire → '투척') 빌드가 중복 표기되는 것을 막는다.
    type Acc = { weapon: string; tier: string; tierScore: number; games: number; win: number; top3: number };
    const byWeapon = new Map<string, Acc>();
    for (const ws of cs.weaponStats ?? []) {
      const games = num(ws.count);
      const type = weaponKeyToType.get(ws.key) ?? String(ws.key);
      const weapon = WEAPON_TYPE_KO[type] ?? type;
      const tierScore = Math.round(num(ws.tierScore) * 10) / 10;
      const cur = byWeapon.get(weapon);
      if (cur) {
        if (games > cur.games) {
          // 최다 픽 빌드의 티어/점수를 대표값으로
          cur.tier = ws.tier ?? cur.tier;
          cur.tierScore = tierScore;
        }
        cur.games += games;
        cur.win += num(ws.win);
        cur.top3 += num(ws.top3);
      } else {
        byWeapon.set(weapon, { weapon, tier: ws.tier ?? "-", tierScore, games, win: num(ws.win), top3: num(ws.top3) });
      }
    }
    const builds: MetaBuild[] = [...byWeapon.values()]
      .map((b) => ({
        weapon: b.weapon,
        tier: b.tier,
        tierScore: b.tierScore,
        games: b.games,
        pickRate: b.games / totalPicks,
        winRate: b.games ? b.win / b.games : 0,
        top3Rate: b.games ? b.top3 / b.games : 0,
      }))
      .sort((a, b) => b.games - a.games);
    if (builds.length === 0) continue;
    const games = builds.reduce((s, b) => s + b.games, 0);
    const win = (cs.weaponStats ?? []).reduce((s: number, w: any) => s + num(w.win), 0);
    const top3 = (cs.weaponStats ?? []).reduce((s: number, w: any) => s + num(w.top3), 0);
    rows.push({
      name,
      games,
      pickRate: games / totalPicks,
      winRate: games ? win / games : 0,
      top3Rate: games ? top3 / games : 0,
      tier: builds[0]!.tier, // 최다 픽 빌드의 티어를 대표값으로
      builds,
    });
  }
  rows.sort((a, b) => (b.builds[0]?.tierScore ?? 0) - (a.builds[0]?.tierScore ?? 0));
  return {
    patch: num(raw.meta?.patch),
    tier: raw.meta?.tier ?? "",
    updatedAt: num(raw.meta?.updatedAt),
    totalGames,
    rows,
  };
}

// ---------------------------------------------------------------------------
// 자동화 안전장치
// ---------------------------------------------------------------------------

/** 직전 수집 시 저장된 카운트 (meta.json). 급감 감지 기준값. */
function readPrevCounts(): { characters: number; items: number } | null {
  const p = resolve(GAME_DIR, "meta.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")).counts ?? null;
  } catch {
    return null;
  }
}

/**
 * 무인 자동 갱신(GitHub Actions) 보호:
 *   API 장애·키 만료·rate limit 등으로 수집이 부분 실패하면 결과가 텅 비거나 급감하는데,
 *   그대로 쓰면 깨진 데이터가 커밋·배포된다. 비정상이면 기존 data/game/* 를 건드리지 않고 중단.
 */
function assertDataSane(charCount: number, itemCount: number): void {
  const HARD_MIN_CHARS = 50;
  const HARD_MIN_ITEMS = 150;
  if (charCount < HARD_MIN_CHARS || itemCount < HARD_MIN_ITEMS)
    throw new Error(
      `수집 결과 비정상(캐릭터 ${charCount}, 아이템 ${itemCount}). 기존 데이터 보호를 위해 중단 — API 응답/키를 확인하세요.`,
    );
  const prev = readPrevCounts();
  if (prev && (charCount < prev.characters * 0.7 || itemCount < prev.items * 0.7))
    throw new Error(
      `수집 결과가 직전 대비 급감(캐릭터 ${prev.characters}→${charCount}, 아이템 ${prev.items}→${itemCount}). 중단.`,
    );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const key = loadApiKey();
  console.log(USE_CACHE ? "데이터 정규화 (캐시 우선, 새로고침은 --refresh)…" : "공식 API 전체 재수집…");

  const metaCache = readCache<{ dataHash?: unknown }>(resolve(GAME_DIR, "meta.json"));
  const hash = USE_CACHE && metaCache?.dataHash
    ? { data: metaCache.dataHash }
    : await apiGet(key, "/v2/data/hash");
  const meta = await fetchMeta(key);
  const l10n = await fetchL10n(key);

  const officialChars = normalizeCharacters(meta, l10n);
  const existingCodes = new Set(officialChars.map((c) => c.code));
  const dakChars = await fetchDakSupplement(existingCodes);
  const characters = [...officialChars, ...dakChars];
  enrichIcons(characters); // 공식 API 캐릭터에 dak.gg 일러스트 URL 보강
  const items = normalizeItems(meta);
  await enrichItemIcons(items); // dak.gg 아이템 아이콘 URL 보강

  assertDataSane(characters.length, items.length); // 비정상 수집이면 여기서 중단(쓰기 전)

  // 부가 데이터(게임 시스템 뷰): 특성/야생동물/지역/제작 트리. 실패해도 핵심 데이터는 유지.
  const traits = normalizeTraits(meta, l10n);
  const monsters = normalizeMonsters(meta, l10n);
  const areas = normalizeAreas(meta, l10n);
  const recipes = normalizeRecipes(meta);
  await enrichRecipeIcons(recipes);
  const tactical = await fetchTacticalSkills();
  const metaTier = await fetchMetaTier();

  writeJson(resolve(GAME_DIR, "characters.json"), characters);
  writeJson(resolve(GAME_DIR, "items.json"), items);
  writeJson(resolve(GAME_DIR, "traits.json"), traits);
  writeJson(resolve(GAME_DIR, "monsters.json"), monsters);
  writeJson(resolve(GAME_DIR, "areas.json"), areas);
  writeJson(resolve(GAME_DIR, "crafting.json"), recipes);
  writeJson(resolve(GAME_DIR, "tactical.json"), tactical);
  if (metaTier) writeJson(resolve(GAME_DIR, "metaTier.json"), metaTier);
  writeJson(resolve(GAME_DIR, "meta.json"), {
    fetchedAt: new Date().toISOString(),
    dataHash: hash.data ?? null,
    counts: {
      characters: characters.length,
      items: items.length,
      traits: traits.length,
      monsters: monsters.length,
      areas: areas.length,
      recipes: recipes.length,
      tactical: tactical.length,
      metaRows: metaTier?.rows.length ?? 0,
    },
  });

  console.log(
    `\n완료: 캐릭터 ${characters.length}명, 완성 아이템 ${items.length}개 → data/game/`,
  );
  console.log(
    `  부가: 특성 ${traits.length} · 야생동물 ${monsters.length} · 지역 ${areas.length} · 제작 ${recipes.length} · 전술 ${tactical.length} · 메타 ${metaTier?.rows.length ?? 0}`,
  );
  console.log(
    "※ 스킬 데미지 계수는 공식 API에 없음 → data/skills/ 큐레이션 오버레이로 별도 관리 필요.",
  );
}

main().catch((e) => {
  console.error("수집 실패:", e.message);
  process.exit(1);
});
