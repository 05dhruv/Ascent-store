import jwt from 'jsonwebtoken';

const INSECURE_JWT_SECRETS = new Set([
  'change-me-in-production-please',
  'dev-secret-change-me',
  'your-secret-key',
]);

function getJwtSecret() {
  const secret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-secret-change-me');

  if (
    process.env.NODE_ENV === 'production' &&
    (!secret || secret.length < 32 || INSECURE_JWT_SECRETS.has(secret))
  ) {
    throw new Error('JWT_SECRET must be set to a strong unique value in production');
  }

  return secret;
}

export function signAuthToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyAuthToken(token) {
  return jwt.verify(token, getJwtSecret());
}
