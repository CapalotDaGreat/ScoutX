import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { RECRUITMENT_WORKSPACE_COLLECTION } from '@/features/scout-recruitment/constants';
import {
  addPlayerToShortlist,
  addPlayerToWorkspace,
  assignEntryFolder,
  createEmptyWorkspace,
  createFolder,
  createShortlist,
  moveEntryStage,
  normalizeEntryOrdering,
  parseRecruitmentWorkspace,
  removePlayerFromShortlist,
  removePlayerFromWorkspace,
  reorderEntryWithinStage,
  serializeRecruitmentWorkspace,
  updateEntryTrialMetadata,
} from '@/features/scout-recruitment/models/RecruitmentModel';
import {
  loadLocalRecruitmentWorkspace,
  saveLocalRecruitmentWorkspace,
} from '@/features/scout-recruitment/services/recruitmentStorage';
import { buildDemoRecruitmentWorkspace } from '@/features/scout-recruitment/services/mockRecruitmentData';
import {
  type RecruitmentFolderDraft,
  type RecruitmentPlayerSnapshot,
  type RecruitmentShortlistDraft,
  type RecruitmentStage,
  type RecruitmentWorkspace,
} from '@/features/scout-recruitment/types';

export class RecruitmentRepository {
  private static instance: RecruitmentRepository | null = null;

  private constructor() {}

  public static getInstance(): RecruitmentRepository {
    if (!this.instance) {
      this.instance = new RecruitmentRepository();
    }
    return this.instance;
  }

