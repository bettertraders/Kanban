import { NextRequest, NextResponse } from 'next/server';

// POST /api/v1/notifications - Send a Discord webhook notification
export async function POST(request: NextRequest) {
  try {
    const { taskTitle, boardName, assignedBy } = await request.json();
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
      return NextResponse.json({ error: 'DISCORD_WEBHOOK_URL not configured' }, { status: 500 });
    }

    if (!taskTitle || !boardName || !assignedBy) {
      return NextResponse.json({ error: 'taskTitle, boardName, and assignedBy are required' }, { status: 400 });
    }

    const message = `📋 **${assignedBy}** assigned you a task: **${taskTitle}** on board **${boardName}**`;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending notification:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
