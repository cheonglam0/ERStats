/**
 * 패치노트 수집 스크립트 (Steam 목록 + ER 공식 한글 본문 하이브리드).
 *   실행: npm run fetch:patch
 *
 * 왜 하이브리드인가:
 *   - "어떤 패치/핫픽스가 언제 나왔나"(목록·정확한 날짜·버전)는 Steam 공지가 1차 공식 소스라
 *     즉시·안정적으로 제공한다(API 키 불필요).
 *   - 반면 사람이 읽을 **한글 본문**은 ER 공식 사이트(playeternalreturn.com)에만 있다.
 *     ER 글에는 절대 날짜가 없어(상대시간 "6일 전"뿐) 날짜는 Steam 것을 쓴다.
 *   → Steam에서 날짜·버전·목록을 잡고, 같은 버전의 ER 한글 글 본문으로 내용을 교체한다.
 *
 * 동작:
 *   1) Steam 뉴스 API(appid 1049590)에서 patch notes / hotfix 공지를 최신순 KEEP개 추린다.
 *   2) 각 항목에서 버전 토큰(11.4 / 11.4a …)을 뽑는다.
 *   3) ER 공식 글을 ID 순차 스캔(category="패치노트")해 버전 토큰별 한글 본문을 모은다.
 *      - 스캔 범위는 Steam이 알려준 ER 정규 패치노트 ID(앵커) 주변으로 좁힌다.
 *      - 이전 실행에서 이미 한글로 채운 항목은 캐시(기존 JSON)에서 재사용해 재스캔을 피한다.
 *   4) 버전이 일치하면 본문을 ER 한글로, 링크를 ER ko-KR로 교체한다.
 *      못 찾으면 Steam 영어 본문을 그대로 둔다(폴백).
 *   5) data/game/patchNotesSteam.json 으로 저장(최신순).
 *
 * 안전장치: 수집 0건이면(API 장애 등) 기존 파일을 덮어쓰지 않고 유지한다.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "data/game/patchNotesSteam.json");

/** Eternal Return 의 Steam appid. */
const APP_ID = 1049590;
/** 가져올 공지 개수. 대형 패치노트는 세일·이벤트 공지에 밀려 뒤쪽에 있어 넉넉히 받는다. */
const FETCH_COUNT = 100;
/** 화면에 보관할 패치노트 최대 개수(최신순). */
const KEEP = 15;
/** 패치노트 1건당 최대 줄 수(대형 시즌 패치는 길어서 잘라내고 링크로 유도). */
const MAX_LINES = 45;

/** ER 공식 글 주소 베이스. {id} 글은 ?hl=ko-KR 로 한국어 본문이 서버 렌더링된다. */
const ER_BASE = "https://playeternalreturn.com/posts/news";
/** 패치노트·핫픽스가 모두 묶이는 ER 카테고리명. */
const ER_CATEGORY = "패치노트";
/** 앵커(정규 패치노트 ID) 위로 스캔할 ID 수 — 해당 패치의 핫픽스들이 여기에 있다. */
const SCAN_FWD = 25;
/**
 * 앵커 아래로 스캔할 ID 수. 가장 오래된 핫픽스는 그 패치가 kept 목록에서 빠져
 * 앵커가 없을 수 있어(정규 패치 간격 ≈ 33), 한 사이클만큼 여유 있게 내려간다.
 * 초기 백필 때만 넓게 돌고, 이후엔 캐시(커밋된 JSON) 덕에 증분 스캔만 한다.
 */
const SCAN_BACK = 34;
/** 한 실행에서 ER 글을 받을 최대 횟수(스크래핑 폭주 방지 안전상한). */
const MAX_SCAN = 120;
/** ER 글 동시 요청 수(과도한 부하 방지). */
const CONCURRENCY = 6;

interface SteamNewsItem {
  gid: string;
  title: string;
  url: string;
  contents: string;
  date: number; // unix seconds
  tags?: string[];
}

export interface SteamPatchNote {
  version: string; // 표시 제목 (ER 매칭 시 한글 제목, 아니면 Steam 제목)
  date: string; // YYYY-MM-DD (Steam 기준)
  changes: string[]; // 정리된 본문 줄 (ER 한글 우선, 폴백 시 Steam 영어)
  source: "steam";
  url: string; // 본문 출처 링크 (ER 매칭 시 ER ko-KR, 아니면 Steam 공지)
  gid: string; // Steam 고유 id (안정 정렬/중복 방지/캐시 키)
  lang: "ko" | "en"; // 본문 언어 — ko면 ER 공식 한글로 채워진 것(캐시 재사용 판단)
}

