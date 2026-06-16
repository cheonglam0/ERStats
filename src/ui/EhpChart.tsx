import { DEFENSE_K } from "../constants.js";

/**
 * 방어력 vs 체력 효율 그래프.
 *
 * 같은 아이템 예산을 기준으로 한 한계 효율(EHP 증가량)을 방어력 축 위에 그린다.
 *   - 방어력 투자 효율 = 체력/100        → 방어력과 무관(수평선)
 *   - 체력  투자 효율 = R·(방어력+100)/100 → 방어력이 높을수록 상승(우상향)
 *   두 선이 만나는 곳이 균형점(방어력 = 체력/R − 100). 왼쪽은 방어력, 오른쪽은 체력이 유리.
 */

const W = 300;
const H = 170;
const PAD = { l: 34, r: 10, t: 12, b: 26 };

const fmt = (x: number) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : 0);

export function EhpChart({ maxHp, defense, ratio }: { maxHp: number; defense: number; ratio: number }) {
  const K = DEFENSE_K;
  const r = ratio > 0 ? ratio : 1;
  const perDef = maxHp / K; // 방어력 투자 효율(수평)
  const hpEff = (x: number) => (r * (x + K)) / K; // 체력 투자 효율
  const balanceDef = Math.max(0, maxHp / r - K);

  // X축 범위: 균형점·현재 방어력이 보이도록 여유 있게
  const rawMax = Math.max(200, defense * 1.4, balanceDef * 1.6);
  const xMax = Math.min(800, Math.ceil(rawMax / 50) * 50);
  const yMax = Math.max(perDef, hpEff(xMax)) * 1.08 || 1;

  const px = (x: number) => PAD.l + (x / xMax) * (W - PAD.l - PAD.r);
  const py = (y: number) => PAD.t + (1 - y / yMax) * (H - PAD.t - PAD.b);

  const x0 = px(0);
  const x1 = px(xMax);
  const yDef = py(perDef);
  const hp0 = py(hpEff(0));
  const hp1 = py(hpEff(xMax));

  const showBalance = balanceDef <= xMax;
  const bx = px(balanceDef);
  const by = py(perDef);
  const showCur = defense <= xMax;
  const cx = px(defense);

  const xticks = [0, xMax / 2, xMax].map((v) => Math.round(v));

  return (
    <div className="ehp-graph">
      <svg viewBox={`0 0 ${W} ${H}`} className="ehp-svg" role="img" aria-label="방어력 대비 체력 효율 그래프">
        {/* 축 */}
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} className="axis" />
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} className="axis" />
        {xticks.map((t) => (
          <text key={t} x={px(t)} y={H - PAD.b + 12} className="tick" textAnchor="middle">
            {t}
          </text>
        ))}
        <text x={W - PAD.r} y={H - 4} className="axis-label" textAnchor="end">
          방어력 →
        </text>
        <text x={PAD.l - 4} y={PAD.t + 2} className="axis-label" textAnchor="end">
          효율
        </text>

        {/* 균형점 좌/우 영역 표시 */}
        {showBalance && (
          <>
            <rect x={x0} y={PAD.t} width={Math.max(0, bx - x0)} height={H - PAD.b - PAD.t} className="zone-def" />
            <rect x={bx} y={PAD.t} width={Math.max(0, x1 - bx)} height={H - PAD.b - PAD.t} className="zone-hp" />
          </>
        )}

        {/* 방어력 투자 효율(수평) */}
        <line x1={x0} y1={yDef} x2={x1} y2={yDef} className="line-def" />
        {/* 체력 투자 효율(우상향) */}
        <line x1={x0} y1={hp0} x2={x1} y2={hp1} className="line-hp" />

        {/* 균형점 */}
        {showBalance && (
          <>
            <circle cx={bx} cy={by} r={3.5} className="dot-balance" />
            <text x={bx} y={PAD.t - 1} className="tick" textAnchor="middle">
              균형 {Math.round(balanceDef)}
            </text>
          </>
        )}

        {/* 현재 방어력 */}
        {showCur && (
          <>
            <line x1={cx} y1={PAD.t} x2={cx} y2={H - PAD.b} className="line-cur" />
            <text x={cx} y={H - PAD.b - 3} className="tick cur" textAnchor="middle">
              현재 {Math.round(defense)}
            </text>
          </>
        )}
      </svg>
      <div className="ehp-legend">
        <span className="lg def">방어력 투자 (+{fmt(perDef)}/예산)</span>
        <span className="lg hp">체력 투자 (+{fmt(hpEff(defense))}/예산)</span>
      </div>
    </div>
  );
}
