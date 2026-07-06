import { NextResponse } from 'next/server';
import { buildCollectionManifest, validateDraftForPublish } from '@/lib/manifest';
import type { CollectionDraft } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const draft = (await request.json()) as CollectionDraft;
    const errors = validateDraftForPublish(draft);
    const manifest = buildCollectionManifest(draft);
    return NextResponse.json({ ok: errors.length === 0, errors, manifest });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error?.message || 'Could not generate manifest.' }, { status: 500 });
  }
}