/** 매 패치 동일하게 반복되는 정형 안내문 — 노이즈라 제거한다(Steam 영어 폴백용). */
const BOILERPLATE = [
  /some changes may not be applied/i,
  /time of application might differ/i,
  /you will need to update before reconnecting/i,
  /please restart the game to download/i,
  /reconnection delays or lead to penalties/i,
];

/** ER 한글 본문에서 매번 반복되는 정형 안내문 — 노이즈라 제거한다. */
const KO_BOILERPLATE = [
  /^※/,
  /적용되지 않을 수 있습니다/,
  /재접속 지연 및 탈주/,
  /클라이언트 업데이트가 필요/,
];

/** 헤더 줄 마커(렌더 시 굵게 처리). 본문에 안 나오는 토큰을 쓴다. */
const HEAD = "##H##";

/**
 * 제목에서 버전 토큰을 뽑는다. Steam("11.4b Hotfix")과 ER("11.4b 핫픽스",
 * "2026.06.11 - 11.4 패치노트")을 같은 키로 맞추기 위함.
 * ER 정규 패치노트의 앞붙은 날짜("YYYY.M.D - ")는 먼저 떼어내 오인을 막는다.
 */
function versionToken(title: string): string | null {
  const t = title
    .replace(/\[[^\]]*\]/g, " ") // "[수정]" 같은 머리표 제거
    .replace(/\d{4}\.\d{1,2}\.\d{1,2}/g, " "); // "YYYY.MM.DD" 날짜를 버전으로 오인하지 않게 제거
  const m = t.match(/(\d{1,2}\.\d+[a-z]?)/i);
  return m ? m[1].toLowerCase() : null;
}

/** Steam 공지 URL 중 ER 정규 패치노트 글의 ID를 뽑는다(스캔 앵커용). */
function erIdFromUrl(url: string): number | null {
  const m = url.match(/playeternalreturn\.com\/posts\/news\/(\d+)/i);
  return m ? Number(m[1]) : null;
}

/**
 * 대형 패치노트는 Steam 본문이 배너+링크뿐이고, 실제 내용은 ER 공식 사이트에 있다.
 * 본문 첫 [url] 을 뽑아 그쪽을 링크로 쓴다. 없으면(핫픽스 등) Steam 공지 URL 로 폴백.
 * 공식 사이트 글은 ?hl=ko-KR 로 한국어 버전이 존재 → 영어 번역 없이 공식 한글로 연결한다.
 */
function extractPrimaryUrl(raw: string, fallback: string): string {
  const m = raw.match(/\[url="?([^"\]]+)"?\]/i);
  const url = m?.[1]?.trim() || fallback;
  if (/playeternalreturn\.com\//i.test(url) && !/hl=/.test(url))
    return url + (url.includes("?") ? "&" : "?") + "hl=ko-KR";
  return url;
}

/** Steam bbcode 본문 → 읽기 쉬운 줄 배열(영어 폴백). 헤더는 HEAD 접두, 목록은 "• ". */
function bbcodeToLines(raw: string): string[] {
  let s = raw;
  // 이스케이프된 대괄호(\[Fixes])를 sentinel 로 보호 — 안 그러면 태그 제거 정규식이 통째로 지운다.
  s = s.replace(/\\\[/g, "##LB##").replace(/\\\]/g, "##RB##");
  s = s.replace(/\[img\][\s\S]*?\[\/img\]/gi, "");
  s = s.replace(/\[previewyoutube[^\]]*\][\s\S]*?\[\/previewyoutube\]/gi, "");
  s = s.replace(/\[\/?(table|tr|td|th)[^\]]*\]/gi, "\n");
  s = s.replace(/\[\/?h[1-3]\]/gi, "\n" + HEAD);
  s = s.replace(/\[\/\*\]/gi, "");
  s = s.replace(/\[\*\]/gi, "\n• ");
  s = s.replace(/\[\/?(list|olist)[^\]]*\]/gi, "\n");
  s = s.replace(/\[\/?p\]/gi, "\n");
  s = s.replace(/\[url=[^\]]*\]/gi, "").replace(/\[\/url\]/gi, "");
  s = s.replace(/\[\/?(b|i|u|strike|quote|spoiler|code)\]/gi, "");
  s = s.replace(/\[\/?[a-z][^\]]*\]/gi, "");
  s = s.replace(/##LB##/g, "[").replace(/##RB##/g, "]");
  s = decodeEntities(s);

  const lines: string[] = [];
  for (const rawLine of s.split("\n")) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line || line === "•" || line === HEAD) continue;
    if (line.startsWith(HEAD) && line.slice(HEAD.length).trim().length === 0) continue;
    if (BOILERPLATE.some((re) => re.test(line.replace(HEAD, "")))) continue;
    lines.push(line);
  }
  return capLines(lines);
}

