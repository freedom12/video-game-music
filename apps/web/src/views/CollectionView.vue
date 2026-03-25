<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'

import type { CollectionDetail } from '@vgm/shared'

import { fetchCollection } from '../api/client'
import TrackTable from '../components/TrackTable.vue'

const route = useRoute()
const loading = ref(true)
const collection = ref<CollectionDetail>()
const loadError = ref('')

async function loadCollection() {
  loading.value = true
  loadError.value = ''
  try {
    collection.value = await fetchCollection(route.params.id as string)
  } catch (error) {
    collection.value = undefined
    loadError.value = 'Failed to load playlist data from the API.'
    ElMessage.error(loadError.value)
    console.error(error)
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, () => {
  void loadCollection()
})

onMounted(() => {
  void loadCollection()
})

const coverUrl = computed(() => (
  collection.value?.coverAssetId ? `/api/assets/${collection.value.coverAssetId}/cover` : ''
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

      <section v-if="collection" class="detail-hero detail-hero--collection">
        <img v-if="collection.coverAssetId" class="detail-cover" :src="coverUrl" :alt="collection.title" />
        <div v-else class="detail-cover detail-cover--empty">
          Mix
        </div>

        <div class="detail-copy">
          <span class="eyebrow">Curated Playlist</span>
          <h1>{{ collection.title }}</h1>
          <p>{{ collection.description || 'A fixed playlist built from any source album.' }}</p>
          <small>{{ collection.tracks.length }} tracks · {{ collection.status }}</small>
        </div>
      </section>

      <section v-if="collection" class="section-block">
        <div class="section-head">
          <div>
            <span class="eyebrow">Playlist</span>
            <h2>Tracks</h2>
          </div>
        </div>
        <TrackTable :tracks="collection.tracks" :queue-label="collection.title" />
      </section>

      <el-empty v-else-if="!loading && !loadError" description="Playlist not found." />
    </template>
  </el-skeleton>
</template>
