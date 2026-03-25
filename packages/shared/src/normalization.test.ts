import { describe, expect, it } from 'vitest';

import { compareTrackOrder, makeAlbumKey, makeSourceKey, normalizeRelativePath, parseTagNumber } from './normalization.js';

describe('normalization helpers', () => {
  it('normalizes relative paths to posix', () => {
    expect(normalizeRelativePath('F:\\wh\\音乐', 'F:\\wh\\音乐\\Pokémon\\Disc 1\\01 Test.mp3')).toBe('Pokémon/Disc 1/01 Test.mp3');
  });

  it('creates stable source keys', () => {
    expect(makeSourceKey('Pokémon/Disc 1/01 Test.MP3')).toBe('pokémon/disc 1/01 test.mp3');
  });

  it('creates album keys from normalized metadata', () => {
    expect(makeAlbumKey('  Pokémon OST  ', 'Game Freak', 1998)).toBe('game freak::pokémon ost::1998');
  });

  it('parses track numbers from tag values', () => {
    expect(parseTagNumber('3/24')).toBe(3);
    expect(parseTagNumber(7)).toBe(7);
    expect(parseTagNumber(undefined)).toBeUndefined();
  });

  it('sorts by disc then track then path', () => {
    const tracks = [
      { discNumber: 2, trackNumber: 1, relativePath: 'b.mp3' },
      { discNumber: 1, trackNumber: 2, relativePath: 'c.mp3' },
      { discNumber: 1, trackNumber: 1, relativePath: 'a.mp3' },
    ];

    tracks.sort(compareTrackOrder);

    expect(tracks.map((track) => track.relativePath)).toEqual(['a.mp3', 'c.mp3', 'b.mp3']);
  });
});
