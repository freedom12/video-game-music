<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'

import AlbumCard from '../components/AlbumCard.vue'
import CollectionCard from '../components/CollectionCard.vue'
import { fetchAlbums, fetchCollections, type CollectionSummary } from '../api/client'
import type { AlbumListItem } from '@vgm/shared'

const loading = ref(true)
const albums = ref<AlbumListItem[]>([])
const collections = ref<CollectionSummary[]>([])
const loadError = ref('')

onMounted(async () => {
  loading.value = true
  loadError.value = ''
  try {
    const [albumData, collectionData] = await Promise.all([
      fetchAlbums(),
      fetchCollections(),
    ])
    albums.value = albumData
    collections.value = collectionData
  } catch (error) {
    loadError.value = 'API is unavailable. Confirm the backend dev server is running on 127.0.0.1:8787.'
    ElMessage.error(loadError.value)
    console.error(error)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="hero-panel">
    <div>
      <span class="eyebrow">Local-first catalog</span>
      <h1>Browse soundtrack albums, stream tracks, and keep the library ready for COS.</h1>
      <p>
        The site reads your local library in development, groups tracks into system-generated albums,
        and leaves room for curated cross-album playlists in the admin panel.
      </p>
    </div>
    <div class="hero-stats">
      <article>
        <strong>{{ albums.length }}</strong>
        <span>Albums</span>
      </article>
      <article>
        <strong>{{ collections.length }}</strong>
        <span>Curated Lists</span>
      </article>
    </div>
  </section>

  <el-skeleton :loading="loading" animated>
    <template #template>
      <div class="card-grid">
        <div v-for="item in 6" :key="item" class="media-card skeleton-card" />
      </div>
    </template>

    <template #default>
      <el-alert
        v-if="loadError"
        class="section-block"
        type="error"
        :closable="false"
        :title="loadError"
      />

      <section class="section-block">
        <div class="section-head">
          <div>
            <span class="eyebrow">System Generated</span>
            <h2>Album Collections</h2>
          </div>
          <small>{{ albums.length }} total</small>
        </div>
        <div class="card-grid">
          <AlbumCard v-for="album in albums" :key="album.publicId" :album="album" />
        </div>
      </section>

      <section class="section-block">
        <div class="section-head">
          <div>
            <span class="eyebrow">Curated</span>
            <h2>Theme Playlists</h2>
          </div>
        </div>
        <div v-if="collections.length" class="card-grid card-grid--narrow">
          <CollectionCard
            v-for="collection in collections"
            :key="collection.publicId"
            :collection="collection"
          />
        </div>
        <el-empty v-else description="No curated playlists yet. Create one in Admin." />
      </section>
    </template>
  </el-skeleton>
</template>
