import { NextResponse } from 'next/server';
import { getNexusAccessToken } from '@/lib/oauth-session';
import { getMod } from '@/lib/nexus';

type Context = { params: Promise<{ game: string; modId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const accessToken = await getNexusAccessToken();
    if (!accessToken) return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });

    const { game, modId } = await context.params;
    const mod = await getMod(accessToken, game, Number(modId));
    return NextResponse.json({ mod });
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.message || 'Could not load mod.', details: error?.payload },
      { status: error?.status || 500 }
    );
  }
}
