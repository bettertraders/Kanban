/**
 * Fire-and-forget Discord webhook notification for task assignments.
 * Does not throw — logs errors silently.
 */
export function notifyAssignment({
  taskTitle,
  boardName,
  assignedBy,
}: {
  taskTitle: string;
  boardName: string;
  assignedBy: string;
}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const message = `📋 **${assignedBy}** assigned you a task: **${taskTitle}** on board **${boardName}**`;

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message }),
  }).catch(err => console.error('Discord notification failed:', err));
}
