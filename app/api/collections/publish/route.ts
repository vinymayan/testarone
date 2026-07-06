import { NextResponse } from 'next/server';
import { getNexusAccessToken } from '@/lib/oauth-session';
import { publishCollection } from '@/lib/nexus-collections';
import type { CollectionDraft } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const accessToken = await getNexusAccessToken();
    if (!accessToken) return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });

    const draft = (await request.json()) as CollectionDraft;
    const result = await publishCollection(accessToken, draft);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || 'Could not publish collection.', details: error?.payload },
      { status: error?.status || 500 }
    );
  }
}
