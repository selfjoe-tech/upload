
import path from "node:path";

import type {
  WatermarkSegment,
  WatermarkPosition,
} from "./scheduler";

function escapeFilterPath(value: string) {
  /*
   * FFmpeg filter paths on Windows:
   *
   * C:\Users\user\file.ttf
   *
   * becomes:
   *
   * C\:/Users/user/file.ttf
   */
  return value
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:");
}

function escapeFilterText(value: string) {
  /*
   * drawtext uses ':' to separate options.
   * Escape characters that could interfere with
   * the filter parser.
   */
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%");
}

function positionExpressions(
  position: WatermarkPosition
) {
  /*
   * 4% of the smaller dimension, with a minimum
   * safe margin of 24px.
   */
  const margin =
    "max(24\\,min(w\\,h)*0.04)";

  switch (position) {
    case "top-left":
      return {
        x: margin,
        y: margin,
      };

    case "top-center":
      return {
        x: "(w-tw)/2",
        y: margin,
      };

    case "top-right":
      return {
        x: `w-tw-${margin}`,
        y: margin,
      };

    case "middle-left":
      return {
        x: margin,
        y: "(h-th)/2",
      };

    case "center":
      return {
        x: "(w-tw)/2",
        y: "(h-th)/2",
      };

    case "middle-right":
      return {
        x: `w-tw-${margin}`,
        y: "(h-th)/2",
      };

    case "bottom-left":
      return {
        x: margin,
        y: `h-th-${margin}`,
      };

    case "bottom-center":
      return {
        x: "(w-tw)/2",
        y: `h-th-${margin}`,
      };

    case "bottom-right":
      return {
        x: `w-tw-${margin}`,
        y: `h-th-${margin}`,
      };
  }
}

function buildTimeExpression(
  schedule: WatermarkSegment[],
  selector: "x" | "y"
) {
  if (schedule.length === 0) {
    return "0";
  }

  let expression =
    positionExpressions(
      schedule[schedule.length - 1].position
    )[selector];

  for (
    let i = schedule.length - 2;
    i >= 0;
    i--
  ) {
    const segment = schedule[i];

    const coordinate =
      positionExpressions(
        segment.position
      )[selector];

    expression =
      `if(lt(t\\,${segment.end})\\,${coordinate}\\,${expression})`;
  }

  return expression;
}

export function buildWatermarkFilter({
  schedule,
  text,
  fontFile,
}: {
  schedule: WatermarkSegment[];
  text: string;
  fontFile: string;
}) {
  const safeText =
    escapeFilterText(text);

  const safeFontFile =
    escapeFilterPath(fontFile);

  const x =
    buildTimeExpression(
      schedule,
      "x"
    );

  const y =
    buildTimeExpression(
      schedule,
      "y"
    );

  /*
   * Scale watermark relative to the video.
   */
  const fontSize =
    "min(w\\,h)*0.035";

  /*
   * IMPORTANT:
   *
   * drawtext options are separated by ':'
   * NOT ','.
   */
  return [
    "drawtext=",
    `fontfile='${safeFontFile}':`,
    `text='${safeText}':`,
    `fontsize=${fontSize}:`,
    "fontcolor=white@0.82:",
    "borderw=2:",
    "bordercolor=black@0.45:",
    "shadowx=1:",
    "shadowy=1:",
    "shadowcolor=black@0.75:",
    `x=${x}:`,
    `y=${y}:`,
    "fix_bounds=1",
  ].join("");
}

export function getFontPath() {
  return path.join(
    process.cwd(),
    "public",
    "fonts",
    "Inter-Regular.ttf"
  );
}

