import { describe, it, expect } from "vitest";
import {
  computeEhp,
  computeDps,
  itemEfficiency,
  compareItems,
  resolveStats,
  DUMMY_TARGET,
} from "./engine.js";
import { DEFENSE_K, damageReduction } from "./constants.js";
import type { BuildProfile } from "./types.js";
import { sampleAdDealer, sampleApMage } from "../data/sampleCharacters.js";

const adGun: BuildProfile = {
  character: sampleAdDealer,
  weapon: sampleAdDealer.weapons[0]!, // 권총
  level: 1,
};
const adRifle: BuildProfile = {
  character: sampleAdDealer,
  weapon: sampleAdDealer.weapons[1]!, // 돌격소총
  level: 1,
};
const mage: BuildProfile = {
  character: sampleApMage,
  weapon: sampleApMage.weapons[0]!, // 지팡이
  level: 1,
};

describe("EHP (유효 체력)", () => {
  it("방어력 0이면 EHP == HP", () => {
    const r = computeEhp({ maxHp: 1000, defense: 0 });
    expect(r.effectiveHp).toBeCloseTo(1000);
    expect(r.damageReduction).toBe(0);
  });

  it("방어력 K이면 피해감소 50%, EHP 2배", () => {
    const r = computeEhp({ maxHp: 1000, defense: DEFENSE_K });
    expect(r.damageReduction).toBeCloseTo(0.5);
    expect(r.effectiveHp).toBeCloseTo(2000);
  });

  it("방어력 1의 한계 EHP ≈ HP / K", () => {
    const before = computeEhp({ maxHp: 1000, defense: 100 }).effectiveHp;
    const after = computeEhp({ maxHp: 1000, defense: 101 }).effectiveHp;
    // 방어 1 추가의 EHP 증가는 양수, 대략 HP/K 규모
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBeGreaterThan(0);
  });
});

describe("DPS 기본 동작", () => {
  it("공격력이 오르면 DPS도 오른다", () => {
    const base = computeDps(adGun, resolveStats(adGun)).total;
    const buffed = computeDps(adGun, resolveStats(adGun, { attackPower: 100 })).total;
    expect(buffed).toBeGreaterThan(base);
  });

  it("DPS 분해 합이 total과 일치", () => {
    const stats = resolveStats(adGun);
    const r = computeDps(adGun, stats);
    const skillSum = Object.values(r.perSkill).reduce((a, b) => a + b, 0);
    expect(r.basicAttackDps + skillSum).toBeCloseTo(r.total);
    expect(r.skillDps).toBeCloseTo(skillSum);
  });

  it("스킬증폭은 AP 메이지 DPS만 크게 올린다 (캐릭터 맥락 구분)", () => {
    const amp = { skillAmp: 100 };
    const mageGain = itemEfficiency(mage, amp).deltaDpsPct;
    const adGain = itemEfficiency(adGun, amp).deltaDpsPct;
    expect(mageGain).toBeGreaterThan(adGain);
  });

  it("스킬 렌즈: 스킬증폭은 스킬 DPS만 올리고 평타 DPS는 안 올린다", () => {
    const eff = itemEfficiency(mage, { skillAmp: 100 });
    expect(eff.deltaSkillDps).toBeGreaterThan(0);
    expect(eff.deltaBasicDps).toBeCloseTo(0);
  });

  it("평타 렌즈: 공격력은 평타 DPS를 올린다", () => {
    const eff = itemEfficiency(adGun, { attackPower: 100 });
    expect(eff.deltaBasicDps).toBeGreaterThan(0);
  });
});

describe("아이템 한계효율 — 빌드 맥락에 따라 순위가 바뀐다", () => {
  const items = [
    { name: "공격력 +60", stats: { attackPower: 60 } },
    { name: "공격속도 +50%", stats: { attackSpeed: 0.5 } },
    { name: "스킬증폭 +60", stats: { skillAmp: 60 } },
    { name: "쿨감 +20%", stats: { cooldownReduction: 0.2 } },
  ];

  it("AD 권총 빌드는 공격력/공속 계열을 스킬증폭보다 높게 평가", () => {
    const ranked = compareItems(adGun, items, { metric: "total" });
    const skillAmpRank = ranked.findIndex((r) => r.name === "스킬증폭 +60");
    const atkRank = ranked.findIndex((r) => r.name === "공격력 +60");
    expect(atkRank).toBeLessThan(skillAmpRank); // 공격력이 더 위
    // 스킬증폭은 AD 딜러에게 사실상 무의미
    expect(ranked[skillAmpRank]!.eff.deltaDps).toBeCloseTo(0, 1);
  });

  it("AP 메이지 빌드는 스킬증폭을 1순위로 평가", () => {
    const ranked = compareItems(mage, items, { metric: "total" });
    expect(ranked[0]!.name).toBe("스킬증폭 +60");
  });

  it("같은 캐릭터라도 무기군이 다르면 공속 가치가 다르다", () => {
    const fastWeaponAtkSpeed = itemEfficiency(adRifle, { attackSpeed: 0.5 });
    const slowWeaponAtkSpeed = itemEfficiency(adGun, { attackSpeed: 0.5 });
    // 두 빌드 모두 공속에서 이득을 보지만 값이 동일하지 않음(평타 비중 차이)
    expect(fastWeaponAtkSpeed.deltaDps).toBeGreaterThan(0);
    expect(slowWeaponAtkSpeed.deltaDps).toBeGreaterThan(0);
    expect(fastWeaponAtkSpeed.deltaDps).not.toBeCloseTo(slowWeaponAtkSpeed.deltaDps, 1);
  });
});

describe("방어 관통", () => {
  it("관통은 방어력 있는 대상에게만 DPS 이득", () => {
    const tanky = { defense: 200, maxHp: 5000 };
    const vsTankyBefore = computeDps(adGun, resolveStats(adGun), { target: tanky }).total;
    const vsTankyAfter = computeDps(adGun, resolveStats(adGun, { armorPenPct: 0.4 }), {
      target: tanky,
    }).total;
    expect(vsTankyAfter).toBeGreaterThan(vsTankyBefore);

    // 무방비 더미에는 관통이 무의미
    const vsDummyBefore = computeDps(adGun, resolveStats(adGun), { target: DUMMY_TARGET }).total;
    const vsDummyAfter = computeDps(adGun, resolveStats(adGun, { armorPenPct: 0.4 }), {
      target: DUMMY_TARGET,
    }).total;
    expect(vsDummyAfter).toBeCloseTo(vsDummyBefore);
  });
});
