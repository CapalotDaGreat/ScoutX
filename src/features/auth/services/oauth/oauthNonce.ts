import * as Crypto from 'expo-crypto';

const NONCE_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';

export function generateRawOAuthNonce(length = 32): string {
  const randomBytes = Crypto.getRandomBytes(length);
  return Array.from(randomBytes, (byte) => NONCE_CHARSET[byte % NONCE_CHARSET.length]).join('');
}

export async function hashOAuthNonce(rawNonce: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
}
