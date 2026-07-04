import {
  DEFAULT_RECRUITMENT_FOLDER_ID,
  RECRUITMENT_STAGES,
} from '@/features/scout-recruitment/constants';
import {
  type RecruitmentDragMetadata,
  type RecruitmentEntry,
  type RecruitmentFolder,
  type RecruitmentFolderDraft,
  type RecruitmentPlayerSnapshot,
  type RecruitmentShortlist,
  type RecruitmentShortlistDraft,
  type RecruitmentStage,
  type RecruitmentWorkspace,
} from '@/features/scout-recruitment/types';
import {
  asRecord,
  parseNumber,
  parseString,
  parseStringList,
} from '@/utils/firestoreParsing';

function parseStage(value: unknown): RecruitmentStage {
  if (typeof value === 'string' && RECRUITMENT_STAGES.includes(value as RecruitmentStage)) {
    return value as RecruitmentStage;
  }
  return 'observed';
}

function parseDragMetadata(
  value: unknown,
  stage: RecruitmentStage,
  sortIndex: number,
): RecruitmentDragMetadata {
  const record = asRecord(value);
  return {
    columnId: parseStage(record?.columnId ?? stage),
    sortIndex: parseNumber(record?.sortIndex, sortIndex),
  };
}

function parseFolder(value: unknown): RecruitmentFolder | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string') {
    return null;
  }
  const now = new Date().toISOString();
  return {
    id: record.id,
    name: parseString(record.name, 'Folder'),
    color: parseString(record.color, '#16A34A'),
    order: parseNumber(record.order),
    createdAt: parseString(record.createdAt, now),
    updatedAt: parseString(record.updatedAt, now),
  };
}

function parseShortlist(value: unknown): RecruitmentShortlist | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string') {
    return null;
  }
  const now = new Date().toISOString();
  return {
    id: record.id,
    name: parseString(record.name, 'Shortlist'),
    description: parseString(record.description),
    folderId: typeof record.folderId === 'string' ? record.folderId : null,
    playerIds: parseStringList(record.playerIds),
    order: parseNumber(record.order),
    createdAt: parseString(record.createdAt, now),
    updatedAt: parseString(record.updatedAt, now),
  };
}

function parseEntry(value: unknown): RecruitmentEntry | null {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.id !== 'string' ||
    typeof record.scoutId !== 'string' ||
    typeof record.playerId !== 'string'
  ) {
    return null;
  }

  const now = new Date().toISOString();
  const stage = parseStage(record.stage);
  const sortIndex = parseNumber(record.sortIndex);

  return {
    id: record.id,
    scoutId: record.scoutId,
    playerId: record.playerId,
    playerName: parseString(record.playerName),
    playerClub: parseString(record.playerClub),
    playerPosition: parseString(record.playerPosition),
    playerAvatarUrl: parseString(record.playerAvatarUrl),
    playerOverallRating: parseNumber(record.playerOverallRating),
    stage,
    folderId: typeof record.folderId === 'string' ? record.folderId : null,
    shortlistIds: parseStringList(record.shortlistIds),
    notes: parseString(record.notes),
    dragMetadata: parseDragMetadata(record.dragMetadata, stage, sortIndex),
    createdAt: parseString(record.createdAt, now),
    updatedAt: parseString(record.updatedAt, now),
  };
}

