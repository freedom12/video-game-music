<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import type { SeriesDetail } from '../api/client'
import { fetchSeriesDetail } from '../api/client'
import AlbumCard from '../components/AlbumCard.vue'

const route = useRoute()
const loading = ref(true)
const series = ref<SeriesDetail>()
const loadError = ref('')

async function loadSeries() {
  loading.value = true
  loadError.value = ''
  try {
    series.value = await fetchSeriesDetail(route.params.id as string)
  } catch (error) {
    series.value = undefined
    loadError.value = '系列数据加载失败。'
    ElMessage.error(loadError.value)
    console.error(error)
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, () => { void loadSeries() })
onMounted(() => { void loadSeries() })
</script>

<template>
  <el-skeleton :loading="loading" animated>
    <template #default>
      <el-alert
        v-if="loadError"
        type="error"
        :closable="false"
        :title="loadError"
        style="margin-bottom:24px;border-radius:10px"
      />

      <template v-if="series">
        <div class="page-hero">
          <div class="page-hero-cover series-hero-cover">
            <svg width="72" height="72" fill="currentColor" viewBox="0 0 24 24" opacity="0.3">
              <path d="M20 6h-2.18c.07-.44.18-.88.18-1.36C18 2.53 15.47 0 12.36 0c-1.71 0-3.2.75-4.23 1.92L7 3 5.87 1.92C4.84.75 3.35 0 1.64 0 .73 0 0 .73 0 1.64c0 .48.11.92.18 1.36H0v14C0 18.21 1.79 20 4 20h16c2.21 0 4-1.79 4-4V10c0-2.21-1.79-4-4-4zM4 17c-.55 0-1-.45-1-1V7h3.32C6.12 7.52 6 8.05 6 8.64c0 2.37 1.6 4.34 3.77 4.85L9 14H4v3H4zm11-3H9v-1.8c2.07-.43 3.62-2.25 3.62-4.56 0-.37-.06-.73-.14-1.08C12.14 7.22 12 8 12 8c0 1.1-.9 2-2 2S8 9.1 8 8c0-1.1.9-2 2-2 .22 0 .42.05.61.12C11.03 5.42 11.65 5 12.36 5c.97 0 1.72.79 1.72 1.64 0 .48-.24.88-.6 1.19.05.26.08.54.08.81 0 1.71-.94 3.18-2.29 3.95.23.05.48.08.73.08.22 0 .43-.04.63-.08C13.77 12.14 15 10.47 15 8.64c0-.2-.02-.39-.05-.58H20v5h-5zm6 0h-1v-5h1v5z"/>
            </svg>
          </div>
          <div class="page-hero-meta">
            <span class="page-hero-type">游戏系列</span>
            <h1 class="page-hero-title">{{ series.name }}</h1>
            <p class="page-hero-sub">{{ series.albums.length }} 张专辑</p>
          </div>
        </div>

        <section class="content-section">
          <div v-if="series.albums.length" class="card-grid">
            <AlbumCard
              v-for="album in series.albums"
              :key="album.publicId"
              :album="album"
            />
          </div>
          <el-empty v-else description="该系列暂无专辑。" />
        </section>
      </template>

      <el-empty v-else-if="!loading && !loadError" description="未找到该系列。" />
    </template>
  </el-skeleton>
</template>

<style scoped>
.series-hero-cover {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #e8e8e8;
}
</style>
