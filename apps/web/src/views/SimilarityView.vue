<script setup lang="ts">
import { UploadFilled } from '@element-plus/icons-vue'
import { ref } from 'vue'

import { searchSimilar } from '../api/client'
import type { SimilarTrackItemResponse } from '../api/client'
import { usePlayerStore } from '../stores/player'
import { formatDuration } from '../utils/format'

const player = usePlayerStore()
const loading = ref(false)
const results = ref<SimilarTrackItemResponse[]>([])
const fileName = ref('')
const errorMsg = ref('')

function handleFileChange(file: { raw: File }) {
  void runSearch(file.raw)
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (file) void runSearch(file)
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
}

async function runSearch(file: File) {
  fileName.value = file.name
  errorMsg.value = ''
  loading.value = true
  results.value = []

  try {
    results.value = await searchSimilar(file)
  } catch (err: any) {
    errorMsg.value = err?.response?.data?.message || err?.message || '搜索失败'
  } finally {
    loading.value = false
  }
}

function playTrack(index: number) {
  const tracks = results.value.map((item) => ({
    publicId: item.publicId,
    title: item.title,
    artist: item.artist,
    durationSeconds: item.durationSeconds,
    trackNumber: 0,
    discNumber: 1,
    mediaAssetId: item.mediaAssetId,
  }))
  void player.playQueue(tracks, index, '相似曲目')
}

function isActive(item: SimilarTrackItemResponse) {
  return player.currentTrack?.publicId === item.publicId
}

function scorePercent(score: number) {
  return `${Math.round(score * 100)}%`
}
</script>

<template>
  <div class="search-hero">
    <div class="section-eyebrow">以曲搜曲</div>
    <h1>旋律相似度搜索</h1>
    <p class="sim-hero-desc">上传一首音频文件，在整个曲库中查找旋律相似的歌曲。</p>
  </div>

  <!-- Upload area -->
  <div
    class="sim-upload-zone"
    @drop="handleDrop"
    @dragover="handleDragOver"
  >
    <el-upload
      :auto-upload="false"
      :show-file-list="false"
      accept="audio/*"
      @change="handleFileChange"
    >
      <div class="sim-upload-inner" :class="{ 'is-loading': loading }">
        <el-icon :size="40" class="sim-upload-icon"><UploadFilled /></el-icon>
        <div class="sim-upload-text">
          <template v-if="loading">
            <el-icon class="is-loading" :size="20" style="margin-right:8px">
              <svg viewBox="0 0 1024 1024"><path d="M512 64a32 32 0 0132 32v192a32 32 0 01-64 0V96a32 32 0 0132-32" fill="currentColor"/></svg>
            </el-icon>
            正在分析 "{{ fileName }}"…
          </template>
          <template v-else-if="fileName">
            已分析：{{ fileName }}
            <span class="sim-upload-hint">点击或拖拽更换文件</span>
          </template>
          <template v-else>
            <strong>点击选择</strong> 或拖拽音频文件到此处
            <span class="sim-upload-hint">支持 MP3 / FLAC / OGG / WAV / M4A</span>
          </template>
        </div>
      </div>
    </el-upload>
  </div>

  <!-- Error -->
  <el-alert
    v-if="errorMsg"
    type="error"
    :title="errorMsg"
    show-icon
    closable
    style="margin-bottom: 20px"
    @close="errorMsg = ''"
  />

  <!-- Results -->
  <section v-if="results.length" class="content-section">
    <div class="section-header">
      <div>
        <div class="section-eyebrow">搜索结果</div>
        <h2 class="section-title">找到 {{ results.length }} 首相似曲目</h2>
      </div>
    </div>

    <div class="sim-results">
      <div class="sim-results-header">
        <span class="sim-col-index">#</span>
        <span class="sim-col-title">曲目</span>
        <span class="sim-col-album">专辑</span>
        <span class="sim-col-score">相似度</span>
        <span class="sim-col-duration">时长</span>
      </div>

      <button
        v-for="(item, index) in results"
        :key="item.publicId"
        class="sim-result-row"
        :class="{ active: isActive(item) }"
        type="button"
        @click="playTrack(index)"
      >
        <span class="sim-col-index">
          <svg
            v-if="isActive(item) && player.isPlaying"
            width="14" height="14" fill="currentColor" viewBox="0 0 24 24"
          >
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.5 4.5 0 002.5-3.5z" />
          </svg>
          <template v-else>{{ index + 1 }}</template>
        </span>
        <span class="sim-col-title">
          <span class="sim-title-text">{{ item.title }}</span>
          <span class="sim-artist-text">{{ item.artist }}</span>
        </span>
        <span class="sim-col-album">
          <RouterLink
            v-if="item.albumId"
            :to="{ name: 'album', params: { id: item.albumId } }"
            class="sim-album-link"
            @click.stop
          >
            {{ item.albumTitle || '—' }}
          </RouterLink>
          <template v-else>—</template>
        </span>
        <span class="sim-col-score">
          <span class="sim-score-bar">
            <span class="sim-score-fill" :style="{ width: scorePercent(item.similarityScore) }" />
          </span>
          <span class="sim-score-text">{{ scorePercent(item.similarityScore) }}</span>
        </span>
        <span class="sim-col-duration">{{ formatDuration(item.durationSeconds) }}</span>
      </button>
    </div>
  </section>

  <el-empty
    v-else-if="!loading && fileName && !errorMsg"
    description="没有找到相似曲目。"
  />
