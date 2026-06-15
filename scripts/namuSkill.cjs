/**
 * 나무위키 캐릭터 페이지 fetch(+소프트 리다이렉트 추적) 후 스킬 계수 문장 추출.
 *   사용: node scripts/namuSkill.cjs "아디나"
 * "{이름}(이터널 리턴)" → 리다이렉트 시 추적 → 없으면 "{이름}" 시도.
 * HTML은 _namu.html 로 저장(디버깅용).
 */
const fs = require("fs");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function getPage(title) {
  const url = "https://namu.wiki/w/" + encodeURIComponent(title);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  let html = await res.text();
  const m = html.match(/Redirecting to (\/w\/[^\s."<]+)/);
  if (m) {
    const res2 = await fetch("https://namu.wiki" + m[1], { headers: { "User-Agent": UA } });
    html = await res2.text();
  }
  return html;
}

function extract(html) {
  const text = html
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

  const baseIdx = text.indexOf("성장치");
  if (baseIdx > -1) console.log("[기본스탯] " + text.slice(baseIdx - 30, baseIdx + 210).trim());

  for (const needle of ["피해량", "쿨다운", "재사용 대기시간"]) {
    console.log("\n===== " + needle + " =====");
    let i = -1,
      cnt = 0;
    while ((i = text.indexOf(needle, i + 1)) !== -1 && cnt < 14) {
      const seg = text.slice(i - 16, i + 92).trim();
      if (/\d/.test(seg)) {
        console.log("  • " + seg);
        cnt++;
      }
    }
  }
}

(async () => {
  const title = process.argv[2];
  if (!title) throw new Error("캐릭터 한글 이름을 인자로 주세요.");
  const html = await getPage(title + "(이터널 리턴)");
  fs.writeFileSync("_namu.html", html, "utf8");
  console.log(`# ${title} (len ${html.length})`);
  extract(html);
})();
