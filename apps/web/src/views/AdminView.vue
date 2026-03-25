<script setup lang="ts">
import { onMounted, ref } from 'vue'

import type { TrackListItem } from '@vgm/shared'

import {
  addTracksToCollection,
  commitLibrary,
  createCollection,
  fetchCollections,
  scanLibrary,
  searchCatalog,
  syncCos,
  type CollectionSummary,
} from '../api/client'

const adminToken = ref(window.localStorage.getItem('vgm-admin-token') ?? '')
const collections = ref<CollectionSummary[]>([])
const selectedCollectionId = ref('')
const createForm = ref({
  title: '',
  description: '',
  status: 'draft' as 'draft' | 'published',
})
const jobResult = ref<string>('')
const searchKeyword = ref('')
const searchResults = ref<TrackListItem[]>([])
const loading = ref(false)

function saveToken() {
  window.localStorage.setItem('vgm-admin-token', adminToken.value)
}

async function loadCollections() {
  collections.value = await fetchCollections()
  if (!selectedCollectionId.value && collections.value.length > 0) {
    selectedCollectionId.value = collections.value[0]!.publicId
  }
}

async function runAction(action: 'scan' | 'commit' | 'sync') {
  loading.value = true
  try {
    const result = action === 'scan'
      ? await scanLibrary()
      : action === 'commit'
        ? await commitLibrary()
        : await syncCos()
    jobResult.value = JSON.stringify(result, null, 2)
    await loadCollections()
  } finally {
    loading.value = false
  }
}

async function submitCollection() {
  loading.value = true
  try {
    await createCollection(createForm.value)
    createForm.value = { title: '', description: '', status: 'draft' }
    await loadCollections()
  } finally {
    loading.value = false
  }
}

async function runSearch() {
  if (!searchKeyword.value) {
    searchResults.value = []
    return
  }

  loading.value = true
  try {
    const result = await searchCatalog(searchKeyword.value)
    searchResults.value = result.tracks
  } finally {
    loading.value = false
  }
}

async function addTrack(trackId: string) {
  if (!selectedCollectionId.value) {
    return
  }

  loading.value = true
  try {
    await addTracksToCollection(selectedCollectionId.value, [trackId])
    await loadCollections()
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadCollections()
})
</script>

<template>
  <section class="section-block section-block--admin">
    <div class="section-head">
      <div>
        <span class="eyebrow">Admin</span>
        <h1>Import, sync, and curate</h1>
      </div>
    </div>

    <div class="admin-grid">
      <el-card shadow="never">
        <template #header>
          <strong>Admin Token</strong>
        </template>
        <el-input v-model="adminToken" placeholder="Optional x-admin-token" />
        <el-button class="admin-action" type="primary" @click="saveToken">
          Save Token
        </el-button>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <strong>Library Jobs</strong>
        </template>
        <div class="admin-actions">
          <el-button :loading="loading" @click="runAction('scan')">Scan Library</el-button>
          <el-button :loading="loading" type="primary" @click="runAction('commit')">Commit Import</el-button>
          <el-button :loading="loading" type="success" @click="runAction('sync')">Sync COS</el-button>
        </div>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <strong>Create Playlist</strong>
        </template>
        <el-form label-position="top">
          <el-form-item label="Title">
            <el-input v-model="createForm.title" />
          </el-form-item>
          <el-form-item label="Description">
            <el-input v-model="createForm.description" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item label="Status">
            <el-select v-model="createForm.status">
              <el-option label="Draft" value="draft" />
              <el-option label="Published" value="published" />
            </el-select>
          </el-form-item>
          <el-button :loading="loading" type="primary" @click="submitCollection">
            Create
          </el-button>
        </el-form>
      </el-card>
    </div>
  </section>

  <section class="section-block">
    <div class="section-head">
      <div>
        <span class="eyebrow">Curated Playlists</span>
        <h2>Add Tracks</h2>
      </div>
    </div>

    <div class="admin-toolbar">
      <el-select v-model="selectedCollectionId" placeholder="Select playlist">
        <el-option
          v-for="collection in collections"
          :key="collection.publicId"
          :label="collection.title"
          :value="collection.publicId"
        />
      </el-select>

      <el-input
        v-model="searchKeyword"
        placeholder="Search tracks to add"
        @keyup.enter="runSearch"
      />
      <el-button type="primary" @click="runSearch">
        Search
      </el-button>
    </div>

    <div class="admin-results">
      <button
        v-for="track in searchResults"
        :key="track.publicId"
        class="track-row"
        type="button"
        @click="addTrack(track.publicId)"
      >
        <span class="track-meta">
          <strong>{{ track.trackNumber || '-' }}</strong>
          <em>{{ track.title }}</em>
        </span>
        <span class="track-side">
          <small>{{ track.artist }}</small>
          <small>Add to playlist</small>
        </span>
      </button>
    </div>

    <el-empty v-if="!searchResults.length" description="Search for tracks and add them to a playlist." />
  </section>

  <section class="section-block">
    <div class="section-head">
      <div>
        <span class="eyebrow">Latest Result</span>
        <h2>Job Output</h2>
      </div>
    </div>
    <pre class="admin-output">{{ jobResult || 'No job executed yet.' }}</pre>
  </section>
</template>
