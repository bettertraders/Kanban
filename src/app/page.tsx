import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { findOrCreateUser, getBoardsForUser, getTeamsForUser } from '@/lib/database';
import { Plus, Users, Layout, Key, LogOut } from 'lucide-react';
import Link from 'next/link';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    redirect('/login');
  }

  const user = await findOrCreateUser(session.user.email, session.user.name || undefined, session.user.image || undefined);
  const boards = await getBoardsForUser(user.id);
  const teams = await getTeamsForUser(user.id);

  const personalBoards = boards.filter(b => b.is_personal);
  const teamBoards = boards.filter(b => !b.is_personal);

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">Team Kanban</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/settings/api-keys" className="flex items-center gap-2 text-slate-400 hover:text-white">
              <Key className="w-4 h-4" />
              API Keys
            </Link>
            <div className="flex items-center gap-2">
              {session.user.image && (
                <img src={session.user.image} alt="" className="w-8 h-8 rounded-full" />
              )}
              <span className="text-sm">{session.user.name}</span>
            </div>
            <Link href="/api/auth/signout" className="text-slate-400 hover:text-white">
              <LogOut className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Personal Boards */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Layout className="w-5 h-5" />
              Personal Boards
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {personalBoards.map(board => (
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

        {/* Teams Section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" />
              Teams
            </h2>
            <Link
              href="/teams/new"
              className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
            >
              <Plus className="w-4 h-4" />
              New Team
            </Link>
          </div>
          
          {teams.length === 0 ? (
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 text-center text-slate-400">
              <p>No teams yet. Create one to collaborate with others!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {teams.map(team => (
                <div key={team.id} className="bg-slate-800 rounded-lg border border-slate-700">
                  <div className="p-4 border-b border-slate-700">
                    <h3 className="font-medium">{team.name}</h3>
                    {team.description && (
                      <p className="text-sm text-slate-400">{team.description}</p>
                    )}
                    <span className="text-xs text-slate-500">Role: {team.user_role}</span>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {teamBoards.filter(b => b.team_id === team.id).map(board => (
                        <Link
                          key={board.id}
                          href={`/board/${board.id}`}
                          className="bg-slate-700 p-3 rounded-lg hover:bg-slate-600 transition-colors"
                        >
                          <h4 className="font-medium text-sm">{board.name}</h4>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
