import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { findOrCreateUser, getBoardsForUser, autoJoinTeams, getDashboardStats, getTeamsForUser } from '@/lib/database';
import { DashboardClient } from '@/components/DashboardClient';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    redirect('/login');
  }

  const user = await findOrCreateUser(session.user.email, session.user.name || undefined, session.user.image || undefined);
  
  // Auto-join teams based on email domain
  await autoJoinTeams(user.id, user.email);
  
  const boards = await getBoardsForUser(user.id);
  const teams = await getTeamsForUser(user.id);
  const stats = await getDashboardStats(user.id);

  return (
    <DashboardClient 
      initialBoards={boards} 
      initialTeams={teams}
      stats={stats} 
      userEmail={user.email}
    />
  );
}
