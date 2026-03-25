import { describe, expect, it } from 'vitest';

import { makeAlbumKey } from '@vgm/shared/normalization';

describe('album key grouping', () => {
  it('groups album by album, artist, and year', () => {
    const keyA = makeAlbumKey('Red/Blue', 'Game Freak', 1996);
    const keyB = makeAlbumKey('Red/Blue', 'Game Freak', 1996);
    const keyC = makeAlbumKey('Red/Blue', 'Game Freak', 1998);

    expect(keyA).toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });
});
