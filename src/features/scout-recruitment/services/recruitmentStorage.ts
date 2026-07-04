import { RECRUITMENT_STORAGE_KEY } from '@/features/scout-recruitment/constants';
import { parseRecruitmentWorkspace } from '@/features/scout-recruitment/models/RecruitmentModel';
import { type RecruitmentWorkspace } from '@/features/scout-recruitment/types';
import { loadScopedValue, saveScopedValue } from '@/data/scopedAsyncStorage';

export async function loadLocalRecruitmentWorkspace(
  scoutId: string,
): Promise<RecruitmentWorkspace | null> {
  return loadScopedValue(
    RECRUITMENT_STORAGE_KEY,
    scoutId,
    (value) => parseRecruitmentWorkspace(value, scoutId),
    () => null,
  );
}

export async function saveLocalRecruitmentWorkspace(
  workspace: RecruitmentWorkspace,
): Promise<void> {
  await saveScopedValue(RECRUITMENT_STORAGE_KEY, workspace.scoutId, workspace);
}
