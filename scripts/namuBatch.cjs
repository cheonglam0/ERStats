/**
 * 여러 캐릭터 나무위키 스킬 계수를 한 번에 추출 (큐레이션 배치용).
 *   사용: node scripts/namuBatch.cjs Camilo Cathy Celine ...
 * 영문 id → data/skills/{id}.json 의 characterName 으로 나무위키 검색.
 */
const fs = require("fs");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function getPage(title) {
  const res = await fetch("https://namu.wiki/w/" + encodeURIComponent(title), {
    headers: { "User-Agent": UA },
  });
  let html = await res.text();
  const m = html.match(/Redirecting to (\/w\/[^\s."<]+)/);
  if (m) html = await (await fetch("https://namu.wiki" + m[1], { headers: { "User-Agent": UA } })).text();
  return html;
}

function extract(html) {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#91;/g, "[").replace(/&#93;/g, "]")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<")
    .replace(/\s+/g, " ");
  // "[숫자 / ...]" 또는 "(+...의 N%)" 또는 "쿨다운 [...]" 포함 구간만, 중복 제거
  const seen = new Set();
  const out = [];
  let i = -1;
  while ((i = text.indexOf("피해량", i + 1)) !== -1) {
    const seg = text.slice(i - 4, i + 78).trim();
    if (/\[\s*\d/.test(seg) && /\+\s*(공격력|스킬 ?증폭|추가 공격력)/.test(seg)) {
      const key = seg.slice(0, 50);
      if (!seen.has(key)) { seen.add(key); out.push("  " + seg); }
    }
    if (out.length >= 9) break;
  }
  // 쿨다운 배열 별도 수집
  let c = -1, cc = 0;
  while ((c = text.indexOf("쿨다운 [", c + 1)) !== -1 && cc < 7) {
    out.push("  CD " + text.slice(c, c + 40).trim());
    cc++;
  }
  return out;
}

(async () => {
  for (const id of process.argv.slice(2)) {
    const sk = JSON.parse(fs.readFileSync(`data/skills/${id}.json`, "utf8"));
    console.log("\n############ " + id + " (" + sk.characterName + ") ############");
    console.log("슬롯: " + sk.skills.map((s) => s.slot + ":" + s.name + "(maxLv" + s._maxLevel + ")").join("  "));
    try {
      const html = await getPage(sk.characterName + "(이터널 리턴)");
      extract(html).forEach((l) => console.log(l));
    } catch (e) {
      console.log("  [fetch 실패: " + e.message + "]");
    }
  }
})();
