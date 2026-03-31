<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'

import type { AlbumListItem } from '@vgm/shared'

import { fetchAlbums, fetchCollections, fetchSeries, type CollectionSummary, type SeriesListItem } from '../api/client'
import AlbumCard from '../components/AlbumCard.vue'
import CollectionCard from '../components/CollectionCard.vue'
import SeriesCard from '../components/SeriesCard.vue'

const loading = ref(true)
const albums = ref<AlbumListItem[]>([])
const collections = ref<CollectionSummary[]>([])
const seriesList = ref<SeriesListItem[]>([])
const loadError = ref('')
const activeTab = ref('series')

onMounted(async () => {
  loading.value = true
  loadError.value = ''
  try {
    const [albumData, collectionData, seriesData] = await Promise.all([
      fetchAlbums(),
      fetchCollections(),
      fetchSeries(),
    ])
    albums.value = albumData
    collections.value = collectionData
    seriesList.value = seriesData
  } catch (error) {
    loadError.value = 'API 当前不可用，请确认后端开发服务已运行在 127.0.0.1:5005。'
    ElMessage.error(loadError.value)
    console.error(error)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <el-skeleton :loading="loading" animated>
    <template #template>
      <div class="card-grid">
        <div v-for="item in 8" :key="item" class="media-card skeleton-card" />
      </div>
    </template>

    <template #default>
      <el-alert
        v-if="loadError"
        type="error"
        :closable="false"
        :title="loadError"
        style="margin-bottom:24px;border-radius:10px"
      />

      <el-tabs v-model="activeTab" class="home-tabs">
        <el-tab-pane label="系列" name="series">
          <template #label>
            <span class="home-tab-label">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="flex-shrink:0">
                <path d="M20 6h-2.18c.07-.44.18-.88.18-1.36C18 2.53 15.47 0 12.36 0c-1.71 0-3.2.75-4.23 1.92L7 3 5.87 1.92C4.84.75 3.35 0 1.64 0 .73 0 0 .73 0 1.64c0 .48.11.92.18 1.36H0v14C0 18.21 1.79 20 4 20h16c2.21 0 4-1.79 4-4V10c0-2.21-1.79-4-4-4zM4 17c-.55 0-1-.45-1-1V7h3.32C6.12 7.52 6 8.05 6 8.64c0 2.37 1.6 4.34 3.77 4.85L9 14H4v3H4zm11-3H9v-1.8c2.07-.43 3.62-2.25 3.62-4.56 0-.37-.06-.73-.14-1.08C12.14 7.22 12 8 12 8c0 1.1-.9 2-2 2S8 9.1 8 8c0-1.1.9-2 2-2 .22 0 .42.05.61.12C11.03 5.42 11.65 5 12.36 5c.97 0 1.72.79 1.72 1.64 0 .48-.24.88-.6 1.19.05.26.08.54.08.81 0 1.71-.94 3.18-2.29 3.95.23.05.48.08.73.08.22 0 .43-.04.63-.08C13.77 12.14 15 10.47 15 8.64c0-.2-.02-.39-.05-.58H20v5h-5zm6 0h-1v-5h1v5z"/>
              </svg>
              系列
              <span class="home-tab-count">{{ seriesList.length }}</span>
            </span>
          </template>
          <div style="padding-top:20px">
            <div v-if="seriesList.length" class="card-grid">
              <SeriesCard
                v-for="s in seriesList"
                :key="s.publicId"
                :series="s"
              />
            </div>
            <el-empty v-else description="暂无游戏系列，导入音乐库后自动生成。" />
          </div>
        </el-tab-pane>

        <el-tab-pane label="专辑" name="albums">
          <template #label>
            <span class="home-tab-label">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="flex-shrink:0">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/>
              </svg>
              专辑
              <span class="home-tab-count">{{ albums.length }}</span>
            </span>
          </template>
          <div class="card-grid" style="padding-top:20px">
            <AlbumCard v-for="album in albums" :key="album.publicId" :album="album" />
          </div>
        </el-tab-pane>

        <el-tab-pane label="歌单" name="collections">
          <template #label>
            <span class="home-tab-label">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="flex-shrink:0">
                <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
              </svg>
              歌单
              <span class="home-tab-count">{{ collections.length }}</span>
            </span>
          </template>
          <div style="padding-top:20px">
            <div v-if="collections.length" class="card-grid">
              <CollectionCard
                v-for="collection in collections"
                :key="collection.publicId"
                :collection="collection"
              />
            </div>
            <el-empty v-else description="还没有主题歌单，可在管理页创建。" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
  </el-skeleton>
</template>
