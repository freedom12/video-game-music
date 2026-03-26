<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import type { AlbumDetail } from '@vgm/shared'

import { fetchAlbum } from '../api/client'
import TrackTable from '../components/TrackTable.vue'
import { usePlayerStore } from '../stores/player'

const route = useRoute()
const loading = ref(true)
const album = ref<AlbumDetail>()
const loadError = ref('')
const player = usePlayerStore()

async function loadAlbum() {
  loading.value = true
  loadError.value = ''
  try {
    album.value = await fetchAlbum(route.params.id as string)
    if (route.query.autoplay === '1' && album.value?.tracks?.length) {
      try {
        await player.playQueue(
          album.value.tracks,
          0,
          album.value.title,
          album.value.coverAssetId,
        )
      } catch {
        // 浏览器自动播放策略可能阻止刷新后的自动播放，忽略该错误
      }
    }
  } catch (error) {
    album.value = undefined
    loadError.value = '专辑数据加载失败。'
    ElMessage.error(loadError.value)
    console.error(error)
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, () => { void loadAlbum() })
onMounted(() => { void loadAlbum() })

const coverUrl = computed(() => (
  album.value?.coverAssetId ? `/api/assets/${album.value.coverAssetId}/cover` : ''
))
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

      <template v-if="album">
        <div class="page-hero">
          <div class="page-hero-cover">
            <img v-if="album.coverAssetId" :src="coverUrl" :alt="album.title" />
            <div v-else class="page-hero-cover-fallback">🎮</div>
          </div>
          <div class="page-hero-meta">
            <span class="page-hero-type">专辑</span>
            <h1 class="page-hero-title">{{ album.title }}</h1>
            <p class="page-hero-sub">{{ album.albumArtist }} &middot; {{ album.year ?? '年份未知' }}</p>
            <p class="page-hero-sub">{{ album.trackCount }} 首曲目 &middot; {{ album.discCount }} 张盘</p>
          </div>
        </div>

        <section class="content-section">
          <TrackTable
            :tracks="album.tracks"
            :queue-label="album.title"
            :cover-asset-id="album.coverAssetId"
            group-by-disc
          />
        </section>
      </template>

      <el-empty v-else-if="!loading && !loadError" description="未找到该专辑。" />
    </template>
  </el-skeleton>
</template>
