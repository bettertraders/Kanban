import { NextAuthOptions, getServerSession } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { findOrCreateUser, getUserByApiKey, verifyPassword } from './database';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    // Email/Password provider
    CredentialsProvider({
      id: 'credentials',
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        
        const user = await verifyPassword(credentials.email, credentials.password);
        if (!user) return null;
        
        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          image: user.avatar_url,
        };
      }
    }),
    // API Key provider for bots
    CredentialsProvider({
      id: 'api-key',
      name: 'API Key',
      credentials: {
        apiKey: { label: 'API Key', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.apiKey) return null;
        
        const user = await getUserByApiKey(credentials.apiKey);
        if (!user) return null;
        
        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          image: user.avatar_url,
        };
      }
    })
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email) {
        try {
          await findOrCreateUser(user.email, user.name || undefined, user.image || undefined);
          return true;
        } catch (error) {
          console.error('Error in signIn callback:', error);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/signin',
    signOut: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
};

export async function getSession() {
  return await getServerSession(authOptions);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  return session;
}
