<script setup lang="ts">
import { Search } from '@element-plus/icons-vue'
import { onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import { fetchMediaSource } from './api/client'
import PlayerBar from './components/PlayerBar.vue'

const route = useRoute()
const router = useRouter()
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const isLocalMedia = ref(false)

onMounted(async () => {
  try {
    const source = await fetchMediaSource()
    isLocalMedia.value = source === 'local'
  } catch {
    // ignore
  }
})

watch(
  () => route.query.q,
  (value) => {
    search.value = typeof value === 'string' ? value : ''
  },
)

function submitSearch() {
  router.push({
    name: 'search',
    query: search.value ? { q: search.value } : {},
  })
}
</script>

<template>
  <div class="main-content">
    <div class="main-topbar">
      <RouterLink class="topbar-brand" to="/">
        <div class="topbar-logo">🎮</div>
        <div class="topbar-title">
          <strong>VGM 曲库</strong><span v-if="isLocalMedia" class="topbar-local-badge">本地</span>
        </div>
      </RouterLink>

      <nav class="topbar-nav">
        <RouterLink to="/series" class="topbar-nav-item">系列</RouterLink>
        <RouterLink to="/albums" class="topbar-nav-item">专辑</RouterLink>
        <RouterLink to="/collections" class="topbar-nav-item">歌单</RouterLink>
      </nav>

      <el-input
        v-model="search"
        class="topbar-search"
        placeholder="搜索专辑或曲目…"
        @keyup.enter="submitSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <div class="page-container">
      <RouterView />
    </div>
  </div>

  <PlayerBar />
</template>
