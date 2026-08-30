export type WatermarkPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type WatermarkSegment = {
  start: number;
  end: number;
  position: WatermarkPosition;
};

const POSITIONS: WatermarkPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

function hashString(value: string): number {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mulberry32(seed: number) {
  return function random() {
    let t = (seed += 0x6d2b79f5);

    t = Math.imul(
      t ^ (t >>> 15),
      t | 1
    );

    t ^= t + Math.imul(
      t ^ (t >>> 7),
      t | 61
    );

    return (
      ((t ^ (t >>> 14)) >>> 0) /
      4294967296
    );
  };
}

function choosePosition(
  random: () => number,
  previous: WatermarkPosition | null
): WatermarkPosition {
  let candidates = POSITIONS.filter(
    (position) => position !== previous
  );

  /*
   * Avoid putting the watermark directly in the centre
   * too frequently. It remains available, but is only
   * selected when the random choice lands on it.
   */
  if (candidates.length > 3 && random() < 0.65) {
    candidates = candidates.filter(
      (position) => position !== "center"
    );
  }

  return candidates[
    Math.floor(random() * candidates.length)
  ];
}

export function createWatermarkSchedule({
  duration,
  seed,
}: {
  duration: number;
  seed: string;
}): WatermarkSegment[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [];
  }

  const random = mulberry32(hashString(seed));

  /*
   * The target interval grows/shrinks within a sensible
   * range rather than using one hard-coded value.
   */
  const targetInterval = Math.max(
    3.5,
    Math.min(
      6.5,
      duration / Math.max(
        1,
        Math.ceil(duration / 5)
      )
    )
  );

  const segmentCount =
    duration <= 4
      ? 1
      : Math.max(
          1,
          Math.ceil(duration / targetInterval)
        );

  if (segmentCount === 1) {
    return [
      {
        start: 0,
        end: duration,
        position: choosePosition(random, null),
      },
    ];
  }

  const baseInterval = duration / segmentCount;

  const schedule: WatermarkSegment[] = [];

  let previous: WatermarkPosition | null = null;

  for (let i = 0; i < segmentCount; i++) {
    const start = i * baseInterval;
    const end =
      i === segmentCount - 1
        ? duration
        : (i + 1) * baseInterval;

    const position = choosePosition(
      random,
      previous
    );

    schedule.push({
      start,
      end,
      position,
    });

    previous = position;
  }

  return schedule;
}