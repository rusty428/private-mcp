import { randomBytes, createHash } from 'crypto';

export function generateApiKey(): { rawKey: string; keyHash: string } {
  const rawKey = `pmcp_${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  return { rawKey, keyHash };
}

// When run directly: generate and print a key
if (require.main === module) {
  const { rawKey, keyHash } = generateApiKey();
  console.log('Raw Key:', rawKey);
  console.log('Key Hash:', keyHash);
}
