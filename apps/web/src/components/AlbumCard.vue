<script setup lang="ts">
import { useRouter } from 'vue-router'

import type { AlbumListItem } from '@vgm/shared'

const props = defineProps<{
  album: AlbumListItem
}>()

const router = useRouter()

function onPlayClick(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  void router.push({ path: `/albums/${props.album.publicId}`, query: { autoplay: '1' } })
}
</script>

<template>
  <RouterLink :to="`/albums/${album.publicId}`" class="card-link">
    <article class="media-card">
      <div class="media-card-cover">
        <img
          :src="`/covers/${album.publicId}.png`"
          :alt="album.title"
          loading="lazy"
        />
        <div class="media-card-play-overlay">
          <div class="media-card-play-btn" @click="onPlayClick">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      <div class="media-card-body">
        <span class="media-card-title">{{ album.title }}</span>
        <span class="media-card-sub">{{ album.albumArtist }}</span>
        <span class="media-card-meta">{{ album.year ?? '年份未知' }} · {{ album.trackCount }} 首</span>
      </div>
    </article>
  </RouterLink>
</template>
