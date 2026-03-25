<script setup lang="ts">
import type { AlbumListItem } from '@vgm/shared'

defineProps<{
  album: AlbumListItem
}>()
</script>

<template>
  <RouterLink :to="`/albums/${album.publicId}`" class="card-link">
    <article class="media-card">
      <div class="media-card-cover">
        <img
          v-if="album.coverAssetId"
          :src="`/api/assets/${album.coverAssetId}/cover`"
          :alt="album.title"
        />
        <div v-else class="cover-fallback">
          Album
        </div>
      </div>
      <div class="media-card-body">
        <strong>{{ album.title }}</strong>
        <span>{{ album.albumArtist }}</span>
        <small>{{ album.year ?? 'Unknown year' }} · {{ album.trackCount }} tracks · {{ album.discCount }} discs</small>
      </div>
    </article>
  </RouterLink>
</template>
