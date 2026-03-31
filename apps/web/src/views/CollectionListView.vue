<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'

import { fetchCollections, type CollectionSummary } from '../api/client'
import CollectionCard from '../components/CollectionCard.vue'

const loading = ref(true)
const collections = ref<CollectionSummary[]>([])

onMounted(async () => {
  try {
    collections.value = await fetchCollections()
  } catch (e) {
    ElMessage.error('加载歌单失败，请确认后端服务已启动。')
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
        <div v-for="i in 8" :key="i" class="media-card skeleton-card" />
      </div>
    </template>
    <template #default>
      <div v-if="collections.length" class="card-grid">
        <CollectionCard
          v-for="c in collections"
          :key="c.publicId"
          :collection="c"
        />
      </div>
      <el-empty v-else description="还没有主题歌单。" />
    </template>
  </el-skeleton>
</template>
