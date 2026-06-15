/**
 * 나무위키 캐릭터 페이지(_namu.html)에서 스킬 계수 관련 문장만 추출.
 *   사용: node scripts/namuExtract.cjs [html경로(기본 _namu.html)]
 * 큐레이션 시 계수(피해량/쿨다운/공격력·스킬증폭 비율)를 빠르게 읽기 위한 보조 도구.
 */
const fs = require("fs");
const path = process.argv[2] || "_namu.html";
const h = fs.readFileSync(path, "utf8");
const text = h
  .replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&#91;/g, "[")
  .replace(/&#93;/g, "]")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&gt;/g, ">")
  .replace(/&lt;/g, "<")
  .replace(/\s+/g, " ");

// 기본 스탯(레벨1/성장) 한 줄
const baseIdx = text.indexOf("성장치");
if (baseIdx > -1) console.log("[기본스탯] " + text.slice(baseIdx - 40, baseIdx + 220).trim());

for (const needle of ["피해량", "쿨다운", "재사용 대기시간"]) {
  console.log("\n===== " + needle + " =====");
  let i = -1,
    cnt = 0;
  while ((i = text.indexOf(needle, i + 1)) !== -1 && cnt < 14) {
    const seg = text.slice(i - 16, i + 90).trim();
    // 숫자가 포함된 의미있는 줄만
    if (/\d/.test(seg)) {
      console.log("  • " + seg);
      cnt++;
    }
  }
}
