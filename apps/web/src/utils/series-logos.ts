/**
 * 游戏系列 Logo 映射，图片存放于 apps/web/public/series-logos/
 * 支持 .png / .jpg / .svg 等格式，命名见下方。
 */
export const SERIES_LOGO_MAP: Record<string, string> = {
  'Animal Crossing':   '/series-logos/animal-crossing.png',
  'Atlus':             '/series-logos/atlus.png',
  'Bayonetta':         '/series-logos/bayonetta.png',
  'Castlevania':       '/series-logos/castlevania.png',
  'Donkey Kong':       '/series-logos/donkey-kong.png',
  'Elden Ring':        '/series-logos/elden-ring.png',
  'Fire Emblem':       '/series-logos/fire-emblem.png',
  'Hollow Knight':     '/series-logos/hollow-knight.png',
  'Kirby':             '/series-logos/kirby.png',
  "Luigi's Mansion":   '/series-logos/luigis-mansion.png',
  'Mario Kart':        '/series-logos/mario-kart.png',
  'Mario RPG':         '/series-logos/mario-rpg.png',
  'Metroid':           '/series-logos/metroid.png',
  'Monster Hunter':    '/series-logos/monster-hunter.png',
  'Nintendo':          '/series-logos/nintendo.png',
  'Octopath Traveler': '/series-logos/octopath-traveler.png',
  'Pikmin':            '/series-logos/pikmin.png',
  'Pokémon':           '/series-logos/pokemon.png',
  'Rhythm Heaven':     '/series-logos/rhythm-heaven.png',
  'Splatoon':          '/series-logos/splatoon.png',
  'Super Mario':       '/series-logos/super-mario.png',
  'Super Smash Bros':  '/series-logos/super-smash-bros.png',
  'The Legend of Zelda': '/series-logos/zelda.png',
  'Xenoblade':         '/series-logos/xenoblade.png',
  '动漫':              '/series-logos/anime.png',
  '游戏':              '/series-logos/game.png',
}

export function getSeriesLogoUrl(name: string): string | undefined {
  return SERIES_LOGO_MAP[name]
}
