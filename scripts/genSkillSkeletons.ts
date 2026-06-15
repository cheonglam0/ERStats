/**
 * 스킬 계수 JSON "골자" 생성기.
 *   실행: npm run gen:skills
 *
 * 나무위키를 읽지 않고도, dak.gg 스킬 메타(슬롯·스킬명·maxLevel)로 캐릭터별
 * data/skills/{영문id}.json 골격을 만든다. 계수(baseDamage/apRatio/skillAmpRatio/cooldown)는
 * 비워두고 filled=false 로 표시 → 이후 수동 큐레이션으로 채운다.
 *
 * 이미 filled=true 인 파일(직접 입력 완료)은 절대 덮어쓰지 않는다.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = resolve(ROOT, "data/skills");
const DAK_SKILLS = resolve(ROOT, "data/raw/dakgg-skills.json");

interface DakSkill {
  id: number;
  name: string;
  characterId: number;
  maxLevel: number;
  slot: string;
}
interface NormCharacter {
  code: number;
  id: string;
  name: string;
}

const zeros = (n: number): number[] => Array.from({ length: Math.max(1, n) }, () => 0);

function main(): void {
  const characters = JSON.parse(
    readFileSync(resolve(ROOT, "data/game/characters.json"), "utf8"),
  ) as NormCharacter[];

  if (!existsSync(DAK_SKILLS)) {
    console.error(
      "data/raw/dakgg-skills.json 이 없습니다. 먼저 받아주세요:\n" +
        '  curl "https://er.dakgg.io/api/v1/data/skills?hl=ko" -o data/raw/dakgg-skills.json',
    );
    process.exit(1);
  }
  const dak = JSON.parse(readFileSync(DAK_SKILLS, "utf8")).skills as DakSkill[];
  const byChar = new Map<number, DakSkill[]>();
  for (const s of dak) {
    const list = byChar.get(s.characterId) ?? [];
    list.push(s);
    byChar.set(s.characterId, list);
  }

  const SLOT_ORDER = ["T", "P", "Q", "W", "E", "R", "D"];
  mkdirSync(SKILLS_DIR, { recursive: true });

  let created = 0,
    skipped = 0,
    noSkills = 0;

  for (const c of characters) {
    const outPath = resolve(SKILLS_DIR, `${c.id}.json`);

    // 직접 입력 완료된 파일은 건드리지 않음
    if (existsSync(outPath)) {
      const prev = JSON.parse(readFileSync(outPath, "utf8"));
      if (prev.filled === true) {
        skipped++;
        continue;
      }
    }

    const dakSkills = (byChar.get(c.code) ?? []).slice().sort(
      (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
    );
    if (dakSkills.length === 0) noSkills++;

    const skills = dakSkills.map((s) => ({
      slot: s.slot,
      name: s.name,
      damageType: "physical", // TODO: 검증 필요(물리/마법/고정)
      baseDamage: zeros(s.maxLevel),
      apRatio: 0,
      skillAmpRatio: 0,
      cooldown: zeros(s.maxLevel),
      excludeFromDps: s.slot === "T", // 패시브/특성은 기본 제외
      note: "TODO: 나무위키 계수 입력 필요",
      _dakId: s.id,
      _maxLevel: s.maxLevel,
    }));

    const overlay = {
      characterId: c.id,
      characterName: c.name,
      source: "골자(dak.gg 슬롯/이름) — 계수 미입력",
      filled: false,
      skills,
    };
    writeFileSync(outPath, JSON.stringify(overlay, null, 2) + "\n", "utf8");
    created++;
  }

  console.log(
    `골자 생성: ${created}개 작성, ${skipped}개 보존(filled), 스킬없음 ${noSkills}개 / 총 캐릭 ${characters.length}`,
  );
}

main();
