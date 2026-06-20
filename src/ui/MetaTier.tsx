/**
 * 티어/메타 랜딩 — dak.gg 통계(패치·티어 기준) 기반 캐릭터 티어표.
 * 행 클릭 시 해당 캐릭터를 스탯 비교로 불러온다.
 */

import { useMemo, useState } from "react";
import { metaTier, TIER_ORDER, type MetaRow } from "../gameExtra.js";
import { gameCharacters } from "../gameData.js";
import { matchName } from "../hangul.js";

/** 실험체 이름 → 아이콘 URL (티어표 행에 아이콘 표시용). */
const iconByName = new Map(gameCharacters.map((c) => [c.name, c.iconUrl]));

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** dak.gg 패치 정수(11040) → "11.4.0". */
const patchLabel = (p: number) =>
  `${Math.floor(p / 1000)}.${Math.floor((p % 1000) / 10)}.${p % 10}`;

const TIERS = ["S", "A", "B", "C", "D"];

type SortKey = "tier" | "name" | "winRate" | "top3Rate" | "pickRate";

export function MetaTier({ onPick }: { onPick: (name: string) => void }) {
  const [q, setQ] = useState("");
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("tier");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  /** 헤더 클릭 — 같은 열이면 방향 토글, 다른 열이면 기본 방향으로. */
  function clickSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc"); // 이름만 가나다 오름차순 기본
    }
  }

  const rows = useMemo(() => {
    let list = metaTier.rows.filter((r) => matchName(r.name, q));
    if (tierFilter) list = list.filter((r) => r.tier === tierFilter);
    // 티어는 높을수록 큰 값(-index)으로 환산해 숫자처럼 정렬
    const val = (r: MetaRow): number | string =>
      sortKey === "tier"
        ? -TIER_ORDER.indexOf(r.tier)
        : sortKey === "name"
          ? r.name
          : (r[sortKey] as number);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      let c =
        typeof va === "string" ? va.localeCompare(vb as string, "ko") : va - (vb as number);
      if (c === 0) c = b.winRate - a.winRate; // 동률은 승률로
      return c * dir;
    });
  }, [q, tierFilter, sortKey, sortDir]);

  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  const updated = metaTier.updatedAt
    ? new Date(metaTier.updatedAt).toLocaleDateString("ko-KR")
    : "";

  return (
    <div className="meta">
      <div className="meta-head">
        <span className="meta-badge">패치 {patchLabel(metaTier.patch)}</span>
        <span className="meta-badge">티어 다이아+</span>
        <span className="meta-sub">
          표본 {metaTier.totalGames.toLocaleString()}게임 · {updated} · 출처 dak.gg
        </span>
      </div>

      <div className="meta-controls">
        <input
          className="search"
          placeholder="실험체 검색…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="meta-tierfilter">
          <button className={!tierFilter ? "tab active" : "tab"} onClick={() => setTierFilter(null)}>
            전체
          </button>
          {TIERS.map((t) => (
            <button
              key={t}
              className={`tab tier-chip tier-${t}${tierFilter === t ? " active" : ""}`}
              onClick={() => setTierFilter(tierFilter === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <table className="meta-table">
        <thead>
          <tr>
            <th className={`sortable${sortKey === "tier" ? " sorted" : ""}`} onClick={() => clickSort("tier")}>
              티어{arrow("tier")}
            </th>
            <th className={`sortable${sortKey === "name" ? " sorted" : ""}`} onClick={() => clickSort("name")}>
              실험체{arrow("name")}
            </th>
            <th className={`sortable${sortKey === "winRate" ? " sorted" : ""}`} onClick={() => clickSort("winRate")}>
              승률{arrow("winRate")}
            </th>
            <th className={`sortable${sortKey === "top3Rate" ? " sorted" : ""}`} onClick={() => clickSort("top3Rate")}>
              Top3{arrow("top3Rate")}
            </th>
            <th className={`sortable${sortKey === "pickRate" ? " sorted" : ""}`} onClick={() => clickSort("pickRate")}>
              픽률{arrow("pickRate")}
            </th>
            <th>주요 빌드</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <MetaRowView key={r.name} row={r} onPick={onPick} />
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">검색 결과 없음</p>}
    </div>
  );
}

function MetaRowView({ row, onPick }: { row: MetaRow; onPick: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="meta-row" onClick={() => setOpen((o) => !o)}>
        <td>
          <span className={`tier-badge tier-${row.tier}`}>{row.tier}</span>
        </td>
        <td className="meta-name">
          <button
            className="meta-pick"
            onClick={(e) => {
              e.stopPropagation();
              onPick(row.name);
            }}
            title="이 실험체로 스탯 비교 열기"
          >
            {iconByName.get(row.name) && (
              <img className="meta-icon" src={iconByName.get(row.name)} alt="" loading="lazy" />
            )}
            <span>{row.name}</span>
          </button>
        </td>
        <td>{pct(row.winRate)}</td>
        <td>{pct(row.top3Rate)}</td>
        <td>{pct(row.pickRate)}</td>
        <td className="meta-builds">
          {row.builds.slice(0, 2).map((b) => `${b.weapon}`).join(" · ")}
          {row.builds.length > 1 && <span className="meta-expand">{open ? " ▲" : " ▾"}</span>}
        </td>
      </tr>
      {open &&
        row.builds.map((b) => (
          <tr key={b.weapon} className="meta-subrow">
            <td>
              <span className={`tier-badge sm tier-${b.tier}`}>{b.tier}</span>
            </td>
            <td className="meta-subweapon">{b.weapon}</td>
            <td>{pct(b.winRate)}</td>
            <td>{pct(b.top3Rate)}</td>
            <td>{pct(b.pickRate)}</td>
            <td className="meta-score">점수 {b.tierScore}</td>
          </tr>
        ))}
    </>
  );
}
