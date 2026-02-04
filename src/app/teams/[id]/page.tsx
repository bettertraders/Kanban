import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { findOrCreateUser, getTeamsForUser, getTeamMembers, getBoardsForUser, isTeamMember } from '@/lib/database';
import { ArrowLeft, Users, Layout, Crown, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { InviteMemberForm } from '@/components/InviteMemberForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TeamPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    redirect('/login');
  }

  const { id } = await params;
  const teamId = parseInt(id);
  const user = await findOrCreateUser(session.user.email);
  
  const membership = await isTeamMember(teamId, user.id);
  if (!membership) {
    notFound();
  }

  const teams = await getTeamsForUser(user.id);
  const team = teams.find(t => t.id === teamId);
  
  if (!team) {
    notFound();
  }

  const members = await getTeamMembers(teamId);
  const boards = await getBoardsForUser(user.id);
  const teamBoards = boards.filter(b => b.team_id === teamId);
  const isAdmin = membership.role === 'admin';

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/" className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{team.name}</h1>
            {team.description && (
              <p className="text-sm text-slate-400">{team.description}</p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Team Boards */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Layout className="w-5 h-5" />
              Boards
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teamBoards.map(board => (
              <Link
                key={board.id}
                href={`/board/${board.id}`}
                className="bg-slate-800 p-4 rounded-lg border border-slate-700 hover:border-blue-500 transition-colors"
              >
                <h3 className="font-medium">{board.name}</h3>
                {board.description && (
                  <p className="text-sm text-slate-400 mt-1">{board.description}</p>
                )}
              </Link>
            ))}
          </div>
        </section>

        {/* Team Members */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" />
              Members ({members.length})
            </h2>
          </div>
          
          <div className="bg-slate-800 rounded-lg border border-slate-700 divide-y divide-slate-700">
            {members.map(member => (
              <div key={member.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-lg">
                      {(member.name || member.email).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{member.name || member.email}</p>
                    <p className="text-sm text-slate-400">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {member.role === 'admin' && (
                    <span className="flex items-center gap-1 text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full">
                      <Crown className="w-3 h-3" />
                      Admin
                    </span>
                  )}
                  {member.role === 'member' && (
                    <span className="text-xs bg-slate-700 text-slate-400 px-2 py-1 rounded-full">
                      Member
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Invite Members */}
        {isAdmin && (
          <section>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <UserPlus className="w-5 h-5" />
              Invite Member
            </h2>
            <InviteMemberForm teamId={teamId} />
          </section>
        )}
      </main>
    </div>
  );
}