/** 공통 HTML 엔티티 디코드. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** 너무 길면 잘라내고 링크로 유도. */
function capLines(lines: string[]): string[] {
  if (lines.length > MAX_LINES)
    return [...lines.slice(0, MAX_LINES), "… (전체 내용은 아래 공식 노트 링크 참고)"];
  return lines;
}

interface ErArticle {
  category: string;
  title: string; // " :: 이터널 리턴" 접미 제거된 제목
  lines: string[];
}

/** ER 글 HTML에서 본문(Froala) 영역만 잘라낸다. */
function extractErBody(html: string): string {
  const c = html.indexOf("er-article-content fr-view");
  if (c < 0) return "";
  const start = html.indexOf(">", c) + 1;
  const r = html.indexOf("er-article-detail__recent", start); // 본문 다음의 '최근 글' 섹션
  const end = r > 0 ? html.lastIndexOf("<div", r) : html.length;
  return html.slice(start, end);
}

/** ER Froala HTML 본문 → 읽기 쉬운 줄 배열. 헤더는 HEAD 접두, 목록은 "• ". */
function erBodyToLines(raw: string): string[] {
  let s = raw.replace(/<img[^>]*>/gi, "").replace(/<table[\s\S]*?<\/table>/gi, "");
  s = s.replace(/<(h[1-6])[^>]*>/gi, "\n" + HEAD).replace(/<\/h[1-6]>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "\n• ").replace(/<\/li>/gi, "\n");
  s = s.replace(/<\/(p|div|ul|ol|tr)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);

  const lines: string[] = [];
  for (const rawLine of s.split("\n")) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line || line === "•" || line === HEAD) continue;
    if (line.startsWith(HEAD) && line.slice(HEAD.length).trim().length === 0) continue;
    if (KO_BOILERPLATE.some((re) => re.test(line.replace(HEAD, "")))) continue;
    lines.push(line);
  }
  return capLines(lines);
}

/** ER 글 1건을 한국어로 받아 파싱. 없는 ID(302 등)·다른 카테고리면 그래도 반환(호출부에서 판별). */
async function fetchErArticle(id: number): Promise<ErArticle | null> {
  const res = await fetch(`${ER_BASE}/${id}?hl=ko-KR`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    redirect: "manual", // 없는 글은 302 리다이렉트 → null
  });
  if (res.status !== 200) return null;
  const html = await res.text();
  const cat = html.match(/er-article-detail__category[^>]*>([^<]+)</);
  const title = html.match(/og:title"\s+content="([^"]+)"/);
  if (!cat || !title) return null;
  return {
    category: cat[1].trim(),
    title: title[1]
      .replace(/\s*::\s*이터널 리턴\s*$/, "") // 사이트 접미
      .replace(/^\s*(?:\[[^\]]*\]\s*)+/, "") // "[수정]" 등 운영 머리표
      .trim(),
    lines: erBodyToLines(extractErBody(html)),
  };
}

/** 배열을 size 묶음으로 잘라 동시 요청을 제한한다. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * ER 글을 ID 순차 스캔해 필요한 버전 토큰의 한글 본문을 모은다.
 *   anchors: Steam·캐시가 알려준 ER 정규 패치노트 ID(스캔 범위의 기준점).
 *   needed : 아직 한글로 못 채운 버전 토큰 집합.
 * 범위 [min(anchor)-SCAN_BACK, max(anchor)+SCAN_FWD] 를 위에서부터 받되,
 * 필요한 토큰을 모두 찾으면 조기 종료한다.
 */
async function buildErIndex(
  anchors: number[],
  needed: Set<string>,
): Promise<Map<string, { title: string; lines: string[]; url: string }>> {
  const index = new Map<string, { title: string; lines: string[]; url: string }>();
  if (anchors.length === 0 || needed.size === 0) return index;

  const hi = Math.max(...anchors) + SCAN_FWD;
  const lo = Math.min(...anchors) - SCAN_BACK;
  const ids: number[] = [];
  for (let id = hi; id >= lo && ids.length < MAX_SCAN; id--) ids.push(id);

  console.log(`  ER 글 스캔: #${lo}~#${hi} (최대 ${ids.length}건), 찾을 버전 ${[...needed].join(", ")}`);
  for (const batch of chunk(ids, CONCURRENCY)) {
    const arts = await Promise.all(batch.map((id) => fetchErArticle(id).then((a) => [id, a] as const)));
    for (const [id, art] of arts) {
      if (!art || art.category !== ER_CATEGORY) continue;
      const tok = versionToken(art.title);
      if (!tok || index.has(tok)) continue;
      index.set(tok, { title: art.title, lines: art.lines, url: `${ER_BASE}/${id}?hl=ko-KR` });
    }
    if ([...needed].every((t) => index.has(t))) break; // 필요한 건 다 찾음 → 조기 종료
  }
  console.log(`  ER 한글 본문 확보: ${[...index.keys()].join(", ") || "(없음)"}`);
  return index;
}

