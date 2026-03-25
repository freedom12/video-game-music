<script setup lang="ts">
import { Search } from '@element-plus/icons-vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { searchCatalog } from '../api/client'
import AlbumCard from '../components/AlbumCard.vue'
import TrackTable from '../components/TrackTable.vue'

const route = useRoute()
const loading = ref(false)
const result = ref<Awaited<ReturnType<typeof searchCatalog>>>({
  albums: [],
  tracks: [],
})

const keyword = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))

async function runSearch() {
  if (!keyword.value) {
    result.value = { albums: [], tracks: [] }
    return
  }

  loading.value = true
  try {
    result.value = await searchCatalog(keyword.value)
  } finally {
    loading.value = false
  }
}

watch(keyword, () => {
  void runSearch()
})

onMounted(() => {
  void runSearch()
})
</script>

<template>
  <section class="section-head">
    <div>
      <span class="eyebrow">Search</span>
      <h1>Results for “{{ keyword || '...' }}”</h1>
    </div>
  </section>

  <el-empty
    v-if="!keyword"
    description="Enter a keyword in the header search box."
  >
    <template #image>
      <el-icon :size="48"><Search /></el-icon>
    </template>
  </el-empty>

  <el-skeleton :loading="loading" animated>
    <template #default>
      <section v-if="keyword" class="section-block">
        <div class="section-head">
          <div>
            <span class="eyebrow">Albums</span>
            <h2>{{ result.albums.length }} Matches</h2>
          </div>
        </div>
        <div v-if="result.albums.length" class="card-grid">
          <AlbumCard v-for="album in result.albums" :key="album.publicId" :album="album" />
        </div>
        <el-empty v-else description="No albums matched." />
      </section>

      <section v-if="keyword" class="section-block">
        <div class="section-head">
          <div>
            <span class="eyebrow">Tracks</span>
            <h2>{{ result.tracks.length }} Matches</h2>
          </div>
        </div>
        <TrackTable :tracks="result.tracks" queue-label="Search Results" />
      </section>
    </template>
  </el-skeleton>
</template>
