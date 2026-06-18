/**
 * 빌드 상태 직렬화(URL 공유) + 저장(localStorage).
 *
 * - 슬롯형 로드아웃(무기/머리/가슴/팔/다리 1칸씩)을 코드 목록으로 압축해 URL 해시·저장소에 담는다.
 * - 슬롯은 아이템 코드로부터 역산(gameData.slot)하므로 직렬화 형식에는 담지 않는다.
 */

/** URL/저장소에 담는 빌드 상태(압축 키). */
export interface BuildState {
  c: string; // characterId
  w: string; // weaponType
  l: number; // level
  m: number; // masteryLevel
  lens: string; // metric
  v: string; // view
  td: number; // 대상 방어력 (DPS 계산 기준)
  eq: string[]; // 장착 아이템 코드들(슬롯은 코드에서 역산)
}

/** localStorage 에 저장하는 '내 빌드' 한 건. */
export interface SavedBuild {
  id: string;
  name: string;
  c: string;
  w: string;
  l: number;
  m: number;
  eq: string[];
  savedAt: number;
}

const STORAGE_KEY = "er-saved-builds";

// ---------------------------------------------------------------------------
// URL 해시 직렬화
// ---------------------------------------------------------------------------

/** 상태 → URL 해시 문자열(앞의 # 제외). */
export function encodeHash(s: BuildState): string {
  const p = new URLSearchParams();
  p.set("c", s.c);
  p.set("w", s.w);
  p.set("l", String(s.l));
  p.set("m", String(s.m));
  p.set("lens", s.lens);
  p.set("v", s.v);
  if (s.td) p.set("td", String(s.td));
  if (s.eq.length) p.set("eq", s.eq.join(","));
  return p.toString();
}

/** URL 해시 문자열 → 부분 상태(없는 값은 생략). */
export function decodeHash(hash: string): Partial<BuildState> {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return {};
  const p = new URLSearchParams(raw);
  const out: Partial<BuildState> = {};
  if (p.has("c")) out.c = p.get("c")!;
  if (p.has("w")) out.w = p.get("w")!;
  if (p.has("l")) out.l = Number(p.get("l"));
  if (p.has("m")) out.m = Number(p.get("m"));
  if (p.has("lens")) out.lens = p.get("lens")!;
  if (p.has("v")) out.v = p.get("v")!;
  if (p.has("td")) out.td = Number(p.get("td"));
  const eq = p.get("eq");
  if (eq) out.eq = eq.split(",").filter(Boolean);
  return out;
}

// ---------------------------------------------------------------------------
// 저장된 빌드(localStorage)
// ---------------------------------------------------------------------------

export function loadSavedBuilds(): SavedBuild[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SavedBuild[]) : [];
  } catch {
    return [];
  }
}

function writeSavedBuilds(builds: SavedBuild[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(builds));
  } catch {
    /* 용량 초과 등은 조용히 무시 */
  }
}

/** 새 빌드를 저장하고 갱신된 목록을 반환. (최신순) */
export function addSavedBuild(b: Omit<SavedBuild, "id" | "savedAt">): SavedBuild[] {
  const builds = loadSavedBuilds();
  const entry: SavedBuild = {
    ...b,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    savedAt: Date.now(),
  };
  const next = [entry, ...builds];
  writeSavedBuilds(next);
  return next;
}

/** 저장 빌드 삭제 후 갱신 목록 반환. */
export function removeSavedBuild(id: string): SavedBuild[] {
  const next = loadSavedBuilds().filter((b) => b.id !== id);
  writeSavedBuilds(next);
  return next;
}
