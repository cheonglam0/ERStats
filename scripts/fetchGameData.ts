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
  const envPath = resolve(ROOT, ".env");
  if (!existsSync(envPath)) throw new Error(".env 파일이 없습니다.");
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
    if (res.status === 429) {
      const wait = 2000 * (attempt + 1);
      console.log(`    (429 rate limit — ${wait}ms 대기 후 재시도)`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`API ${path} → HTTP ${res.status}`);
    await sleep(REQUEST_DELAY);
    return res.json();
  }
  throw new Error(`API ${path} → 429 반복, 재시도 한계 초과`);
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
] as const;

/** --refresh 가 없고 캐시가 있으면 API 대신 디스크 원본을 쓴다. */
const USE_CACHE = !process.argv.includes("--refresh");

function readCache<T>(path: string): T | null {
  return USE_CACHE && existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
}

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
      const json = await apiGet(key, `/v1/data/${t}`);
      rows = json.data ?? [];
      writeJson(cachePath, rows);
      console.log(`  [meta] ${t}: ${rows.length} rows`);
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
  HighAngleFire: "투척",
  DirectFire: "투척",
  Throw: "암기",
  Shuriken: "암기",
  Bow: "활",
  Crossbow: "석궁",
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

  writeJson(resolve(GAME_DIR, "characters.json"), characters);
  writeJson(resolve(GAME_DIR, "items.json"), items);
  writeJson(resolve(GAME_DIR, "meta.json"), {
    fetchedAt: new Date().toISOString(),
    dataHash: hash.data ?? null,
    counts: { characters: characters.length, items: items.length },
  });

  console.log(
    `\n완료: 캐릭터 ${characters.length}명, 완성 아이템 ${items.length}개 → data/game/`,
  );
  console.log(
    "※ 스킬 데미지 계수는 공식 API에 없음 → data/skills/ 큐레이션 오버레이로 별도 관리 필요.",
  );
}

main().catch((e) => {
  console.error("수집 실패:", e.message);
  process.exit(1);
});
