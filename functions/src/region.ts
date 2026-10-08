import { setGlobalOptions } from 'firebase-functions/v2';

/** Same region as the Firestore database and Storage bucket, so personal data stays in Switzerland. */
export const FUNCTIONS_REGION = 'europe-west6';

setGlobalOptions({ region: FUNCTIONS_REGION });

/** Admin SDK task queues default to us-central1 unless the full resource path is given. */
export function taskQueueName(functionName: string): string {
  return `locations/${FUNCTIONS_REGION}/functions/${functionName}`;
}
