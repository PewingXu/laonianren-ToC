const PRESSURE_STOPS = [
  [0, [49, 88, 138]],
  [0.2, [39, 128, 157]],
  [0.4, [46, 169, 148]],
  [0.6, [142, 189, 104]],
  [0.78, [232, 189, 77]],
  [0.9, [237, 132, 70]],
  [1, [200, 63, 69]],
];

const TRAIL_START_COLOR = [211, 224, 219];
const TRAIL_END_COLOR = [50, 99, 89];

export const FOOTPRINT_PADDING_CELLS = 2;

function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - (2 * amount));
}

export function pressureColor(amount) {
  const curvedAmount = clamp01(amount) ** 0.8;
  const upperIndex = PRESSURE_STOPS.findIndex(([position]) => position >= curvedAmount);
  if (upperIndex <= 0) return PRESSURE_STOPS[0][1].slice();

  const [lowerPosition, lowerColor] = PRESSURE_STOPS[upperIndex - 1];
  const [upperPosition, upperColor] = PRESSURE_STOPS[upperIndex];
  const mix = (curvedAmount - lowerPosition) / (upperPosition - lowerPosition);
  return lowerColor.map((channel, index) => Math.round(
    channel + ((upperColor[index] - channel) * mix),
  ));
}

export function pressureAlpha(amount, maximumAlpha = 235) {
  return Math.round(maximumAlpha * smoothstep(0.004, 0.065, clamp01(amount)));
}

export function trailProgressColor(amount) {
  const progress = smoothstep(0, 1, clamp01(amount));
  return TRAIL_START_COLOR.map((channel, index) => Math.round(
    channel + ((TRAIL_END_COLOR[index] - channel) * progress),
  ));
}

export function orderedMeasuredSteps(steps) {
  return steps
    .filter((step) => !step.isBaseline)
    .slice()
    .sort((left, right) => {
      const leftIndex = Number.isFinite(left.stepIndex) ? left.stepIndex : null;
      const rightIndex = Number.isFinite(right.stepIndex) ? right.stepIndex : null;
      if (leftIndex !== null && rightIndex !== null && leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      return (left.frameIndex || 0) - (right.frameIndex || 0);
    });
}

export function padFootprintStep(step, padding = FOOTPRINT_PADDING_CELLS) {
  const boundedPadding = Math.max(0, Math.floor(padding));
  if (!boundedPadding) return step;

  const rows = step.matrix.length;
  const columns = step.matrix[0]?.length || 0;
  const padded = Array.from(
    { length: rows + (boundedPadding * 2) },
    () => Array(columns + (boundedPadding * 2)).fill(0),
  );

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      padded[row + boundedPadding][column + boundedPadding] = step.matrix[row][column];
    }
  }

  return {
    ...step,
    origin: [
      step.origin[0] - boundedPadding,
      step.origin[1] - boundedPadding,
    ],
    matrix: padded,
  };
}

export function footprintBounds(steps) {
  if (!steps.length) return null;
  let minLateral = Number.POSITIVE_INFINITY;
  let maxLateral = Number.NEGATIVE_INFINITY;
  let minForward = Number.POSITIVE_INFINITY;
  let maxForward = Number.NEGATIVE_INFINITY;

  for (const step of steps) {
    const rows = step.matrix.length;
    const columns = step.matrix[0]?.length || 0;
    minLateral = Math.min(minLateral, step.origin[0]);
    maxLateral = Math.max(maxLateral, step.origin[0] + columns);
    minForward = Math.min(minForward, step.origin[1]);
    maxForward = Math.max(maxForward, step.origin[1] + rows);
  }

  return { minLateral, maxLateral, minForward, maxForward };
}

export function walkingDirectionSign(steps) {
  const measuredSteps = steps
    .filter((step) => !step.isBaseline)
    .slice()
    .sort((left, right) => left.frameIndex - right.frameIndex);
  const forwardDeltas = measuredSteps.slice(1)
    .map((step, index) => step.center[1] - measuredSteps[index].center[1])
    .filter((value) => Math.abs(value) > 1e-6)
    .sort((left, right) => left - right);
  if (!forwardDeltas.length) return 1;

  const middle = Math.floor(forwardDeltas.length / 2);
  const median = forwardDeltas.length % 2
    ? forwardDeltas[middle]
    : (forwardDeltas[middle - 1] + forwardDeltas[middle]) / 2;
  return median < 0 ? -1 : 1;
}

export function projectSensorCenter(center, layout) {
  const lateralCenter = center[0] + 0.5;
  const forwardCenter = center[1] + 0.5;
  const forwardOffset = layout.forwardSign < 0
    ? layout.maxForward - forwardCenter
    : forwardCenter - layout.minForward;

  return {
    x: layout.offsetX + (forwardOffset * layout.scale),
    y: layout.offsetY + ((lateralCenter - layout.minLateral) * layout.scale),
  };
}

export function footprintDrawRect(step, layout) {
  const rows = step.matrix.length;
  const columns = step.matrix[0]?.length || 0;
  const forwardOffset = layout.forwardSign < 0
    ? layout.maxForward - (step.origin[1] + rows)
    : step.origin[1] - layout.minForward;

  return {
    x: layout.offsetX + (forwardOffset * layout.scale),
    y: layout.offsetY + ((step.origin[0] - layout.minLateral) * layout.scale),
    width: rows * layout.scale,
    height: columns * layout.scale,
  };
}

export function gaussianBlurField(values, width, height, sigma) {
  if (!(sigma > 0) || width < 1 || height < 1 || values.length !== width * height) {
    return Float32Array.from(values);
  }

  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array((radius * 2) + 1);
  let kernelSum = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
    kernel[offset + radius] = weight;
    kernelSum += weight;
  }
  for (let index = 0; index < kernel.length; index += 1) {
    kernel[index] /= kernelSum;
  }

  const horizontal = new Float32Array(values.length);
  const output = new Float32Array(values.length);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      let value = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sourceColumn = column + offset;
        if (sourceColumn >= 0 && sourceColumn < width) {
          value += values[(row * width) + sourceColumn] * kernel[offset + radius];
        }
      }
      horizontal[(row * width) + column] = value;
    }
  }

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      let value = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sourceRow = row + offset;
        if (sourceRow >= 0 && sourceRow < height) {
          value += horizontal[(sourceRow * width) + column] * kernel[offset + radius];
        }
      }
      output[(row * width) + column] = value;
    }
  }

  return output;
}
