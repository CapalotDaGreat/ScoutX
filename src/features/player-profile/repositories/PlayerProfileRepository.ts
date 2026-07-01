import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirestoreDb, getFirebaseStorage } from '@/config/firebase';
import { type PlayerProfile } from '@/features/player-profile/types';
import { ProfileModel } from '@/features/player-profile/models/ProfileModel';

export class PlayerProfileRepository {
  private static instance: PlayerProfileRepository | null = null;

  private constructor() {}

  public static getInstance(): PlayerProfileRepository {
    if (!this.instance) {
      this.instance = new PlayerProfileRepository();
    }
    return this.instance;
  }

  public async fetchProfile(userId: string): Promise<PlayerProfile | null> {
    const db = getFirestoreDb();
    if (!db) {
      throw new Error('Firestore is not initialized.');
    }

    try {
      const docRef = doc(db, 'profiles', userId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return ProfileModel.fromFirestore(userId, docSnap.data());
      }
      return null;
    } catch (error) {
      console.error('Error fetching player profile:', error);
      throw error;
    }
  }

  public subscribeToProfile(
    userId: string,
    callback: (profile: PlayerProfile | null) => void,
    onError?: (error: Error) => void
  ): () => void {
    const db = getFirestoreDb();
    if (!db) {
      if (onError) {
        onError(new Error('Firestore is not initialized.'));
      }
      return () => undefined;
    }

    const docRef = doc(db, 'profiles', userId);

    return onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          try {
            const profile = ProfileModel.fromFirestore(userId, docSnap.data());
            callback(profile);
          } catch (err) {
            console.error('Error mapping profile data:', err);
            callback(null);
          }
        } else {
          callback(null);
        }
      },
      (error) => {
        console.error('Error listening to profile updates:', error);
        if (onError) {
          onError(error);
        }
      }
    );
  }

  public async updateProfile(userId: string, data: Partial<PlayerProfile>): Promise<void> {
    const db = getFirestoreDb();
    if (!db) {
      throw new Error('Firestore is not initialized.');
    }

    try {
      const docRef = doc(db, 'profiles', userId);
      const updateData = ProfileModel.toFirestore(data);
      await setDoc(docRef, updateData, { merge: true });
    } catch (error) {
      console.error('Error updating player profile:', error);
      throw error;
    }
  }

  public async uploadImage(userId: string, fileUri: string, type: 'avatar' | 'cover'): Promise<string> {
    const storage = getFirebaseStorage();
    if (!storage) {
      throw new Error('Firebase Storage is not initialized.');
    }

    try {
      const response = await fetch(fileUri);
      const blob = await response.blob();

      const fileExtension = 'jpg';
      const storageRef = ref(storage, `profiles/${userId}/${type}_${Date.now()}.${fileExtension}`);

      await uploadBytes(storageRef, blob);

      const downloadUrl = await getDownloadURL(storageRef);
      return downloadUrl;
    } catch (error) {
      console.error('Error uploading image to storage:', error);
      throw error;
    }
  }
}
