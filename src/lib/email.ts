import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || '');
  }
  return _resend;
}

export async function sendBoardInviteEmail(params: {
  to: string;
  inviterName: string;
  boardName: string;
  inviteUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await getResend().emails.send({
      from: 'ClawDesk <invites@clawdesk.ai>',
      to: params.to,
      subject: `${params.inviterName} invited you to "${params.boardName}" on ClawDesk`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #141428; font-size: 24px; margin: 0;">🦞 ClawDesk</h1>
            <p style="color: #666; font-size: 14px; margin-top: 4px;">Where Humans and AI Ship Together</p>
          </div>
          <div style="background: #f8f8fc; border-radius: 12px; padding: 32px; text-align: center;">
            <h2 style="color: #141428; font-size: 20px; margin: 0 0 12px;">You've been invited!</h2>
            <p style="color: #444; font-size: 16px; line-height: 1.5; margin: 0 0 24px;">
              <strong>${params.inviterName}</strong> invited you to collaborate on
              <strong>"${params.boardName}"</strong>
            </p>
            <a href="${params.inviteUrl}" style="display: inline-block; background: #7b7dff; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Accept Invite
            </a>
            <p style="color: #999; font-size: 12px; margin-top: 24px;">
              This invite expires in 7 days. If you didn't expect this, you can ignore it.
            </p>
          </div>
          <p style="color: #999; font-size: 11px; text-align: center; margin-top: 24px;">
            ClawDesk — AI-Native Task Management · <a href="https://clawdesk.ai" style="color: #7b7dff;">clawdesk.ai</a>
          </p>
        </div>
      `,
    });
    return { success: true };
  } catch (error: any) {
    console.error('Failed to send invite email:', error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
}
