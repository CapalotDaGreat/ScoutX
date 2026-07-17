/** Monday-based week start helpers shared by analytics and weekly reports. */

export function startOfWeekMonday(date = new Date()): Date {
  const value = new Date(date);
  const day = value.getDay();
  const diff = value.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(value.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function startOfWeekMondayIso(date = new Date()): string {
  return startOfWeekMonday(date).toISOString();
}

export function startOfWeekMondayKey(date = new Date()): string {
  return startOfWeekMonday(date).toISOString().slice(0, 10);
}
