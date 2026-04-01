<script setup lang="ts">
import type { CollectionListItem } from '../api/client'

defineProps<{
  collection: CollectionListItem
}>()
</script>

<template>
  <RouterLink :to="`/collections/${collection.publicId}`" class="card-link">
    <article class="media-card">
      <div class="media-card-cover">
        <img
          :src="`/api/assets/${collection.publicId}/cover`"
          :alt="collection.title"
          loading="lazy"
        />
        <div class="media-card-play-overlay">
          <div class="media-card-play-btn">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      <div class="media-card-body">
        <span class="media-card-title">{{ collection.title }}</span>
        <span class="media-card-sub">{{ collection.description || '人工主题歌单' }}</span>
        <span class="media-card-meta">{{ collection.trackCount }} 首 · {{ collection.status === 'published' ? '已发布' : '草稿' }}</span>
      </div>
    </article>
  </RouterLink>
</template>