/** 기존 JSON을 gid→항목 맵으로 읽는다(캐시). 없거나 깨지면 빈 맵. */
function loadCache(): Map<string, SteamPatchNote> {
  const map = new Map<string, SteamPatchNote>();
  if (!existsSync(OUT)) return map;
  try {
    const arr = JSON.parse(readFileSync(OUT, "utf8")) as SteamPatchNote[];
    for (const n of arr) if (n.gid) map.set(n.gid, n);
  } catch {
    /* 깨진 파일은 캐시 없이 새로 수집 */
  }
  return map;
}

async function main(): Promise<void> {
  const api = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${APP_ID}&count=${FETCH_COUNT}&maxlength=0`;
  console.log("Steam 뉴스 수집 중…");
  const res = await fetch(api);
  if (!res.ok) throw new Error(`Steam 뉴스 API → HTTP ${res.status}`);
  const json = (await res.json()) as { appnews?: { newsitems?: SteamNewsItem[] } };
  const items = json.appnews?.newsitems ?? [];

  // 핫픽스는 patchnotes 태그가 붙지만, 대형 패치노트는 태그가 없다.
  // → 태그 또는 제목(patch notes / hotfix) 으로 둘 다 잡는다.
  const isPatchNote = (i: SteamNewsItem) =>
    (i.tags ?? []).includes("patchnotes") || /patch\s*notes|hotfix/i.test(i.title);

  const base = items
    .filter(isPatchNote)
    .sort((a, b) => b.date - a.date)
    .slice(0, KEEP)
    .map(
      (i): SteamPatchNote => ({
        version: i.title.trim(),
        date: new Date(i.date * 1000).toISOString().slice(0, 10),
        changes: bbcodeToLines(i.contents ?? ""),
        source: "steam",
        url: extractPrimaryUrl(i.contents ?? "", i.url),
        gid: i.gid,
        lang: "en",
      }),
    );

  console.log(`  patchnotes 항목: ${base.length}건`);

  // 안전장치: 0건이면 API 이상으로 보고 기존 파일 보존(빈 데이터 배포 방지).
  if (base.length === 0 && existsSync(OUT)) {
    console.warn("  수집 0건 — 기존 patchNotesSteam.json 유지(덮어쓰지 않음).");
    return;
  }

  // ── ER 공식 한글 본문 enrich ───────────────────────────────────────────
  const cache = loadCache();
  const needed = new Set<string>(); // 아직 한글로 못 채운 버전 토큰
  const anchors = new Set<number>(); // ER 정규 패치노트 ID(스캔 기준점)

  for (const n of base) {
    const tok = versionToken(n.version);
    const cached = cache.get(n.gid);
    if (cached?.lang === "ko") {
      // 지난 실행에서 이미 한글로 채움 → 재스캔 없이 재사용(날짜만 최신 Steam 값 유지).
      n.version = cached.version;
      n.changes = cached.changes;
      n.url = cached.url;
      n.lang = "ko";
      const erId = erIdFromUrl(cached.url);
      if (erId) anchors.add(erId);
    } else if (tok) {
      needed.add(tok);
    }
    // 정규 패치노트는 Steam 본문이 ER 링크를 품고 있어 앵커로 쓴다.
    const erId = erIdFromUrl(n.url);
    if (erId) anchors.add(erId);
  }

  if (needed.size > 0) {
    try {
      const index = await buildErIndex([...anchors], needed);
      for (const n of base) {
        if (n.lang === "ko") continue;
        const tok = versionToken(n.version);
        const hit = tok ? index.get(tok) : undefined;
        if (!hit) continue;
        n.version = hit.title; // ER 한글 제목
        n.changes = hit.lines; // ER 한글 본문
        n.url = hit.url; // ER ko-KR 링크
        n.lang = "ko";
      }
    } catch (e) {
      console.warn(`  ER 한글 수집 건너뜀(영어 폴백 유지): ${(e as Error).message}`);
    }
  }

  const koCount = base.filter((n) => n.lang === "ko").length;
  console.log(`  한글 본문 ${koCount}건 / 영어 폴백 ${base.length - koCount}건`);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(base, null, 2) + "\n", "utf8");
  console.log(`완료: ${base.length}건 → data/game/patchNotesSteam.json`);
  if (base[0]) console.log(`  최신: ${base[0].version} (${base[0].date})`);
}

main().catch((e) => {
  console.error("패치노트 수집 실패:", e.message);
  process.exit(1);
});
