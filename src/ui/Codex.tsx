/**
 * 도감 — 게임 시스템 참고 뷰. 특성 / 제작 트리 / 야생동물 / 지역.
 * (스탯 비교 본문과 분리해, 게임 전반 정보를 한 탭에 모은다.)
 */

import { useMemo, useState } from "react";
import {
  traits,
  monsters,
  areas,
  tactical,
  craftableTargets,
  buildCraftTree,
  leafMaterials,
  traitGroupLabel,
  type CraftNode,
} from "../gameExtra.js";
import { matchName } from "../hangul.js";

type Tab = "trait" | "tactical" | "craft" | "monster" | "area";
const TAB_LABEL: Record<Tab, string> = {
  trait: "특성",
  tactical: "전술 스킬",
  craft: "제작",
  monster: "야생동물",
  area: "지역",
};

const GRADE_KO: Record<string, string> = {
  Common: "일반",
  Uncommon: "고급",
  Rare: "희귀",
  Epic: "영웅",
  Legend: "전설",
  Mythic: "신화",
};

export function Codex() {
  const [tab, setTab] = useState<Tab>("trait");
  return (
    <div className="codex">
      <div className="codex-tabs">
        {(["trait", "tactical", "craft", "monster", "area"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "tab active" : "tab"} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      {tab === "trait" && <TraitView />}
      {tab === "tactical" && <TacticalView />}
      {tab === "craft" && <CraftView />}
      {tab === "monster" && <MonsterView />}
      {tab === "area" && <AreaView />}
    </div>
  );
}

// --- 특성 ---
function TraitView() {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const filtered = traits.filter((t) => matchName(t.name, q) || matchName(t.desc, q));
    const byGroup = new Map<string, typeof traits>();
    for (const t of filtered) {
      const arr = byGroup.get(t.group) ?? [];
      arr.push(t);
      byGroup.set(t.group, arr);
    }
    return [...byGroup.entries()];
  }, [q]);

  return (
    <div className="codex-body">
      <input
        className="search"
        placeholder="특성 검색…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {groups.length === 0 && <p className="empty">검색 결과 없음</p>}
      {groups.map(([group, list]) => (
        <div key={group} className="trait-group">
          <h4 className="trait-group-name">{traitGroupLabel(group)} ({list.length})</h4>
          <ul className="trait-list">
            {list.map((t) => (
              <li key={t.code} className="trait-card">
                <div className="trait-head">
                  <b>{t.name}</b>
                  {t.type && <em className="trait-type">{t.type}</em>}
                </div>
                {t.desc && <p className="trait-desc">{t.desc}</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// --- 전술 스킬 ---
function TacticalView() {
  const [q, setQ] = useState("");
  const list = useMemo(
    () => tactical.filter((t) => matchName(t.name, q) || matchName(t.desc, q)),
    [q],
  );
  return (
    <div className="codex-body">
      <input
        className="search"
        placeholder="전술 스킬 검색…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <p className="hint">출처: dak.gg (공식 API 미제공). 강화 효과 포함.</p>
      <ul className="trait-list">
        {list.map((t) => (
          <li key={t.code} className="trait-card tactical-card">
            <div className="trait-head">
              {t.iconUrl && <img className="tac-icon" src={t.iconUrl} alt="" loading="lazy" />}
              <b>{t.name}</b>
            </div>
            {t.desc && <p className="trait-desc">{t.desc}</p>}
          </li>
        ))}
        {list.length === 0 && <li className="empty">검색 결과 없음</li>}
      </ul>
    </div>
  );
}

// --- 제작 트리 ---
function CraftTreeNode({ node, depth }: { node: CraftNode; depth: number }) {
  return (
    <li className={`craft-node depth-${Math.min(depth, 3)}`}>
      <div className={`craft-item g-${node.grade}`}>
        {node.iconUrl && <img className="item-icon" src={node.iconUrl} alt="" loading="lazy" />}
        <span className="craft-name">{node.name}</span>
        <span className="craft-grade">{GRADE_KO[node.grade] ?? node.grade}</span>
      </div>
      {node.children.length > 0 && (
        <ul className="craft-children">
          {node.children.map((c, i) => (
            <CraftTreeNode key={`${c.code}-${i}`} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function CraftView() {
  const [q, setQ] = useState("");
  const [code, setCode] = useState<number | null>(null);
  const list = useMemo(
    () => craftableTargets.filter((r) => matchName(r.name, q)),
    [q],
  );
  const tree = code != null ? buildCraftTree(code) : undefined;
  const leaves = code != null ? leafMaterials(code) : [];

  return (
    <div className="codex-body craft-view">
      <div className="craft-picker">
        <input
          className="search"
          placeholder="완성 아이템 검색 (영웅 이상)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="craft-target-list scroll">
          {list.map((r) => (
            <li key={r.code}>
              <button
                className={code === r.code ? "ct active" : "ct"}
                onClick={() => setCode(r.code)}
              >
                {r.iconUrl && <img className="item-icon" src={r.iconUrl} alt="" loading="lazy" />}
                <span>{r.name}</span>
                <em className={`g-${r.grade}`}>{GRADE_KO[r.grade] ?? r.grade}</em>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="empty">검색 결과 없음</li>}
        </ul>
      </div>

      <div className="craft-detail">
        {!tree ? (
          <p className="hint">왼쪽에서 아이템을 고르면 제작 트리를 보여줍니다.</p>
        ) : (
          <>
            <h4>{tree.name} 제작 트리</h4>
            <ul className="craft-tree">
              <CraftTreeNode node={tree} depth={0} />
            </ul>
            {leaves.length > 0 && (
              <>
                <h4>필요한 기본 재료</h4>
                <ul className="leaf-mats">
                  {leaves.map((m) => (
                    <li key={m.name} className="leaf-mat">
                      {m.iconUrl && <img className="item-icon" src={m.iconUrl} alt="" loading="lazy" />}
                      <span>{m.name}</span>
                      <b>×{m.count}</b>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- 야생동물 ---
type MonSort = "gainExp" | "maxHp" | "attackPower";
const MON_SORT_LABEL: Record<MonSort, string> = {
  gainExp: "경험치",
  maxHp: "체력",
  attackPower: "공격력",
};

function MonsterView() {
  const [sort, setSort] = useState<MonSort>("gainExp");
  const [q, setQ] = useState("");
  const rows = useMemo(
    () =>
      monsters
        .filter((m) => matchName(m.name, q))
        .slice()
        .sort((a, b) => b[sort] - a[sort]),
    [sort, q],
  );

  return (
    <div className="codex-body">
      <div className="mon-controls">
        <input
          className="search"
          placeholder="야생동물 검색…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="mon-sort">
          {(["gainExp", "maxHp", "attackPower"] as MonSort[]).map((s) => (
            <button key={s} className={sort === s ? "tab active" : "tab"} onClick={() => setSort(s)}>
              {MON_SORT_LABEL[s]}순
            </button>
          ))}
        </div>
      </div>
      <table className="mon-table">
        <thead>
          <tr>
            <th>이름</th>
            <th>경험치</th>
            <th>체력</th>
            <th>공격</th>
            <th>방어</th>
            <th>리젠</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.code}>
              <td className="mon-name">
                {m.name}
                {m.isMutant && <em className="mut">변이</em>}
              </td>
              <td>{m.gainExp}</td>
              <td>{m.maxHp.toLocaleString()}</td>
              <td>{m.attackPower}</td>
              <td>{m.defense}</td>
              <td>{m.regenTime}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- 지역 ---
function AreaView() {
  return (
    <div className="codex-body">
      <p className="hint">루미아 섬 지역 ({areas.length}). ★ = 시작 가능 지역.</p>
      <div className="area-grid">
        {areas.map((a) => (
          <div key={a.code} className="area-card">
            <span className="area-name">{a.name}</span>
            {a.startingArea && <em className="area-start" title="시작 가능 지역">★</em>}
          </div>
        ))}
      </div>
    </div>
  );
}
