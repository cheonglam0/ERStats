import { skillDps, stat } from "../engine.js";
import type { BuildProfile, DamageType, Skill, StatBlock } from "../types.js";

/**
 * 스킬 정보 패널 — 선택한 캐릭터(×무기군)의 스킬별 계수·쿨다운·피해 공식을 보여준다.
 *
 * 원본 데이터에는 인게임 툴팁 "문장"이 없어, 입력된 계수로 피해 공식을 생성한다:
 *   1히트 피해 = 기본피해 + 공격력 × 공계수 + 스증 × 스증계수  (다단히트면 × 히트수)
 * 현재 빌드의 공격력/스증을 대입한 예상 피해와 DPS(쿨다운·치명타 반영)도 함께 표시한다.
 */

const DMG_LABEL: Record<DamageType, string> = {
  physical: "물리",
  magic: "마법",
  true: "고정",
};

const fmt = (x: number): string =>
  Number.isFinite(x) ? x.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "∞";
const pctC = (r: number): string => `${Math.round(r * 100)}%`;

/** 스칼라면 그대로, 배열이면 레벨 인덱스로(범위 밖은 마지막 값). */
function ratioAt(r: number | number[], idx: number): number {
  if (typeof r === "number") return r;
  if (r.length === 0) return 0;
  return r[Math.min(idx, r.length - 1)] ?? 0;
}
/** 계수가 레벨별로 변하는지(배열이고 값이 2종 이상). */
function varies(r: number | number[]): boolean {
  return Array.isArray(r) && new Set(r).size > 1;
}
/** 계수 표기: 일정하면 "80%", 레벨별이면 "20→60%". */
function ratioText(r: number | number[]): string {
  if (typeof r === "number") return pctC(r);
  if (r.length === 0) return "0%";
  if (!varies(r)) return pctC(r[0] ?? 0);
  return `${pctC(r[0] ?? 0)}→${pctC(r[r.length - 1] ?? 0)}`;
}

/** 무기군 override를 반영한 실제 스킬. */
function resolved(profile: BuildProfile, s: Skill): Skill {
  const ov = profile.weapon.skillOverrides?.[s.slot];
  return ov ? { ...s, ...ov } : s;
}

function SkillCard({ profile, skill, stats }: { profile: BuildProfile; skill: Skill; stats: StatBlock }) {
  const s = resolved(profile, skill);
  const levels = Math.max(s.baseDamage.length, 1);
  const ap = stat(stats, "attackPower");
  const amp = stat(stats, "skillAmp");
  const hits = s.hitCount ?? 1;

  const apR = s.apRatio;
  const ampR = s.skillAmpRatio;
  const hasAp = (typeof apR === "number" ? apR : Math.max(...apR, 0)) > 0;
  const hasAmp = (typeof ampR === "number" ? ampR : Math.max(...ampR, 0)) > 0;
  const isPassive = s.excludeFromDps === true;

  // 피해 공식 문자열(툴팁)
  const formula = [
    "기본",
    hasAp ? `공격력×${ratioText(apR)}` : null,
    hasAmp ? `스증×${ratioText(ampR)}` : null,
    s.scalesWithBasicAttack ? "평타계수 동반" : null,
  ]
    .filter(Boolean)
    .join(" + ");

  return (
    <div className={`skill-card${isPassive ? " passive" : ""}`}>
      <div className="skill-card-head">
        <span className="skill-slot">{s.slot}</span>
        <span className="skill-card-name">{s.name}</span>
        <span className={`dmg-tag ${s.damageType}`}>{DMG_LABEL[s.damageType]}</span>
        {hits > 1 && <span className="skill-flag">{hits}히트</span>}
        {isPassive && <span className="skill-flag passive">패시브 · DPS 제외</span>}
      </div>

      <div className="skill-formula" title="입력된 계수로 생성한 피해 공식">
        피해 = {formula}
      </div>

      <table className="skill-lv-table">
        <thead>
          <tr>
            <th>Lv</th>
            <th>기본</th>
            {hasAp && <th title="공격력 계수">공계수</th>}
            {hasAmp && <th title="스킬증폭 계수">스증계수</th>}
            <th>쿨다운</th>
            <th title="현재 빌드 공격력/스증 대입(치명타 제외)">예상 1타</th>
            {!isPassive && <th title="쿨다운·치명타 반영 회전 DPS">DPS</th>}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: levels }, (_, i) => {
            const base = s.baseDamage[i] ?? 0;
            const a = ratioAt(apR, i);
            const m = ratioAt(ampR, i);
            const perHit = base + ap * a + amp * m + (s.scalesWithBasicAttack ? ap * profile.weapon.basicAdRatio : 0);
            const raw = perHit * hits;
            const cd = s.cooldown[i] ?? s.cooldown[s.cooldown.length - 1] ?? 0;
            const dps = isPassive ? 0 : skillDps(profile, skill, stats, i + 1);
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td className="num">{base}</td>
                {hasAp && <td className="num">{pctC(a)}</td>}
                {hasAmp && <td className="num">{pctC(m)}</td>}
                <td className="num">{cd ? `${cd}s` : "—"}</td>
                <td className="num">{fmt(raw)}</td>
                {!isPassive && <td className="num skill-dps-cell">{fmt(dps)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>

      {s.note && <p className="skill-note">※ {s.note}</p>}
    </div>
  );
}

export function SkillPanel({
  profile,
  stats,
  hasSkills,
}: {
  profile: BuildProfile;
  stats: StatBlock;
  hasSkills: boolean;
}) {
  const { character } = profile;
  if (!hasSkills || character.skills.length === 0) {
    return (
      <p className="hint">
        이 캐릭터는 스킬 계수가 아직 입력되지 않았습니다. (나무위키 기준 수동 입력 대기)
      </p>
    );
  }
  return (
    <div className="skill-list">
      <p className="hint">
        현재 빌드(공격력 <b>{fmt(stat(stats, "attackPower"))}</b> · 스증 <b>{fmt(stat(stats, "skillAmp"))}</b>)
        기준 예상치입니다. 무기군을 바꾸면 override가 반영됩니다.
      </p>
      {character.skills.map((s) => (
        <SkillCard key={s.slot} profile={profile} skill={s} stats={stats} />
      ))}
    </div>
  );
}
