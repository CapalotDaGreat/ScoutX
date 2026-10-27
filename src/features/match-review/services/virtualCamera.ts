/**
 * 5.0 player focus: a smooth virtual camera that keeps the followed player near the centre of the
 * player view - only from the tracked outline (the same evidence as the yellow box), only on
 * moments that have one, and never so tight that the football context disappears:
 *   - zoom is capped at MAX_ZOOM and so that at least CONTEXT_BODY_HEIGHTS of the player's height
 *     stay visible vertically;
 *   - the frame edge never enters the view (no black borders), so near the edge the player is
 *     simply off-centre;
 *   - the centre is smoothed over time (moving average over SMOOTH_SEC) to avoid jitter.
 * "Full field" is the same player with zoom 1.
 */
export const MAX_ZOOM = 2;
export const CONTEXT_BODY_HEIGHTS = 6;
export const SMOOTH_SEC = 1.2;

export type IndicatorPoint = [number, number, number, number, number]; // t, x, y, w, h (normalised)
export type Rect = { x: number; y: number; w: number; h: number };
export type CameraTransform = { scale: number; translateX: number; translateY: number };

const IDENTITY: CameraTransform = { scale: 1, translateX: 0, translateY: 0 };

/** Smoothed player centre and height at time t (normalised), or null without nearby evidence. */
export function smoothedTarget(indicator: IndicatorPoint[] | undefined, t: number, maxGap = 1.0): { cx: number; cy: number; h: number } | null {
  if (!indicator || indicator.length === 0) return null;
  const near = indicator.filter((p) => Math.abs(p[0] - t) <= SMOOTH_SEC / 2);
  const pts = near.length > 0 ? near : indicator.filter((p) => Math.abs(p[0] - t) <= maxGap);
  if (pts.length === 0) return null;
  let wsum = 0;
  let cx = 0;
  let cy = 0;
  let h = 0;
  for (const [pt, x, y, w, hh] of pts) {
    const wt = 1 / (1 + Math.abs(pt - t)); // closer samples count more
    wsum += wt;
    cx += wt * (x + w / 2);
    cy += wt * (y + hh / 2);
    h += wt * hh;
  }
  return { cx: cx / wsum, cy: cy / wsum, h: h / wsum };
}

/**
 * Transform for a view of size `view` showing the video in `rect` (contain-fit). Apply as
 * [{ translateX }, { translateY }, { scale }] around the view centre.
 */
export function focusTransform(target: { cx: number; cy: number; h: number } | null, view: { w: number; h: number },
  rect: Rect | null, zoom = MAX_ZOOM): CameraTransform {
  if (!target || !rect || view.w <= 0 || view.h <= 0 || target.h <= 0) return IDENTITY;
  const playerPx = target.h * rect.h;
  const contextCap = view.h / (playerPx * CONTEXT_BODY_HEIGHTS);
  const scale = Math.max(1, Math.min(zoom, MAX_ZOOM, contextCap));
  if (scale <= 1.001) return IDENTITY;
  // player position relative to the view centre, before scaling
  const px = rect.x + target.cx * rect.w - view.w / 2;
  const py = rect.y + target.cy * rect.h - view.h / 2;
  // translation that brings the player to the centre after scaling about the centre
  let tx = -px * scale;
  let ty = -py * scale;
  // keep the scaled video covering the view where the video covers it (no new empty borders)
  const maxX = Math.max(0, (rect.w * scale - view.w) / 2);
  const maxY = Math.max(0, (rect.h * scale - view.h) / 2);
  tx = Math.max(-maxX, Math.min(maxX, tx));
  ty = Math.max(-maxY, Math.min(maxY, ty));
  return { scale: Math.round(scale * 1000) / 1000, translateX: Math.round(tx * 10) / 10, translateY: Math.round(ty * 10) / 10 };
}
