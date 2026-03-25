<script setup lang="ts">
import { Search } from '@element-plus/icons-vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import PlayerBar from './components/PlayerBar.vue'

const route = useRoute()
const router = useRouter()
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')

watch(
  () => route.query.q,
  (value) => {
    search.value = typeof value === 'string' ? value : ''
  },
)

const isAdminRoute = computed(() => route.path.startsWith('/admin'))

function submitSearch() {
  router.push({
    name: 'search',
    query: search.value ? { q: search.value } : {},
  })
}
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <RouterLink class="brand" to="/">
        <span class="brand-kicker">Video Game Music</span>
        <strong class="brand-title">Archive Player</strong>
      </RouterLink>

      <div class="site-actions">
        <el-input
          v-model="search"
          class="site-search"
          placeholder="Search albums and tracks"
          @keyup.enter="submitSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button type="primary" plain @click="submitSearch">
          Search
        </el-button>
        <RouterLink class="nav-link" :class="{ active: isAdminRoute }" to="/admin">
          Admin
        </RouterLink>
      </div>
    </header>

    <main class="page-shell">
      <RouterView />
    </main>

    <PlayerBar />
  </div>
</template>