  public subscribeToWorkspace(
    scoutId: string,
    callback: (workspace: RecruitmentWorkspace) => void,
    onError?: (error: Error) => void,
  ): () => void {
    const db = getFirestoreDb();

    if (!db) {
      void this.loadWorkspace(scoutId).then(callback);
      return () => undefined;
    }

    const workspaceRef = doc(db, RECRUITMENT_WORKSPACE_COLLECTION, scoutId);

    return onSnapshot(
      workspaceRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          void this.seedWorkspace(scoutId).then(callback);
          return;
        }

        const parsed = parseRecruitmentWorkspace(snapshot.data(), scoutId);
        callback(parsed ?? createEmptyWorkspace(scoutId));
      },
      (error) => {
        void this.loadWorkspace(scoutId).then(callback);
        onError?.(error);
      },
    );
  }

  public async loadWorkspace(scoutId: string): Promise<RecruitmentWorkspace> {
    const db = getFirestoreDb();

    if (db) {
      try {
        const workspaceRef = doc(db, RECRUITMENT_WORKSPACE_COLLECTION, scoutId);
        const snapshot = await getDoc(workspaceRef);
        if (snapshot.exists()) {
          const parsed = parseRecruitmentWorkspace(snapshot.data(), scoutId);
          if (parsed) {
            return parsed;
          }
        }
      } catch {
        // Fall through to local storage.
      }
    }

    const local = await loadLocalRecruitmentWorkspace(scoutId);
    if (local) {
      return local;
    }

    return this.seedWorkspace(scoutId);
  }

  public async saveWorkspace(workspace: RecruitmentWorkspace): Promise<RecruitmentWorkspace> {
    const normalized: RecruitmentWorkspace = {
      ...workspace,
      entries: normalizeEntryOrdering(workspace.entries),
      updatedAt: new Date().toISOString(),
    };

    const db = getFirestoreDb();

    if (db) {
      try {
        await setDoc(
          doc(db, RECRUITMENT_WORKSPACE_COLLECTION, normalized.scoutId),
          serializeRecruitmentWorkspace(normalized),
        );
        const entriesRef = collection(
          db,
          RECRUITMENT_WORKSPACE_COLLECTION,
          normalized.scoutId,
          'entries',
        );
        const existing = await getDocs(entriesRef);
        const keep = new Set(normalized.entries.map((entry) => entry.playerId));
        await Promise.all([
          ...normalized.entries.map((entry) =>
            setDoc(doc(entriesRef, entry.playerId), {
              ...entry,
              scoutId: normalized.scoutId,
              playerId: entry.playerId,
            }),
          ),
          ...existing.docs
            .filter((snapshot) => !keep.has(snapshot.id))
            .map((snapshot) => deleteDoc(snapshot.ref)),
        ]);
        return normalized;
      } catch {
        // Fall through to local storage.
      }
    }

    await saveLocalRecruitmentWorkspace(normalized);
    return normalized;
  }

  public async savePlayer(
    scoutId: string,
    snapshot: RecruitmentPlayerSnapshot,
    stage: RecruitmentStage = 'discovered',
    folderId?: string | null,
  ): Promise<RecruitmentWorkspace> {
    const workspace = await this.loadWorkspace(scoutId);
    const next = addPlayerToWorkspace(workspace, snapshot, stage, folderId ?? null);
    return this.saveWorkspace(next);
  }

  public async removePlayer(scoutId: string, playerId: string): Promise<RecruitmentWorkspace> {
    const workspace = await this.loadWorkspace(scoutId);
    return this.saveWorkspace(removePlayerFromWorkspace(workspace, playerId));
  }

  public async movePlayerStage(
    scoutId: string,
    playerId: string,
    stage: RecruitmentStage,
  ): Promise<RecruitmentWorkspace> {
    const workspace = await this.loadWorkspace(scoutId);
    return this.saveWorkspace(moveEntryStage(workspace, playerId, stage));
  }

  public async assignFolder(
    scoutId: string,
    playerId: string,
    folderId: string | null,
  ): Promise<RecruitmentWorkspace> {
    const workspace = await this.loadWorkspace(scoutId);
    return this.saveWorkspace(assignEntryFolder(workspace, playerId, folderId));
  }

  public async addFolder(
    scoutId: string,
    draft: RecruitmentFolderDraft,
  ): Promise<RecruitmentWorkspace> {
    const workspace = await this.loadWorkspace(scoutId);
    return this.saveWorkspace(createFolder(workspace, draft));
  }

  public async addShortlist(
    scoutId: string,
    draft: RecruitmentShortlistDraft,
  ): Promise<RecruitmentWorkspace> {
    const workspace = await this.loadWorkspace(scoutId);
    return this.saveWorkspace(createShortlist(workspace, draft));
  }

  public async addToShortlist(
    scoutId: string,
    shortlistId: string,
    playerId: string,
  ): Promise<RecruitmentWorkspace> {
    const workspace = await this.loadWorkspace(scoutId);
    return this.saveWorkspace(addPlayerToShortlist(workspace, shortlistId, playerId));
  }

  public async removeFromShortlist(
    scoutId: string,
    shortlistId: string,
    playerId: string,
  ): Promise<RecruitmentWorkspace> {
    const workspace = await this.loadWorkspace(scoutId);
    return this.saveWorkspace(removePlayerFromShortlist(workspace, shortlistId, playerId));
  }

  public async reorderWithinStage(
    scoutId: string,
    playerId: string,
    targetSortIndex: number,
  ): Promise<RecruitmentWorkspace> {
    const workspace = await this.loadWorkspace(scoutId);
    return this.saveWorkspace(reorderEntryWithinStage(workspace, playerId, targetSortIndex));
  }

  public async updateTrialLink(
    scoutId: string,
    playerId: string,
    trialInvitationId: string,
    notes: string,
  ): Promise<RecruitmentWorkspace> {
    const workspace = await this.loadWorkspace(scoutId);
    return this.saveWorkspace(
      updateEntryTrialMetadata(workspace, playerId, trialInvitationId, notes),
    );
  }

  private async seedWorkspace(scoutId: string): Promise<RecruitmentWorkspace> {
    const seeded =
      scoutId === 'demo-scout' ? buildDemoRecruitmentWorkspace(scoutId) : createEmptyWorkspace(scoutId);
    return this.saveWorkspace(seeded);
  }
}
