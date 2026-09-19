import { encryptAES, decryptAES, hashBcrypt, compareBcrypt, generateSecureToken, hashSHA256 } from '../../../src/utils/crypto';

describe('Crypto Utility', () => {
  it('should encrypt and decrypt correctly', () => {
    const plain = 'test_string_123!';
    const encrypted = encryptAES(plain);
    expect(encrypted).not.toEqual(plain);
    const decrypted = decryptAES(encrypted);
    expect(decrypted).toEqual(plain);
  });

  it('should hash and verify bcrypt correctly', async () => {
    const password = 'mySecretPassword!';
    const hash = await hashBcrypt(password);
    expect(hash).not.toEqual(password);
    const isValid = await compareBcrypt(password, hash);
    expect(isValid).toBe(true);
    const isInvalid = await compareBcrypt('wrongPassword', hash);
    expect(isInvalid).toBe(false);
  });

  it('should generate secure token of correct length', () => {
    const token = generateSecureToken(16);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(16); // base64url is longer
  });

  it('should hash sha256', () => {
    const hash = hashSHA256('test');
    expect(hash.length).toBe(64); // hex is 64 chars
  });
});
