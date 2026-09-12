const GAUGE_BASE_LIMIT_CM = 2;
const GAUGE_CENTER_X = 125;
const GAUGE_CENTER_Y = 133;
const GAUGE_NEEDLE_LENGTH = 74;
const GAUGE_NEEDLE_HALF_WIDTH = 4;

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function rounded(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function normalizeWeightShares(leftValue, rightValue) {
  const left = finiteNumber(leftValue);
  const right = finiteNumber(rightValue);
  if (left === null || right === null || left < 0 || right < 0 || left + right <= 0) {
    return null;
  }

  const leftShare = rounded((left / (left + right)) * 100);
  return {
    left: leftShare,
    right: rounded(100 - leftShare),
  };
}

export function buildWeightRingModel(leftValue, rightValue) {
  const shares = normalizeWeightShares(leftValue, rightValue);
  if (!shares) {
    return {
      hasValue: false,
      leftShare: 0,
      rightShare: 0,
      leftDashoffset: 0,
      rightDashoffset: 0,
    };
  }

  return {
    hasValue: true,
    leftShare: shares.left,
    rightShare: shares.right,
    // 圆从 12 点方向顺时针绘制：右脚先占画面右侧，左脚随后落在画面左侧。
    leftDashoffset: -shares.right,
    rightDashoffset: 0,
  };
}

export function buildCenterGaugeModel(value) {
  const numericValue = finiteNumber(value);
  const limit = numericValue === null
    ? GAUGE_BASE_LIMIT_CM
    : Math.max(GAUGE_BASE_LIMIT_CM, Math.ceil(Math.abs(numericValue)));
  const ticks = [-limit, -limit / 2, 0, limit / 2, limit];

  if (numericValue === null) {
    return { hasValue: false, limit, ticks, needlePath: null, tip: null };
  }

  const normalized = numericValue / limit;
  const angle = ((1 - normalized) * Math.PI) / 2;
  const directionX = Math.cos(angle);
  const directionY = -Math.sin(angle);
  const tipX = GAUGE_CENTER_X + directionX * GAUGE_NEEDLE_LENGTH;
  const tipY = GAUGE_CENTER_Y + directionY * GAUGE_NEEDLE_LENGTH;
  const perpendicularX = -directionY * GAUGE_NEEDLE_HALF_WIDTH;
  const perpendicularY = directionX * GAUGE_NEEDLE_HALF_WIDTH;
  const needlePath = [
    `M${rounded(GAUGE_CENTER_X + perpendicularX)} ${rounded(GAUGE_CENTER_Y + perpendicularY)}`,
    `L${rounded(tipX)} ${rounded(tipY)}`,
    `L${rounded(GAUGE_CENTER_X - perpendicularX)} ${rounded(GAUGE_CENTER_Y - perpendicularY)}Z`,
  ].join(' ');

  return {
    hasValue: true,
    limit,
    ticks,
    needlePath,
    tip: { x: rounded(tipX), y: rounded(tipY) },
  };
}
