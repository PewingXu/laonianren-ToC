/**
 * 脚掌轮廓。
 *
 * 原实现是「一个椭圆 + 四个大小不一的圆点」拼的，既没有足弓内凹也没有
 * 脚跟收窄，四个脚趾还是等距圆点，看着不像脚。
 *
 * 现在用一条闭合路径画脚掌：前掌宽、足弓内侧收进去、脚跟收窄成圆弧；
 * 拇趾单独一个较大的椭圆，其余四趾按真实比例递减并沿前掌弧线排布。
 * 右脚不另画一套坐标，直接水平镜像 —— 人的左右脚本来就是镜像对称的。
 */
function FootShape({ side, opacity = 1 }) {
  return (
    <svg
      viewBox="0 0 34 52"
      aria-hidden="true"
      style={{
        transform: side === 'right' ? 'scaleX(-1)' : undefined,
        opacity,
      }}
    >
      {/* 脚掌：前掌 → 外侧缘 → 脚跟 → 内侧足弓（内凹）→ 收回前掌 */}
      <path d="
        M 17 14
        C 23.5 14, 27 17.5, 27 22
        C 27 26, 26 29, 25 32
        C 24 35.5, 23.5 39, 23.5 42
        C 23.5 46.5, 21 49, 17.5 49
        C 14 49, 11.5 46.5, 11.5 42.5
        C 11.5 39.5, 11.8 37, 11.2 34
        C 10.4 30, 9 27.5, 8.6 24
        C 8.2 18, 11.5 14, 17 14
        Z
      " />
      {/* 拇趾 */}
      <ellipse cx="10.6" cy="9.6" rx="3.5" ry="4.1" transform="rotate(-14 10.6 9.6)" />
      {/* 其余四趾：沿前掌弧线排布，尺寸自然递减 */}
      <ellipse cx="16.4" cy="7.2" rx="2.5" ry="3.1" transform="rotate(-6 16.4 7.2)" />
      <ellipse cx="20.7" cy="7.4" rx="2.25" ry="2.85" transform="rotate(2 20.7 7.4)" />
      <ellipse cx="24.3" cy="8.6" rx="2" ry="2.5" transform="rotate(9 24.3 8.6)" />
      <ellipse cx="27.2" cy="10.7" rx="1.7" ry="2.1" transform="rotate(16 27.2 10.7)" />
    </svg>
  );
}

/**
 * 受力占比 → 不透明度。50% 满不透明，越轻越淡，下限 0.45 保证仍看得清轮廓。
 * 数据不足时统一返回 1，不做任何暗示。
 */
function footOpacity(percent, hasBalance) {
  if (!hasBalance || !Number.isFinite(percent)) return 1;
  return Math.min(1, Math.max(0.45, 0.45 + (percent / 50) * 0.55));
}

export function ForceBalance({ metric }) {
  const hasBalance = metric.leftPercent !== null && metric.rightPercent !== null;
  const label = hasBalance
    ? `左脚 ${metric.leftPercent}%，右脚 ${metric.rightPercent}%`
    : '双脚发力数据不足';

  return (
    <div className="sit-stand-report__balance-visual" role="img" aria-label={label}>
      <div className="sit-stand-report__balance-labels" aria-hidden="true">
        <span>轻</span><span>强</span>
      </div>
      <div className="sit-stand-report__balance-track" aria-hidden="true">
        <span
          data-testid="left-balance-segment"
          style={{ width: `${metric.leftPercent ?? 0}%` }}
        />
        <i
          data-testid="right-balance-segment"
          style={{ width: `${metric.rightPercent ?? 0}%` }}
        />
      </div>
      {/*
        脚的深浅跟着实际受力走：受力多的那只更实，一眼能看出偏向哪边。
        50% 对应满不透明，两侧都有数据时才做区分；数据不足就都用中间调，
        不做任何暗示。
      */}
      <div className="sit-stand-report__feet-row" aria-hidden="true">
        <FootShape side="left" opacity={footOpacity(metric.leftPercent, hasBalance)} />
        <FootShape side="right" opacity={footOpacity(metric.rightPercent, hasBalance)} />
      </div>
    </div>
  );
}
