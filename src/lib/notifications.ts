/**
 * Discord user ID mapping for @mentions in notifications.
 * TODO: Move to DB (users.discord_id) when we have more users.
 */
const DISCORD_IDS: Record<string, string> = {
  'michael@thebettertraders.com': '371153797604573204',
  'aaron@thebettertraders.com': '357736505499975682',
  'penny@thebettertraders.com': '1467800643988226211',
  'betty@thebettertraders.com': '1466286325274640514',
};

const BASE_URL = process.env.NEXTAUTH_URL || 'https://clawdesk.ai';

/**
 * Fire-and-forget Discord webhook notification for task assignments.
 * Uses Discord embeds with @mentions and clickable board links.
 */
export function notifyAssignment({
  taskTitle,
  boardId,
  boardName,
  assignedByName,
  assignedByEmail,
  assignedToName,
  assignedToEmail,
}: {
  taskTitle: string;
  boardId: number;
  boardName: string;
  assignedByName: string;
  assignedByEmail?: string;
  assignedToName?: string;
  assignedToEmail?: string;
}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const assignerMention = assignedByEmail && DISCORD_IDS[assignedByEmail]
    ? `<@${DISCORD_IDS[assignedByEmail]}>` : `**${assignedByName}**`;
  const assigneeMention = assignedToEmail && DISCORD_IDS[assignedToEmail]
    ? `<@${DISCORD_IDS[assignedToEmail]}>` : assignedToName ? `**${assignedToName}**` : 'someone';
  const boardLink = `[${boardName}](${BASE_URL}/board/${boardId})`;

  const embed = {
    title: '📋 Task Assigned',
    description: `${assignerMention} assigned a task to ${assigneeMention}`,
    fields: [
      { name: 'Task', value: taskTitle, inline: false },
      { name: 'Board', value: boardLink, inline: true },
    ],
    color: 0x7b7dff, // TBT accent purple
    timestamp: new Date().toISOString(),
    footer: { text: 'ClawDesk' },
  };

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  }).catch(err => console.error('Discord notification failed:', err));
}
