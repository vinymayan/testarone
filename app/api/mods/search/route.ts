import { NextResponse } from 'next/server';
import { getNexusAccessToken } from '@/lib/oauth-session';
import { searchMods } from '@/lib/nexus';

export async function GET(request: Request) {
  try {
    const accessToken = await getNexusAccessToken();
    if (!accessToken) return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });

    const url = new URL(request.url);
    const game = url.searchParams.get('game') || 'skyrimspecialedition';
    const q = url.searchParams.get('q') || '';
    const page = Number(url.searchParams.get('page') || '1');
    const sort = url.searchParams.get('sort') || 'endorsements';
    const category = url.searchParams.get('category') || 'all';

    const result = await searchMods(accessToken, { game, q, page, sort, category });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.message || 'Search failed.', details: error?.payload },
      { status: error?.status || 500 }
    );
  }
}
