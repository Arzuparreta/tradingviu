import { verifyAccessToken } from '@tv/auth';
import { AuthError } from '@tv/core';

export interface AuthenticatedWsData {
  userId: string;
  auth: 'session';
}

export const authenticateWsToken = async (
  token: string,
  jwtSecret: string,
): Promise<AuthenticatedWsData> => {
  if (!token) throw new AuthError('Missing session token');
  const claims = await verifyAccessToken(token, jwtSecret);
  return { userId: claims.sub, auth: 'session' };
};
