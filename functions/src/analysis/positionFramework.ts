export const POSITION_FOCUS = {
  GK: ['set position relative to ball', 'handling when contact is visible', 'distribution options', 'sweeping starting position'],
  CB: ['cover and defensive line', 'body orientation in duels', 'build-up passing lanes'],
  LB: ['left-side defensive cover', 'support width', 'overlap timing'],
  RB: ['right-side defensive cover', 'support width', 'overlap timing'],
  LWB: ['left-side recovery position', 'width in possession', 'cover behind advances'],
  RWB: ['right-side recovery position', 'width in possession', 'cover behind advances'],
  CDM: ['screening central lanes', 'receiving orientation', 'support behind the ball'],
  CM: ['support angles', 'receiving under pressure', 'transition positioning'],
  CAM: ['space between lines', 'visible forward options', 'support near the penalty area'],
  LM: ['left midfield width', 'defensive cover', 'inside support options'],
  RM: ['right midfield width', 'defensive cover', 'inside support options'],
  LW: ['left attacking width', 'isolation body shape', 'box support'],
  RW: ['right attacking width', 'isolation body shape', 'box support'],
  CF: ['link-up support', 'receiving between defenders', 'space creation'],
  ST: ['position relative to last defender', 'box positioning', 'finishing setup when visible'],
} as const;

export type EvaluationPosition = keyof typeof POSITION_FOCUS;

export function resolveEvaluationPosition(value: unknown): EvaluationPosition | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toUpperCase();
  if (key === 'GOALKEEPER') return 'GK';
  return Object.prototype.hasOwnProperty.call(POSITION_FOCUS, key) ? key as EvaluationPosition : null;
}

/** Evaluation lenses, never an assertion that the nominated role was observed. */
export function positionEvaluationInstructions(targeting: Record<string, unknown>): string[] {
  const position = resolveEvaluationPosition(targeting.position);
  return [
    position ? `Nominated role ${position}. Evaluate only supported aspects: ${POSITION_FOCUS[position].join('; ')}.`
      : 'Specific role unknown. Broad defender/midfielder/forward groups do not establish a specific position; do not guess one.',
    'Role changes are unknown unless cited observations establish the new role and its recording interval. Do not apply one role to the whole match by default.',
    'For each supported coaching point connect observation, role relevance, improvement, concrete drill and observable practice success criterion. Cite supplied evidence IDs.',
    'Separate visible body shape and positioning from inferred intent. Scanning, movement, outcomes and communication require temporal or explicit evidence; a still alone cannot establish them.',
    'Missing role evidence means not assessed, never a weakness or zero rating. Do not generate position scores, rankings or invented performance ratings.',
  ];
}
