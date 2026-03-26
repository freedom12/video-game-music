<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'

import { fetchSeries, type SeriesListItem } from '../api/client'
import SeriesCard from '../components/SeriesCard.vue'

const loading = ref(true)
const seriesList = ref<SeriesListItem[]>([])

onMounted(async () => {
  try {
    seriesList.value = await fetchSeries()
  } catch (e) {
    ElMessage.error('加载系列失败，请确认后端服务已启动。')
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
      <div v-if="seriesList.length" class="card-grid">
        <SeriesCard v-for="s in seriesList" :key="s.publicId" :series="s" />
      </div>
      <el-empty v-else description="暂无游戏系列，导入音乐库后自动生成。" />
    </template>
  </el-skeleton>
</template>
