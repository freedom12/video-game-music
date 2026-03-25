<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'

import type { AlbumDetail } from '@vgm/shared'

import { fetchAlbum } from '../api/client'
import TrackTable from '../components/TrackTable.vue'

const route = useRoute()
const loading = ref(true)
const album = ref<AlbumDetail>()
const loadError = ref('')

async function loadAlbum() {
  loading.value = true
  loadError.value = ''
  try {
    album.value = await fetchAlbum(route.params.id as string)
  } catch (error) {
    album.value = undefined
    loadError.value = 'Failed to load album data from the API.'
    ElMessage.error(loadError.value)
    console.error(error)
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, () => {
  void loadAlbum()
})

onMounted(() => {
  void loadAlbum()
})

const coverUrl = computed(() => (
  album.value?.coverAssetId ? `/api/assets/${album.value.coverAssetId}/cover` : ''
))
</script>

<template>
  <el-skeleton :loading="loading" animated>
    <template #default>
      <el-alert
        v-if="loadError"
        class="section-block"
        type="error"
        :closable="false"
        :title="loadError"
      />

      <section v-if="album" class="detail-hero">
        <img v-if="album.coverAssetId" class="detail-cover" :src="coverUrl" :alt="album.title" />
        <div v-else class="detail-cover detail-cover--empty">
          Album
        </div>

        <div class="detail-copy">
          <span class="eyebrow">Album</span>
          <h1>{{ album.title }}</h1>
          <p>{{ album.albumArtist }} · {{ album.year ?? 'Unknown year' }}</p>
          <small>{{ album.trackCount }} tracks across {{ album.discCount }} discs</small>
        </div>
      </section>

      <section v-if="album" class="section-block">
        <div class="section-head">
          <div>
            <span class="eyebrow">Track List</span>
            <h2>Disc Segments</h2>
          </div>
        </div>
        <TrackTable :tracks="album.tracks" :queue-label="album.title" group-by-disc />
      </section>

      <el-empty v-else-if="!loading && !loadError" description="Album not found." />
    </template>
  </el-skeleton>
</template>