</template>

<style scoped>
.sim-hero-desc {
  color: var(--text-2);
  font-size: 0.93rem;
  margin-top: 10px;
  max-width: 50ch;
}

/* Upload zone */
.sim-upload-zone {
  margin-bottom: 28px;
}

.sim-upload-zone :deep(.el-upload) {
  width: 100%;
}

.sim-upload-inner {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 28px 32px;
  border: 2px dashed var(--border-hover);
  border-radius: 14px;
  background: var(--surface-2);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.sim-upload-inner:hover {
  border-color: var(--accent);
  background: var(--surface-3);
}

.sim-upload-inner.is-loading {
  pointer-events: none;
  opacity: 0.7;
}

.sim-upload-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.sim-upload-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9rem;
  color: var(--text);
}

.sim-upload-text strong { color: var(--accent); }

.sim-upload-hint {
  font-size: 0.75rem;
  color: var(--text-3);
}

/* Results table */
.sim-results {
  display: flex;
  flex-direction: column;
}

.sim-results-header {
  display: flex;
  align-items: center;
  padding: 0 12px 10px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-bottom: 1px solid var(--border);
}

.sim-result-row {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text);
  font: inherit;
  text-align: left;
  transition: background 0.12s;
  width: 100%;
}

.sim-result-row:hover { background: var(--surface-2); }
.sim-result-row.active { background: var(--accent-dim); }
.sim-result-row.active .sim-col-index { color: var(--accent); }

/* Columns */
.sim-col-index  { width: 40px; flex-shrink: 0; text-align: center; font-size: 0.8rem; color: var(--text-3); }
.sim-col-title  { flex: 3; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sim-col-album  { flex: 2; min-width: 0; font-size: 0.82rem; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sim-col-score  { width: 130px; flex-shrink: 0; display: flex; align-items: center; gap: 8px; }
.sim-col-duration { width: 60px; flex-shrink: 0; text-align: right; font-size: 0.82rem; color: var(--text-2); font-variant-numeric: tabular-nums; }

.sim-title-text {
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sim-artist-text {
  font-size: 0.78rem;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sim-album-link {
  color: var(--text-2);
  transition: color 0.15s;
}
.sim-album-link:hover { color: var(--accent); }

/* Score bar */
.sim-score-bar {
  flex: 1;
  height: 4px;
  background: var(--surface-3);
  border-radius: 2px;
  overflow: hidden;
}

.sim-score-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  border-radius: 2px;
  transition: width 0.3s ease;
}

.sim-score-text {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  min-width: 36px;
  text-align: right;
}
</style>