export function createEmptyWorkspace(scoutId: string): RecruitmentWorkspace {
  const now = new Date().toISOString();
  return {
    scoutId,
    folders: [
      {
        id: DEFAULT_RECRUITMENT_FOLDER_ID,
        name: 'Inbox',
        color: '#16A34A',
        order: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
    shortlists: [],
    entries: [],
    updatedAt: now,
  };
}

export function parseRecruitmentWorkspace(
  value: unknown,
  scoutId: string,
): RecruitmentWorkspace | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const now = new Date().toISOString();
  const folders = Array.isArray(record.folders)
    ? record.folders
        .map(parseFolder)
        .filter((folder): folder is RecruitmentFolder => folder !== null)
    : [];
  const shortlists = Array.isArray(record.shortlists)
    ? record.shortlists
        .map(parseShortlist)
        .filter((shortlist): shortlist is RecruitmentShortlist => shortlist !== null)
    : [];
  const entries = Array.isArray(record.entries)
    ? record.entries
        .map(parseEntry)
        .filter((entry): entry is RecruitmentEntry => entry !== null)
    : [];

  return {
    scoutId: parseString(record.scoutId, scoutId),
    folders: folders.length > 0 ? folders : createEmptyWorkspace(scoutId).folders,
    shortlists,
    entries: normalizeEntryOrdering(entries),
    updatedAt: parseString(record.updatedAt, now),
  };
}

export function serializeRecruitmentWorkspace(workspace: RecruitmentWorkspace): Record<string, unknown> {
  return {
    scoutId: workspace.scoutId,
    folders: workspace.folders,
    shortlists: workspace.shortlists,
    entries: workspace.entries.map((entry) => ({
      ...entry,
      sortIndex: entry.dragMetadata.sortIndex,
    })),
    updatedAt: workspace.updatedAt,
  };
}

export function normalizeEntryOrdering(entries: RecruitmentEntry[]): RecruitmentEntry[] {
  const byStage = new Map<RecruitmentStage, RecruitmentEntry[]>();

  for (const stage of RECRUITMENT_STAGES) {
    byStage.set(stage, []);
  }

  for (const entry of entries) {
    const list = byStage.get(entry.stage) ?? [];
    list.push(entry);
    byStage.set(entry.stage, list);
  }

  const normalized: RecruitmentEntry[] = [];

  for (const stage of RECRUITMENT_STAGES) {
    const stageEntries = [...(byStage.get(stage) ?? [])].sort(
      (a, b) => a.dragMetadata.sortIndex - b.dragMetadata.sortIndex,
    );

    stageEntries.forEach((entry, index) => {
      normalized.push({
        ...entry,
        dragMetadata: {
          columnId: stage,
          sortIndex: index,
        },
      });
    });
  }

  return normalized;
}

function touchWorkspace(workspace: RecruitmentWorkspace): RecruitmentWorkspace {
  return {
    ...workspace,
    entries: normalizeEntryOrdering(workspace.entries),
    updatedAt: new Date().toISOString(),
  };
}

function nextSortIndex(entries: RecruitmentEntry[], stage: RecruitmentStage): number {
  const stageEntries = entries.filter((entry) => entry.stage === stage);
  if (stageEntries.length === 0) {
    return 0;
  }
  return Math.max(...stageEntries.map((entry) => entry.dragMetadata.sortIndex)) + 1;
}

export function buildEntryId(scoutId: string, playerId: string): string {
  return `${scoutId}_${playerId}`;
}

export function addPlayerToWorkspace(
  workspace: RecruitmentWorkspace,
  snapshot: RecruitmentPlayerSnapshot,
  stage: RecruitmentStage = 'observed',
  folderId: string | null = DEFAULT_RECRUITMENT_FOLDER_ID,
): RecruitmentWorkspace {
  const existing = workspace.entries.find((entry) => entry.playerId === snapshot.playerId);
  const now = new Date().toISOString();

  if (existing) {
    return touchWorkspace({
      ...workspace,
      entries: workspace.entries.map((entry) =>
        entry.playerId === snapshot.playerId
          ? {
              ...entry,
              ...snapshot,
              stage,
              folderId: folderId ?? entry.folderId,
              updatedAt: now,
            }
          : entry,
      ),
    });
  }

  const sortIndex = nextSortIndex(workspace.entries, stage);
  const entry: RecruitmentEntry = {
    id: buildEntryId(workspace.scoutId, snapshot.playerId),
    scoutId: workspace.scoutId,
    ...snapshot,
    stage,
    folderId,
    shortlistIds: [],
    notes: '',
    dragMetadata: { columnId: stage, sortIndex },
    createdAt: now,
    updatedAt: now,
  };

  return touchWorkspace({
    ...workspace,
    entries: [...workspace.entries, entry],
  });
}

export function removePlayerFromWorkspace(
  workspace: RecruitmentWorkspace,
  playerId: string,
): RecruitmentWorkspace {
  const nextShortlists = workspace.shortlists.map((shortlist) => ({
    ...shortlist,
    playerIds: shortlist.playerIds.filter((id) => id !== playerId),
    updatedAt: new Date().toISOString(),
  }));

  return touchWorkspace({
    ...workspace,
    shortlists: nextShortlists,
    entries: workspace.entries.filter((entry) => entry.playerId !== playerId),
  });
}

export function moveEntryStage(
  workspace: RecruitmentWorkspace,
  playerId: string,
  nextStage: RecruitmentStage,
): RecruitmentWorkspace {
  const sortIndex = nextSortIndex(workspace.entries, nextStage);
  const now = new Date().toISOString();

  return touchWorkspace({
    ...workspace,
    entries: workspace.entries.map((entry) =>
      entry.playerId === playerId
        ? {
            ...entry,
            stage: nextStage,
            dragMetadata: { columnId: nextStage, sortIndex },
            updatedAt: now,
          }
        : entry,
    ),
  });
}

export function assignEntryFolder(
  workspace: RecruitmentWorkspace,
  playerId: string,
  folderId: string | null,
): RecruitmentWorkspace {
  const now = new Date().toISOString();
  return touchWorkspace({
    ...workspace,
    entries: workspace.entries.map((entry) =>
      entry.playerId === playerId ? { ...entry, folderId, updatedAt: now } : entry,
    ),
  });
}

export function createFolder(
  workspace: RecruitmentWorkspace,
  draft: RecruitmentFolderDraft,
): RecruitmentWorkspace {
  const now = new Date().toISOString();
  const folder: RecruitmentFolder = {
    id: `folder-${Date.now()}`,
    name: draft.name.trim(),
    color: draft.color,
    order: workspace.folders.length,
    createdAt: now,
    updatedAt: now,
  };

  return touchWorkspace({
    ...workspace,
    folders: [...workspace.folders, folder],
  });
}

export function createShortlist(
  workspace: RecruitmentWorkspace,
  draft: RecruitmentShortlistDraft,
): RecruitmentWorkspace {
  const now = new Date().toISOString();
  const shortlist: RecruitmentShortlist = {
    id: `shortlist-${Date.now()}`,
    name: draft.name.trim(),
    description: draft.description?.trim() ?? '',
    folderId: draft.folderId ?? null,
    playerIds: [],
    order: workspace.shortlists.length,
    createdAt: now,
    updatedAt: now,
  };

  return touchWorkspace({
    ...workspace,
    shortlists: [...workspace.shortlists, shortlist],
  });
}

export function addPlayerToShortlist(
  workspace: RecruitmentWorkspace,
  shortlistId: string,
  playerId: string,
): RecruitmentWorkspace {
  const now = new Date().toISOString();

  return touchWorkspace({
    ...workspace,
    shortlists: workspace.shortlists.map((shortlist) =>
      shortlist.id === shortlistId && !shortlist.playerIds.includes(playerId)
        ? {
            ...shortlist,
            playerIds: [...shortlist.playerIds, playerId],
            updatedAt: now,
          }
        : shortlist,
    ),
    entries: workspace.entries.map((entry) =>
      entry.playerId === playerId && !entry.shortlistIds.includes(shortlistId)
        ? {
            ...entry,
            shortlistIds: [...entry.shortlistIds, shortlistId],
            updatedAt: now,
          }
        : entry,
    ),
  });
}

export function removePlayerFromShortlist(
  workspace: RecruitmentWorkspace,
  shortlistId: string,
  playerId: string,
): RecruitmentWorkspace {
  const now = new Date().toISOString();

  return touchWorkspace({
    ...workspace,
    shortlists: workspace.shortlists.map((shortlist) =>
      shortlist.id === shortlistId
        ? {
            ...shortlist,
            playerIds: shortlist.playerIds.filter((id) => id !== playerId),
            updatedAt: now,
          }
        : shortlist,
    ),
    entries: workspace.entries.map((entry) =>
      entry.playerId === playerId
        ? {
            ...entry,
            shortlistIds: entry.shortlistIds.filter((id) => id !== shortlistId),
            updatedAt: now,
          }
        : entry,
    ),
  });
}

export function reorderEntryWithinStage(
  workspace: RecruitmentWorkspace,
  playerId: string,
  targetSortIndex: number,
): RecruitmentWorkspace {
  const entry = workspace.entries.find((item) => item.playerId === playerId);
  if (!entry) {
    return workspace;
  }

  const stageEntries = workspace.entries
    .filter((item) => item.stage === entry.stage)
    .sort((a, b) => a.dragMetadata.sortIndex - b.dragMetadata.sortIndex);

  const without = stageEntries.filter((item) => item.playerId !== playerId);
  const clampedIndex = Math.max(0, Math.min(targetSortIndex, without.length));
  without.splice(clampedIndex, 0, entry);

  const indexMap = new Map(
    without.map((item, index) => [item.playerId, index] as const),
  );

  const now = new Date().toISOString();

  return touchWorkspace({
    ...workspace,
    entries: workspace.entries.map((item) => {
      const nextIndex = indexMap.get(item.playerId);
      if (nextIndex === undefined || item.stage !== entry.stage) {
        return item;
      }
      return {
        ...item,
        dragMetadata: { columnId: item.stage, sortIndex: nextIndex },
        updatedAt: now,
      };
    }),
  });
}

export function groupEntriesByStage(
  entries: RecruitmentEntry[],
): Record<RecruitmentStage, RecruitmentEntry[]> {
  const grouped = Object.fromEntries(
    RECRUITMENT_STAGES.map((stage) => [stage, [] as RecruitmentEntry[]]),
  ) as Record<RecruitmentStage, RecruitmentEntry[]>;

  for (const entry of entries) {
    grouped[entry.stage].push(entry);
  }

  for (const stage of RECRUITMENT_STAGES) {
    grouped[stage].sort((a, b) => a.dragMetadata.sortIndex - b.dragMetadata.sortIndex);
  }

  return grouped;
}

export function toPlayerSnapshot(player: {
  id: string;
  fullName: string;
  club: string;
  position: string[];
  avatarUrl: string;
  overallRating: number;
}): RecruitmentPlayerSnapshot {
  return {
    playerId: player.id,
    playerName: player.fullName,
    playerClub: player.club,
    playerPosition: player.position.join(' / '),
    playerAvatarUrl: player.avatarUrl,
    playerOverallRating: player.overallRating,
  };
}
