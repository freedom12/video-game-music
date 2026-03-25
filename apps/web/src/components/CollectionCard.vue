<script setup lang="ts">
import type { CollectionSummary } from '../api/client'

defineProps<{
  collection: CollectionSummary
}>()
</script>

<template>
  <RouterLink :to="`/collections/${collection.publicId}`" class="card-link">
    <article class="media-card media-card--compact">
      <div class="media-card-cover">
        <img
          v-if="collection.coverAssetId"
          :src="`/api/assets/${collection.coverAssetId}/cover`"
          :alt="collection.title"
        />
        <div v-else class="cover-fallback">
          Mix
        </div>
      </div>
      <div class="media-card-body">
        <strong>{{ collection.title }}</strong>
        <span>{{ collection.description || 'Curated playlist' }}</span>
        <small>{{ collection.trackCount }} tracks · {{ collection.status }}</small>
      </div>
    </article>
  </RouterLink>
</template>
