import { requireFn } from './lib.mjs';

const projectId = 'pitchproof-stg-pilot2';
const storageBucket = projectId + '.firebasestorage.app';
const { initializeApp } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
const { getAuth } = requireFn('firebase-admin/auth');
const { getStorage } = requireFn('firebase-admin/storage');

const app = initializeApp({ projectId, storageBucket });
const db = getFirestore(app);
const auth = getAuth(app);
const bucket = getStorage(app).bucket();
const syntheticEmail = /^(?:pt[a-z0-9]+-owner|ir[a-z0-9]+-(?:owner|other))@pitchproof-staging\.invalid$/;

async function syntheticUsers() {
  const result = [];
  let token;
  do {
    const page = await auth.listUsers(1000, token);
    result.push(...page.users.filter((user) => syntheticEmail.test(user.email ?? '')));
    token = page.pageToken;
  } while (token);
  return result;
}

for (const user of await syntheticUsers()) {
  const run = user.email.split('-')[0];
  const jobs = await db.collection('matchAnalysisJobs').where('syntheticRun', '==', run).get();
  for (const job of jobs.docs) {
    if (job.get('playerId') !== user.uid) continue;
    await db.recursiveDelete(job.ref);
    await db.doc('videoProcessingConsents/' + job.id).delete();
  }
  for (const [collection, field] of [['dataExports', 'uid'], ['activities', 'recipientId']]) {
    const query = db.collection(collection).where(field, '==', user.uid);
    for (const record of (await query.get()).docs) await db.recursiveDelete(record.ref);
    if (!(await query.limit(1).get()).empty) throw new Error('Synthetic records remain in ' + collection);
  }
  for (const prefix of ['profiles/' + user.uid + '/', 'exports/' + user.uid + '/']) {
    const [files] = await bucket.getFiles({ prefix, versions: true });
    for (const file of files) await file.delete({ ignoreNotFound: true });
    const [remaining] = await bucket.getFiles({ prefix, versions: true, maxResults: 1 });
    if (remaining.length) throw new Error('Synthetic storage objects remain');
  }
  const remainingJobs = await db.collection('matchAnalysisJobs').where('syntheticRun', '==', run).get();
  if (remainingJobs.docs.some((job) => job.get('playerId') === user.uid)) throw new Error('Synthetic jobs remain');
  await auth.deleteUser(user.uid);
}
if ((await syntheticUsers()).length) throw new Error('Synthetic Auth users remain');
console.log('Verified synthetic users and their pilot data were removed.');
