<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'

import type { AlbumListItem } from '@vgm/shared'

import { fetchAlbums } from '../api/client'
import AlbumCard from '../components/AlbumCard.vue'

const loading = ref(true)
const albums = ref<AlbumListItem[]>([])

onMounted(async () => {
  try {
    albums.value = await fetchAlbums()
  } catch (e) {
    ElMessage.error('加载专辑失败，请确认后端服务已启动。')
    console.error(e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <el-skeleton :loading="loading" animated>
    <template #template>
      <div class="card-grid">
        <div v-for="i in 12" :key="i" class="media-card skeleton-card" />
      </div>
    </template>
    <template #default>
      <div v-if="albums.length" class="card-grid">
        <AlbumCard v-for="album in albums" :key="album.publicId" :album="album" />
      </div>
      <el-empty v-else description="暂无专辑数据，导入音乐库后自动生成。" />
    </template>
  </el-skeleton>
</template>
