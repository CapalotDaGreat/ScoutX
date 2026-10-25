export type NormalizedTargetBox = { x: number; y: number; width: number; height: number };
export type TargetPoint = { x: number; y: number };
export type TargetSize = { width: number; height: number };

export function parseNormalizedTargetBox(value: unknown): NormalizedTargetBox | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 4 || !['x', 'y', 'width', 'height'].every(key => keys.includes(key))) return null;
  const { x, y, width, height } = value as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') return null;
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) return null;
  return { x, y, width, height };
}

export function containImageRect(container: TargetSize, image: TargetSize): NormalizedTargetBox | null {
  if (![container.width, container.height, image.width, image.height].every(n => Number.isFinite(n) && n > 0)) return null;
  const scale = Math.min(container.width / image.width, container.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  if (![width, height].every(n => Number.isFinite(n) && n > 0)) return null;
  return { x: (container.width - width) / 2, y: (container.height - height) / 2, width, height };
}

export function containPointToNormalized(point: TargetPoint, container: TargetSize, image: TargetSize): TargetPoint | null {
  const rect = containImageRect(container, image);
  if (!rect || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const x = (point.x - rect.x) / rect.width;
  const y = (point.y - rect.y) / rect.height;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}

export function cornersToNormalizedBox(first: TargetPoint, second: TargetPoint): NormalizedTargetBox | null {
  if (![first.x, first.y, second.x, second.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) return null;
  return parseNormalizedTargetBox({ x: Math.min(first.x, second.x), y: Math.min(first.y, second.y), width: Math.abs(second.x - first.x), height: Math.abs(second.y - first.y) });
}
