/**
 * 부가 게임 데이터(특성/야생동물/지역/제작 트리) 어댑터.
 * data/game/{traits,monsters,areas,crafting}.json → UI 도감 뷰용 타입.
 */

import traitsJson from "../data/game/traits.json";
import monstersJson from "../data/game/monsters.json";
import areasJson from "../data/game/areas.json";
import craftingJson from "../data/game/crafting.json";
import tacticalJson from "../data/game/tactical.json";
import metaTierJson from "../data/game/metaTier.json";

export interface Trait {
  code: number;
  name: string;
  group: string;
  type: string;
  desc: string;
}

export interface Monster {
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

export interface Area {
  code: number;
  name: string;
  areaType: string;
  startingArea: boolean;
}

export interface Recipe {
  code: number;
  name: string;
  grade: string;
  kind: string; // Weapon/Armor/Special/Consumable/Misc
  slot?: string;
  weaponType?: string;
  m1: number;
  m2: number;
  iconUrl?: string;
}

export interface Tactical {
  code: number;
  name: string;
  desc: string;
  iconUrl?: string;
}

export interface MetaBuild {
  weapon: string;
  tier: string;
  tierScore: number;
  games: number;
  pickRate: number;
  winRate: number;
  top3Rate: number;
}
export interface MetaRow {
  name: string;
  games: number;
  pickRate: number;
  winRate: number;
  top3Rate: number;
  tier: string;
  builds: MetaBuild[];
}
export interface MetaTier {
  patch: number;
  tier: string;
  updatedAt: number;
  totalGames: number;
  rows: MetaRow[];
}

export const traits = traitsJson as Trait[];
export const monsters = monstersJson as Monster[];
export const areas = areasJson as Area[];
export const recipes = craftingJson as Recipe[];
export const tactical = tacticalJson as Tactical[];
export const metaTier = metaTierJson as MetaTier;

/** 티어 등급 표시 순서(높은 순). */
export const TIER_ORDER = ["S", "A", "B", "C", "D", "F", "-"];

/** 특성 그룹(traitGroup) 영문 → 한글 라벨. (그룹 키스톤 7N00000 이름 기준) */
export const TRAIT_GROUP_KO: Record<string, string> = {
  Havoc: "파괴",
  Fortification: "저항",
  Support: "지원",
  Cobalt: "혼돈",
};

export const traitGroupLabel = (g: string): string => TRAIT_GROUP_KO[g] ?? g;

const recipeByCode = new Map<number, Recipe>(recipes.map((r) => [r.code, r]));

export const recipeOf = (code: number): Recipe | undefined => recipeByCode.get(code);

/** 제작 트리 노드(재귀). 재료 코드가 사전에 없으면 leaf(이름만). */
export interface CraftNode {
  code: number;
  name: string;
  grade: string;
  iconUrl?: string;
  children: CraftNode[];
}

/** 완성 아이템 코드 → 제작 트리. (순환 방지 가드 포함) */
export function buildCraftTree(code: number, seen = new Set<number>()): CraftNode | undefined {
  const r = recipeByCode.get(code);
  if (!r) return undefined;
  if (seen.has(code)) return { code, name: r.name, grade: r.grade, iconUrl: r.iconUrl, children: [] };
  seen.add(code);
  const children: CraftNode[] = [];
  for (const mc of [r.m1, r.m2]) {
    if (!mc) continue;
    const child = buildCraftTree(mc, seen);
    if (child) children.push(child);
  }
  return { code, name: r.name, grade: r.grade, iconUrl: r.iconUrl, children };
}

/** 제작 트리의 잎(기본 재료) 목록을 집계 — "이 아이템을 만들려면 결국 무엇이 필요한가". */
export function leafMaterials(code: number): { name: string; iconUrl?: string; count: number }[] {
  const counts = new Map<string, { name: string; iconUrl?: string; count: number }>();
  const walk = (c: number, seen: Set<number>) => {
    const r = recipeByCode.get(c);
    if (!r) return;
    if (!r.m1 && !r.m2) {
      const cur = counts.get(r.name) ?? { name: r.name, iconUrl: r.iconUrl, count: 0 };
      cur.count += 1;
      counts.set(r.name, cur);
      return;
    }
    if (seen.has(c)) return;
    seen.add(c);
    for (const mc of [r.m1, r.m2]) if (mc) walk(mc, seen);
  };
  walk(code, new Set());
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

/** 도감 제작 탭에서 고를 만한 '완성(상위) 아이템'들 — 무기/방어구 중 영웅 이상. */
export const craftableTargets: Recipe[] = recipes
  .filter(
    (r) =>
      (r.kind === "Weapon" || r.kind === "Armor") &&
      (r.m1 !== 0 || r.m2 !== 0) &&
      ["Epic", "Legend", "Mythic"].includes(r.grade),
  )
  .sort((a, b) => a.name.localeCompare(b.name, "ko"));
