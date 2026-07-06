import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { FEATURED_MODS, type FeaturedMod } from '@/lib/featured-mods';

type D1DatabaseLike = {
  prepare: (query: string) => {
    bind: (...values: unknown[]) => {
      all: <T>() => Promise<{ results?: T[] }>;
    };
    all: <T>() => Promise<{ results?: T[] }>;
  };
};

type FeaturedModRow = {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  author: string | null;
  game: string | null;
  category: string | null;
  mod_url: string;
  image_key: string;
  badge_label: string | null;
  badge_icon: string | null;
};

function localFallback() {
  return NextResponse.json({ featuredMods: FEATURED_MODS, source: 'local' });
}

function mapRow(row: FeaturedModRow): FeaturedMod {
  return {
    id: row.id,
    name: row.title,
    description: row.summary || '',
    details: row.description || row.summary || '',
    author: row.author || '',
    game: row.game || '',
    category: row.category || '',
    cover: row.image_key,
    url: row.mod_url,
    badgeLabel: row.badge_label || 'FEATURED MOD',
    badgeIcon: row.badge_icon || 'star'
  };
}

export async function GET() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = (env as Record<string, unknown>).DB as D1DatabaseLike | undefined;

    if (!db) return localFallback();

    const { results } = await db.prepare(`
      SELECT
        id,
        title,
        summary,
        description,
        author,
        game,
        category,
        mod_url,
        image_key,
        badge_label,
        badge_icon
      FROM featured_mods
      WHERE COALESCE(is_active, 1) = 1
      ORDER BY COALESCE(sort_order, 0), title
    `).all<FeaturedModRow>();

    const featuredMods = (results || []).map(mapRow).filter((mod) => mod.name && mod.url && mod.cover);
    if (!featuredMods.length) return localFallback();

    return NextResponse.json({ featuredMods, source: 'd1' });
  } catch {
    return localFallback();
  }
}
