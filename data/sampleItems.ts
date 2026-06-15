/**
 * 샘플 아이템 풀 (UI 시연용).
 * ⚠️ 모든 수치는 임시 샘플값. 공식 데이터 연동 후 실제 아이템으로 교체. // SAMPLE
 */

import type { StatBlock, StatLine } from "../src/types.js";

export interface ItemDef {
  id: string;
  name: string;
  /** 장착 슬롯 (무기/방어구/장신구 등). UI 그룹핑용. */
  slot: "무기" | "머리" | "가슴" | "팔" | "다리" | "장신구";
  /** 주 라인 (UI 색상/필터용) */
  line: StatLine;
  stats: StatBlock;
}

export const sampleItems: ItemDef[] = [
  // --- 공격 (무기/장신구) ---
  { id: "atk-1", name: "예리한 단검", slot: "무기", line: "offense", stats: { attackPower: 60 } }, // SAMPLE
  { id: "atk-2", name: "강철 장검", slot: "무기", line: "offense", stats: { attackPower: 95, critChance: 0.1 } },
  { id: "as-1", name: "신속의 장갑", slot: "팔", line: "offense", stats: { attackSpeed: 0.5 } },
  { id: "crit-1", name: "정밀 조준경", slot: "장신구", line: "offense", stats: { critChance: 0.3, critDamage: 0.2 } },
  { id: "pen-1", name: "관통 탄띠", slot: "장신구", line: "offense", stats: { armorPenPct: 0.35 } },
  // --- 스킬 ---
  { id: "amp-1", name: "마력의 보주", slot: "무기", line: "offense", stats: { skillAmp: 60 } }, // SAMPLE
  { id: "amp-2", name: "현자의 지팡이", slot: "무기", line: "offense", stats: { skillAmp: 90, cooldownReduction: 0.1 } },
  { id: "cdr-1", name: "주문 가속기", slot: "장신구", line: "offense", stats: { cooldownReduction: 0.2 } },
  // --- 생존 ---
  { id: "hp-1", name: "튼튼한 갑옷", slot: "가슴", line: "survival", stats: { maxHp: 350, defense: 20 } }, // SAMPLE
  { id: "def-1", name: "기사의 방패", slot: "팔", line: "survival", stats: { defense: 60 } },
  { id: "ls-1", name: "흡혈의 표식", slot: "장신구", line: "survival", stats: { lifesteal: 0.15, attackPower: 25 } },
  { id: "hp-2", name: "생명의 투구", slot: "머리", line: "survival", stats: { maxHp: 500, hpRegen: 5 } },
];
