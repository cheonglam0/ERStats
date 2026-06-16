/**
 * 한글 초성 검색 유틸.
 *   "ㅈㅋ" → "재키", "ㄱㅇ" → "가넷"… 처럼 초성만으로도 매칭한다.
 */

const CHOSUNG = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
const CHOSUNG_SET = new Set(CHOSUNG);

/** 문자열의 각 음절을 초성으로 변환(한글 음절이 아니면 그대로 둔다). */
export function chosung(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      out += CHOSUNG[Math.floor((code - 0xac00) / 588)];
    } else {
      out += ch;
    }
  }
  return out;
}

/** 질의가 초성 문자로만 이루어졌는지(초성 검색 모드 판별). */
const isChosungQuery = (q: string): boolean =>
  q.length > 0 && [...q].every((c) => CHOSUNG_SET.has(c));

/**
 * 이름이 질의에 매칭되는지.
 *   - 일반 부분일치(name.includes)
 *   - 질의가 초성만이면 이름의 초성열에 대한 부분일치
 */
export function matchName(name: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (name.includes(q)) return true;
  if (isChosungQuery(q)) return chosung(name).includes(q);
  return false;
}
