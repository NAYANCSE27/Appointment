import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'; // Must be 32 chars
const ALGORITHM = 'aes-256-gcm';

export function encryptAES(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');
  return `${encrypted}:${iv.toString('base64')}:${authTag}`;
}

export function decryptAES(ciphertext: string): string {
  const [encrypted, ivBase64, authTagBase64] = ciphertext.split(':');
  if (!encrypted || !ivBase64 || !authTagBase64) {
    throw new Error('Invalid ciphertext format');
  }
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export async function hashBcrypt(value: string): Promise<string> {
  return bcrypt.hash(value, 12);
}

export async function compareBcrypt(value: string, hash: string): Promise<boolean> {
  return bcrypt.compare(value, hash);
}

export function generateSecureToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashSHA256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
