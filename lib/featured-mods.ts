export type FeaturedMod = {
  id: string;
  name: string;
  description: string;
  details: string;
  author: string;
  game: string;
  category: string;
  cover: string;
  url: string;
  badgeLabel?: string;
  badgeIcon?: string;
};

export const FEATURED_MODS: FeaturedMod[] = [
  {
    id: 'nve',
    name: 'NPC Visual Editor - NVE',
    description: 'Change NPC visuals in real time and create presets for replacers without touching stats.',
    details: 'Lets you change NPC visuals in realtime, create presets, and switch between different replacers in one click while avoiding xEdit conflict management.',
    author: 'Viny',
    game: 'Skyrim Special Edition',
    category: 'Utilities',
    cover: '/featured-nve.jpg',
    url: 'https://www.nexusmods.com/skyrimspecialedition/mods/176063'
  },
  {
    id: 'dodge-for-all',
    name: 'Dodge for all',
    description: 'Adds dodge support for the player and NPCs in first and third person.',
    details: 'Gives everyone dodge functionality with first-person and third-person support, dash up, custom iframe, NPC dodge behavior, and player dodge input support.',
    author: 'Sigerious - ToyzFX - minemiz - BF001 - Viny',
    game: 'Skyrim Special Edition',
    category: 'Combat',
    cover: '/featured-dodge-for-all.jpg',
    url: 'https://www.nexusmods.com/skyrimspecialedition/mods/174544'
  },
  {
    id: 'dmk',
    name: 'Directional Movement Keys - DMK',
    description: 'Maps player and NPC movement directions for OAR conditions and related systems.',
    details: 'Provides movement mapping for player and NPCs plus camera movement tracking, allowing directional data to be used in OAR conditions and other gameplay setups.',
    author: 'Viny',
    game: 'Skyrim Special Edition',
    category: 'Utilities',
    cover: '/featured-dmk.jpg',
    url: 'https://www.nexusmods.com/skyrimspecialedition/mods/174499'
  }
];
