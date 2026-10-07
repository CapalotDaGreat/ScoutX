import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { projectDiscoverablePlayer } from '../discoveryProjection';
import { projectPassport } from '../publicPassport';

/** Age band or guardian scope changes immediately add or withdraw public projections. */
export const onUserSafetyWrittenReproject = onDocumentWritten('userSafety/{uid}', async (event) => {
  const uid = event.params.uid;
  const profile = await getFirestore().collection('profiles').doc(uid).get();
  await projectPassport(uid, profile.exists ? (profile.data() as Record<string, unknown>) : undefined);
  await projectDiscoverablePlayer(uid);
});
