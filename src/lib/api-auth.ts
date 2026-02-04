import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { getUserByApiKey, findOrCreateUser } from './database';

export interface AuthenticatedUser {
  id: number;
  email: string;
  name?: string;
}

export async function getAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUser | null> {
  // Check for API key in header
  const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
  
  if (apiKey?.startsWith('kb_')) {
    const user = await getUserByApiKey(apiKey);
    if (user) {
      return { id: user.id, email: user.email, name: user.name };
    }
  }
  
  // Fall back to session auth
  const session = await getServerSession(authOptions);
  if (session?.user?.email) {
    const user = await findOrCreateUser(session.user.email, session.user.name || undefined);
    return { id: user.id, email: user.email, name: user.name };
  }
  
  return null;
}
