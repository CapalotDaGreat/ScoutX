export const RADAR_GRID_LEVELS = [0.25, 0.5, 0.75, 1] as const;

export function getRadarCoordinate(
  center: number,
  index: number,
  total: number,
  distance: number,
): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  return {
    x: center + Math.cos(angle) * distance,
    y: center + Math.sin(angle) * distance,
  };
}

export function toRadarPointString(coordinates: Array<{ x: number; y: number }>): string {
  return coordinates.map((coordinate) => `${coordinate.x},${coordinate.y}`).join(' ');
}
