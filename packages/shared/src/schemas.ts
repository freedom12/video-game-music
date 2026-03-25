import { z } from 'zod';

export const patchAlbumSchema = z.object({
  displayTitle: z.string().trim().min(1).max(256).optional(),
  displayArtist: z.string().trim().min(1).max(256).optional(),
  coverAssetId: z.string().trim().min(1).max(64).nullable().optional(),
  hidden: z.boolean().optional(),
});

export const patchTrackSchema = z.object({
  displayTitle: z.string().trim().min(1).max(256).optional(),
  displayArtist: z.string().trim().min(1).max(256).optional(),
  hidden: z.boolean().optional(),
});

export const createCollectionSchema = z.object({
  title: z.string().trim().min(1).max(256),
  description: z.string().trim().max(1000).optional(),
  coverAssetId: z.string().trim().min(1).max(64).optional(),
  status: z.enum(['draft', 'published']).default('draft'),
});

export const patchCollectionSchema = createCollectionSchema.partial();

export const addCollectionTracksSchema = z.object({
  trackIds: z.array(z.string().trim().min(1)).min(1),
});
