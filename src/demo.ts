/**
 * 데모: 같은 아이템 후보를 서로 다른 빌드에 넣었을 때
 *       "이 캐릭터에겐 무엇이 더 좋은가"가 어떻게 갈리는지 출력.
 *   실행: npm run demo
 */

import { compareItems } from "./engine.js";
import type { BuildProfile } from "./types.js";
import { sampleAdDealer, sampleApMage } from "../data/sampleCharacters.js";

const builds: { label: string; profile: BuildProfile }[] = [
  { label: "AD 딜러 · 권총", profile: { character: sampleAdDealer, weapon: sampleAdDealer.weapons[0]!, level: 9 } },
  { label: "AD 딜러 · 돌격소총", profile: { character: sampleAdDealer, weapon: sampleAdDealer.weapons[1]!, level: 9 } },
  { label: "AP 메이지 · 지팡이", profile: { character: sampleApMage, weapon: sampleApMage.weapons[0]!, level: 9 } },
];

const items = [
  { name: "공격력 +60", stats: { attackPower: 60 } },
  { name: "공격속도 +50%", stats: { attackSpeed: 0.5 } },
  { name: "스킬증폭 +60", stats: { skillAmp: 60 } },
  { name: "쿨감 +20%", stats: { cooldownReduction: 0.2 } },
  { name: "치명타확률 +40%", stats: { critChance: 0.4 } },
];

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

for (const { label, profile } of builds) {
  console.log(`\n=== ${label} (Lv.${profile.level}) — DPS 한계효율 순위 ===`);
  const ranked = compareItems(profile, items, { metric: "total" });
  ranked.forEach((r, i) => {
    console.log(
      `  ${i + 1}. ${r.name.padEnd(14)} ΔDPS +${pct(r.eff.deltaDpsPct).padStart(6)}  (절대 +${r.eff.deltaDps.toFixed(1)})`,
    );
  });
}

console.log("\n※ 수치는 샘플 데이터 기준. 공식 데이터 연동 후 실값으로 교체 예정.");
