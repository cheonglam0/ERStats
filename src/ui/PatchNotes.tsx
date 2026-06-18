import { PATCH_NOTES } from "../../data/patchNotes.js";

/**
 * 패치/핫픽스 변경점 목록 (최신이 위).
 * 내용은 data/patchNotes.ts 에서 직접 편집한다.
 */
export function PatchNotes() {
  if (PATCH_NOTES.length === 0)
    return <p className="hint">등록된 패치 내역이 없습니다. (data/patchNotes.ts 에서 추가)</p>;

  return (
    <div className="patch-notes">
      {PATCH_NOTES.map((p, i) => (
        <article key={`${p.version}-${p.date}-${i}`} className="patch-entry">
          <div className="patch-head">
            <span className="patch-version">{p.version}</span>
            <span className="patch-date">{p.date}</span>
          </div>
          {p.changes.length === 0 ? (
            <p className="hint">내용 없음</p>
          ) : (
            <ul className="patch-changes">
              {p.changes.map((c, j) => (
                <li key={j}>{c}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
