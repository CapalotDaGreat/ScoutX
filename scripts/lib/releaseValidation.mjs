/** Only the state column counts; notes describing a previous failure are not current failures. */
export function validationStates(markdown) {
  let stateColumn = -1;
  const result = { failed: 0, pending: 0 };
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) { stateColumn = -1; continue; }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    const header = cells.indexOf('State');
    if (header !== -1) { stateColumn = header; continue; }
    const state = cells[stateColumn] ?? '';
    if (/^FAIL(?:\s*\([^)]*\))?$/.test(state)) result.failed += 1;
    if (state === 'NOT VALIDATED') result.pending += 1;
  }
  return result;
}
