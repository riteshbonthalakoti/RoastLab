import { NextRequest, NextResponse } from 'next/server';
import { getAuditById } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const audit = await getAuditById(id);

  if (!audit) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
  }

  // Shape the analyze page expects; user_id stays private.
  return NextResponse.json({
    id: audit.id,
    url: audit.url,
    score: audit.score,
    tier: audit.tier,
    dimensions: audit.dimensions,
    created_at: audit.created_at,
  });
}
