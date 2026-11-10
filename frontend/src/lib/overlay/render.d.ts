import type { Timeline } from "../studio";

export interface Box { id: string; cx: number; cy: number; w: number; h: number; rot: number }
export const FONTS: Record<"phudu" | "inter" | "serif", { family: string; weight: number; style: string; label: string }>;
export const ICONS: string[];
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  tl: Timeline,
  t: number,
  W: number,
  H: number,
  opts?: { images?: Map<string, HTMLImageElement>; selected?: string | null },
): Box[];
export function hitTest(boxes: Box[], px: number, py: number): Box | null;
export function isActive(it: { start: number; end: number; hidden?: boolean }, t: number): boolean;
export function activeRanges(tl: Timeline): [number, number][];
export function runsOf(text: string): { s: string; em: boolean }[];
