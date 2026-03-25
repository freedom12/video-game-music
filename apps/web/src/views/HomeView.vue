<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'

import type { AlbumListItem } from '@vgm/shared'

import { fetchAlbums, fetchCollections, type CollectionSummary } from '../api/client'
import AlbumCard from '../components/AlbumCard.vue'
import CollectionCard from '../components/CollectionCard.vue'

const loading = ref(true)
const albums = ref<AlbumListItem[]>([])
const collections = ref<CollectionSummary[]>([])
const loadError = ref('')
const activeTab = ref('albums')

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
    loadError.value = 'API 当前不可用，请确认后端开发服务已运行在 127.0.0.1:8787。'
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
