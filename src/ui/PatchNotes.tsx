import { PATCH_NOTES, type PatchNote } from "../../data/patchNotes.js";
import steamNotes from "../../data/game/patchNotesSteam.json";

/** Steam 자동 수집분에서 헤더 줄을 표시할 때 쓰는 마커(fetchPatchNotes.ts 와 동일). */
const HEAD = "##H##";

/**
 * 패치/핫픽스 변경점 목록.
 *   - 수동 한글 노트(data/patchNotes.ts) + Steam 자동 수집분(patchNotesSteam.json)을
 *     날짜 내림차순으로 병합해 최신이 위로 오게 표시한다.
 */
function mergedNotes(): PatchNote[] {
  const manual = PATCH_NOTES.map((p) => ({ ...p, source: p.source ?? ("manual" as const) }));
  const steam = steamNotes as PatchNote[];
  return [...manual, ...steam].sort((a, b) => b.date.localeCompare(a.date));
}

export function PatchNotes() {
  const notes = mergedNotes();
  if (notes.length === 0)
    return <p className="hint">등록된 패치 내역이 없습니다. (data/patchNotes.ts 또는 fetch:patch)</p>;

  return (
    <div className="patch-notes">
      {notes.map((p, i) => (
        <article key={`${p.source}-${p.version}-${p.date}-${i}`} className="patch-entry">
          <div className="patch-head">
            <span className="patch-version">{p.version}</span>
            {p.source === "steam" && (
              // 본문 출처: ER 공식 한글로 채워졌으면 '공식', 영어 폴백이면 'Steam'.
              <span className="patch-badge">
                {p.url && /playeternalreturn\.com/.test(p.url) ? "공식" : "Steam"}
              </span>
            )}
            <span className="patch-date">{p.date}</span>
          </div>
          {p.changes.length === 0 ? (
            <p className="hint">내용 없음</p>
          ) : (
            <ul className="patch-changes">
              {p.changes.map((c, j) =>
                c.startsWith(HEAD) ? (
                  <li key={j} className="patch-section">
                    {c.slice(HEAD.length).trim()}
                  </li>
                ) : (
                  <li key={j}>{c}</li>
                ),
              )}
            </ul>
          )}
          {p.url && (
            <a className="patch-link" href={p.url} target="_blank" rel="noreferrer">
              공식 노트 전체 보기 ↗
            </a>
          )}
        </article>
      ))}
    </div>
  );
}
