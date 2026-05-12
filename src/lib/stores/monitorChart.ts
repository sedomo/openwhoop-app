export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartState {
  chartPath: string;
  glowPath: string;
  latestPoint: ChartPoint | null;
}

export const emptyChartState: ChartState = {
  chartPath: "",
  glowPath: "",
  latestPoint: null,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function buildChartState<T>(
  samples: T[],
  getY: (sample: T) => number,
): ChartState {
  if (samples.length === 0) {
    return emptyChartState;
  }

  const sourceSamples = samples.length === 1 ? [samples[0], samples[0]] : samples;
  const points = sourceSamples.map((sample, index) => {
    const x =
      sourceSamples.length === 1
        ? 0
        : (index / (sourceSamples.length - 1)) * 92;

    return {
      x,
      y: clamp(getY(sample), 24, 84),
    };
  });
  const latestPoint = points[points.length - 1] ?? null;
  const chartPath = points
    .map(
      (point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
    )
    .join(" ");

  return {
    chartPath,
    glowPath: chartPath ? `${chartPath} L 92 92 L 0 92 Z` : "",
    latestPoint,
  };
}
