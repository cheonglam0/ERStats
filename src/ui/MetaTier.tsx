/**
 * 티어/메타 랜딩 — dak.gg 통계(패치·티어 기준) 기반 캐릭터 티어표.
 * 행 클릭 시 해당 캐릭터를 스탯 비교로 불러온다.
 */

import { useMemo, useState } from "react";
import { metaTier, TIER_ORDER, type MetaRow } from "../gameExtra.js";
import { matchName } from "../hangul.js";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** dak.gg 패치 정수(11040) → "11.4.0". */
const patchLabel = (p: number) =>
  `${Math.floor(p / 1000)}.${Math.floor((p % 1000) / 10)}.${p % 10}`;

const TIERS = ["S", "A", "B", "C", "D"];

export function MetaTier({ onPick }: { onPick: (name: string) => void }) {
  const [q, setQ] = useState("");
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<"tier" | "winRate" | "pickRate">("tier");

  const rows = useMemo(() => {
    let list = metaTier.rows.filter((r) => matchName(r.name, q));
    if (tierFilter) list = list.filter((r) => r.tier === tierFilter);
    const sorted = [...list];
    if (sort === "winRate") sorted.sort((a, b) => b.winRate - a.winRate);
    else if (sort === "pickRate") sorted.sort((a, b) => b.pickRate - a.pickRate);
    else
      sorted.sort(
        (a, b) =>
          TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) ||
          b.winRate - a.winRate,
      );
    return sorted;
  }, [q, tierFilter, sort]);

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
        <div className="meta-sort">
          {(["tier", "winRate", "pickRate"] as const).map((s) => (
            <button key={s} className={sort === s ? "tab active" : "tab"} onClick={() => setSort(s)}>
              {s === "tier" ? "티어순" : s === "winRate" ? "승률순" : "픽률순"}
            </button>
          ))}
        </div>
      </div>

      <table className="meta-table">
        <thead>
          <tr>
            <th>티어</th>
            <th>실험체</th>
            <th>승률</th>
            <th>Top3</th>
            <th>픽률</th>
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
            {row.name}
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
