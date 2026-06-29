const LINE_CHART_WIDTH = 640;
const LINE_CHART_HEIGHT = 240;
const LINE_CHART_PADDING = 32;
const LINE_CHART_LABEL_COUNT = 5;
const LINE_CHART_Y_TICK_COUNT = 4;
const SMALL_RANGE_Y_TICK_COUNT = 3;

const resolveLegendRoundingStep = (maxValue) => {
  if (maxValue <= 0) {
    return 10;
  }

  if (maxValue < 100) {
    return 10;
  }

  const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
  return Math.max(10, magnitude);
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const buildSmoothPath = (points, smoothing = 0.2, bounds = null) => {
  if (points.length === 0) {
    return "";
  }

  const controlPoint = (current, previous, next, reverse = false) => {
    const previousPoint = previous || current;
    const nextPoint = next || current;
    const length = Math.hypot(
      nextPoint.x - previousPoint.x,
      nextPoint.y - previousPoint.y,
    );
    const angle =
      Math.atan2(nextPoint.y - previousPoint.y, nextPoint.x - previousPoint.x) +
      (reverse ? Math.PI : 0);
    const controlLength = length * smoothing;

    const boundedY = bounds
      ? clamp(
          current.y + Math.sin(angle) * controlLength,
          bounds.minY,
          bounds.maxY,
        )
      : current.y + Math.sin(angle) * controlLength;

    return {
      x: current.x + Math.cos(angle) * controlLength,
      y: boundedY,
    };
  };

  return points.reduce((path, point, index, allPoints) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }

    const previousPoint = allPoints[index - 1];
    const nextPoint = allPoints[index + 1];
    const controlPointStart = controlPoint(
      previousPoint,
      allPoints[index - 2],
      point,
    );
    const controlPointEnd = controlPoint(point, previousPoint, nextPoint, true);

    return `${path} C ${controlPointStart.x} ${controlPointStart.y} ${controlPointEnd.x} ${controlPointEnd.y} ${point.x} ${point.y}`;
  }, "");
};

const buildLineChartData = (
  current = [],
  previous = [],
  chartWidth = LINE_CHART_WIDTH,
  options = {},
) => {
  const providedMaxValue =
    typeof options.maxValue === "number" && Number.isFinite(options.maxValue)
      ? options.maxValue
      : null;
  const maxValue = Math.max(
    0,
    providedMaxValue ?? 0,
    ...current.map((item) => item.value ?? 0),
    ...previous.map((item) => item.value ?? 0),
  );
  const width = Math.max(Math.round(chartWidth), LINE_CHART_PADDING * 2 + 1);
  const height = LINE_CHART_HEIGHT;
  const padding = LINE_CHART_PADDING;
  const innerWidth = Math.max(width - padding * 2, 1);
  const innerHeight = Math.max(height - padding * 2, 1);
  const totalItems = Math.max(current.length, previous.length);
  const totalPoints = Math.max(totalItems - 1, 1);
  const legendRoundingStep = resolveLegendRoundingStep(maxValue);
  const roundedMaxValue =
    maxValue > 0
      ? Math.ceil(maxValue / legendRoundingStep) * legendRoundingStep
      : legendRoundingStep;
  const yTickCount =
    maxValue > 0 && maxValue < 100
      ? SMALL_RANGE_Y_TICK_COUNT
      : LINE_CHART_Y_TICK_COUNT;

  const resolveLabel = (index) =>
    current[index]?.bucket ?? previous[index]?.bucket ?? "";
  const resolveValue = (series, index) => series[index]?.value ?? 0;

  const buildPoints = (valueSelector) =>
    Array.from({ length: totalItems }, (_, index) => {
      const currentValue = resolveValue(current, index);
      const previousValue = resolveValue(previous, index);
      const value = valueSelector(currentValue, previousValue);
      const x = padding + (innerWidth * index) / totalPoints;
      const y =
        height -
        padding -
        (roundedMaxValue ? (value / roundedMaxValue) * innerHeight : 0);
      return {
        x,
        y,
        label: resolveLabel(index),
        currentValue,
        previousValue,
      };
    });

  const currentPoints = buildPoints((currentValue) => currentValue);
  const previousPoints = buildPoints((_, previousValue) => previousValue);

  const baselineY = height - padding;
  const curveBounds = {
    minY: padding,
    maxY: baselineY,
  };
  const currentLinePath = buildSmoothPath(currentPoints, 0.2, curveBounds);
  const previousLinePath = buildSmoothPath(previousPoints, 0.2, curveBounds);
  const currentAreaPath =
    currentPoints.length > 0
      ? `${currentLinePath} L ${
          currentPoints[currentPoints.length - 1].x
        } ${baselineY} L ${currentPoints[0].x} ${baselineY} Z`
      : "";

  const labelCount = Math.min(LINE_CHART_LABEL_COUNT, totalItems);
  const labelIndices = new Set();
  if (labelCount <= 1) {
    labelIndices.add(0);
  } else {
    const step = (totalItems - 1) / (labelCount - 1);
    for (let i = 0; i < labelCount; i += 1) {
      labelIndices.add(Math.round(i * step));
    }
  }

  const xLabels = Array.from({ length: totalItems }, (_, index) => {
    if (!labelIndices.has(index)) {
      return null;
    }
    return {
      x: padding + (innerWidth * index) / totalPoints,
      label: resolveLabel(index),
    };
  }).filter(Boolean);

  const yTicks = Array.from({ length: yTickCount }, (_, index) => {
    if (yTickCount <= 1) {
      return {
        y: padding,
        value: roundedMaxValue,
      };
    }
    const ratio = index / (yTickCount - 1);
    return {
      y: padding + innerHeight * ratio,
      value: Math.round(roundedMaxValue * (1 - ratio)),
    };
  });

  return {
    currentPoints,
    previousPoints,
    currentLinePath,
    previousLinePath,
    currentAreaPath,
    maxValue,
    width,
    height,
    padding,
    baselineY,
    xLabels,
    yTicks,
  };
};

export {
  LINE_CHART_HEIGHT,
  LINE_CHART_LABEL_COUNT,
  LINE_CHART_PADDING,
  LINE_CHART_WIDTH,
  LINE_CHART_Y_TICK_COUNT,
  buildLineChartData,
  buildSmoothPath,
};
