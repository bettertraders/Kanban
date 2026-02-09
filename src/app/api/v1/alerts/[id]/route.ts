import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { deleteAlert, updateAlert } from '@/lib/database';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.alert_type !== undefined) updates.alert_type = body.alert_type;
    if (body.trade_id !== undefined) updates.trade_id = body.trade_id;
    if (body.condition_value !== undefined) updates.condition_value = body.condition_value;
    if (body.condition_operator !== undefined) updates.condition_operator = body.condition_operator;
    if (body.message !== undefined) updates.message = body.message;
    if (body.triggered !== undefined) {
      updates.triggered = Boolean(body.triggered);
      if (body.triggered && !body.triggered_at) {
        updates.triggered_at = new Date().toISOString();
      }
    }
    if (body.triggered_at !== undefined) updates.triggered_at = body.triggered_at;

    const alert = await updateAlert(parseInt(id, 10), updates);
    if (!alert) return NextResponse.json({ error: 'Alert not found or no valid fields' }, { status: 404 });

    return NextResponse.json({ alert });
  } catch (e) {
    console.error('PATCH /alerts/[id] error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await deleteAlert(parseInt(id, 10));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('DELETE /alerts/[id] error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
