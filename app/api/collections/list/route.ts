import { NextResponse } from 'next/server';
import { getNexusAccessToken } from '@/lib/oauth-session';
import { listUserCollections } from '@/lib/nexus-collections';

export async function GET() {
  try {
    const accessToken = await getNexusAccessToken();
    if (!accessToken) return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });

    const result = await listUserCollections(accessToken);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.message || 'Could not load collections.', details: error?.payload },
      { status: error?.status || 500 }
    );
  }
}
