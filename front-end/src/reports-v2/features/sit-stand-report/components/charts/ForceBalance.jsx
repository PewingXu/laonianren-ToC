/**
 * 双脚发力平衡。
 *
 * 改版说明
 * ---------------------------------------------------------------
 * 之前是「轻 ── 强」一条渐变条 + 底下两只脚。问题有两个：
 *   1. 「轻 / 强」是单向刻度的说法，但这条是左脚和右脚的占比对分，
 *      两端各是一只脚，不存在「轻的一端」「强的一端」。
 *   2. 脚画在条的下方两角，跟条本身没有对齐关系，看着像装饰。
 *
 * 现在：左右两只脚分别站在条的两端当端点标记，各自旁边标占比，
 * 条从中间向两侧按占比填色（左蓝 / 右橙，与六区域图、二级指标同色系）。
 * 受力多的那只脚更实，少的更淡 —— 方向一眼可见。
 *
 * 数据来源：symmetry.left_avg_force / right_avg_force（算法直接给的两脚
 * 每帧平均力，N），由 sitStandReportEnrich.balancePercents 换成占比。
 */
function FootShape({ side, opacity = 1 }) {
  return (
    <svg
      viewBox="0 0 34 52"
      aria-hidden="true"
      style={{ transform: side === 'right' ? 'scaleX(-1)' : undefined, opacity }}
    >
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
      <ellipse cx="10.6" cy="9.6" rx="3.5" ry="4.1" transform="rotate(-14 10.6 9.6)" />
      <ellipse cx="16.4" cy="7.2" rx="2.5" ry="3.1" transform="rotate(-6 16.4 7.2)" />
      <ellipse cx="20.7" cy="7.4" rx="2.25" ry="2.85" transform="rotate(2 20.7 7.4)" />
      <ellipse cx="24.3" cy="8.6" rx="2" ry="2.5" transform="rotate(9 24.3 8.6)" />
      <ellipse cx="27.2" cy="10.7" rx="1.7" ry="2.1" transform="rotate(16 27.2 10.7)" />
    </svg>
  );
}

/** 占比 → 不透明度。50% 满，越少越淡，下限 0.4 保证轮廓可见。数据不足统一 1。 */
function footOpacity(percent, hasBalance) {
  if (!hasBalance || !Number.isFinite(percent)) return 1;
  return Math.min(1, Math.max(0.4, 0.4 + (percent / 50) * 0.6));
}

export function ForceBalance({ metric }) {
  const hasBalance = metric.leftPercent !== null && metric.rightPercent !== null;
  const left = hasBalance ? metric.leftPercent : null;
  const right = hasBalance ? metric.rightPercent : null;
  const label = hasBalance
    ? `左脚 ${left}%，右脚 ${right}%`
    : '双脚发力数据不足';

  return (
    <div className="sit-stand-report__balance" role="img" aria-label={label}>
      <div className="sit-stand-report__balance-side" data-side="left">
        <FootShape side="left" opacity={footOpacity(left, hasBalance)} />
        <b>{hasBalance ? `${left}%` : '--'}</b>
        <small>左脚</small>
      </div>

      {/*
        中间一条对分条：从中线向两侧各按占比填色。
        50/50 时两侧等长，偏侧时一边长一边短，中线是不动的参照。
      */}
      <div className="sit-stand-report__balance-track" aria-hidden="true">
        <span
          className="sit-stand-report__balance-fill"
          data-side="left"
          style={{ width: hasBalance ? `${left}%` : '0%' }}
        />
        <span
          className="sit-stand-report__balance-fill"
          data-side="right"
          style={{ width: hasBalance ? `${right}%` : '0%' }}
        />
        <i className="sit-stand-report__balance-midline" />
      </div>

      <div className="sit-stand-report__balance-side" data-side="right">
        <FootShape side="right" opacity={footOpacity(right, hasBalance)} />
        <b>{hasBalance ? `${right}%` : '--'}</b>
        <small>右脚</small>
      </div>
    </div>
  );
}
