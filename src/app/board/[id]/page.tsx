import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { findOrCreateUser, getBoard, getTasksForBoard } from '@/lib/database';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { TaskCard } from '@/components/TaskCard';
import { NewTaskForm } from '@/components/NewTaskForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

const columnIcons: Record<string, string> = {
  'Backlog': '📋',
  'Planned': '📌',
  'In Progress': '🔨',
  'Done': '✅',
};

export default async function BoardPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    redirect('/login');
  }

  const { id } = await params;
  const user = await findOrCreateUser(session.user.email);
  const board = await getBoard(parseInt(id), user.id);
  
  if (!board) {
    notFound();
  }

  const tasks = await getTasksForBoard(board.id);
  const columns = (board.columns as string[]);
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.column_name === 'Done').length;

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-full mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-slate-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold">{board.name}</h1>
              {board.team_name && (
                <p className="text-sm text-slate-400">{board.team_name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {totalTasks > 0 && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <BarChart3 className="w-4 h-4" />
                <span>{doneTasks}/{totalTasks} done</span>
                <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 rounded-full transition-all" 
                    style={{ width: `${(doneTasks / totalTasks) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Kanban Board */}
      <main className="p-4 overflow-x-auto">
        <div className="flex gap-4 min-w-max">
          {columns.map(columnName => {
            const columnTasks = tasks.filter(t => t.column_name === columnName);
            const icon = columnIcons[columnName] || '📄';
            return (
              <div key={columnName} className="w-80 flex-shrink-0">
                <div className="bg-slate-800 rounded-lg">
                  <div className="p-3 border-b border-slate-700 flex items-center justify-between">
                    <h2 className="font-medium flex items-center gap-2">
                      <span>{icon}</span>
                      {columnName}
                      <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full">
                        {columnTasks.length}
                      </span>
                    </h2>
                  </div>
                  
                  <div className="p-2 space-y-2 min-h-[200px]">
                    {columnTasks.map(task => (
                      <TaskCard key={task.id} task={task} boardId={board.id} columns={columns} />
                    ))}
                    
                    <NewTaskForm boardId={board.id} column={columnName} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
