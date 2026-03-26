<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { usePlayerStore } from '../stores/player'
import { formatDuration } from '../utils/format'

const player = usePlayerStore()
const audioRef = ref<HTMLAudioElement>()
const showQueue = ref(false)
const queueListRef = ref<HTMLElement>()

onMounted(() => {
  if (audioRef.value) {
    player.bindAudio(audioRef.value)
  }
})

const progress = computed(() => (
  player.duration > 0 ? player.currentTime / player.duration : 0
))

// 可写 computed：读取时考虑静音状态，写入时调用 setVolume
const volumeModel = computed<number>({
  get: (): number => player.isMuted ? 0 : (player.volume ?? 1),
  set: (v: number) => player.setVolume(v),
})

function scrollToActive() {
  if (!queueListRef.value) return
  const active = queueListRef.value.querySelector('.queue-item.active') as HTMLElement
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function toggleQueue() {
  showQueue.value = !showQueue.value
  if (showQueue.value) setTimeout(scrollToActive, 60)
}
</script>

<template>
  <!-- Queue panel (above player bar) -->
  <Transition name="queue-slide">
    <div v-if="showQueue && player.queue.length" class="queue-panel">
      <div class="queue-panel-header">
        <span class="queue-panel-title">
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="flex-shrink:0">
            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
          </svg>
          {{ player.queueLabel }}
        </span>
        <span class="queue-panel-count">{{ player.queue.length }} 首</span>
      </div>
      <div ref="queueListRef" class="queue-list">
        <button
          v-for="(track, i) in player.queue"
          :key="track.publicId"
          class="queue-item"
          :class="{ active: i === player.currentIndex }"
          type="button"
          @click="player.playAt(i)"
        >
          <span class="queue-item-index">
            <svg
              v-if="i === player.currentIndex && player.isPlaying"
              width="12" height="12" fill="currentColor" viewBox="0 0 24 24"
            >
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
            <svg
              v-else-if="i === player.currentIndex"
              width="12" height="12" fill="currentColor" viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span class="queue-item-info">
            <span class="queue-item-title">{{ track.title }}</span>
            <span class="queue-item-artist">{{ track.artist }}</span>
          </span>
          <span class="queue-item-dur">{{ formatDuration(Math.round(track.durationSeconds ?? 0)) }}</span>
        </button>
      </div>
    </div>
  </Transition>

  <footer class="player-bar">
    <audio ref="audioRef" preload="none" />

    <!-- Left: cover + track info -->
    <div class="player-track">
      <div class="player-cover">
        <img
          v-if="player.activeCoverUrl"
          :src="player.activeCoverUrl"
          alt=""
        />
        <div v-else class="player-cover-fallback">🎵</div>
      </div>
      <div class="player-meta">
        <span class="player-title">{{ player.currentTrack?.title ?? '选择曲目开始播放' }}</span>
        <span class="player-artist">{{ player.currentTrack?.artist }}</span>
      </div>
    </div>

    <!-- Center: controls + progress -->
    <div class="player-center">
      <div class="player-controls">
        <button class="ctrl-btn" title="上一首" @click="player.previous">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
          </svg>
        </button>
        <button class="ctrl-btn ctrl-btn--play" :title="player.isPlaying ? '暂停' : '播放'" @click="player.toggle">
          <svg v-if="player.isPlaying" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
          <svg v-else width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        <button class="ctrl-btn" title="下一首" @click="player.next">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z" />
          </svg>
        </button>
      </div>

      <div class="player-progress-row">
        <span class="time-label">{{ formatDuration(Math.round(player.currentTime)) }}</span>
        <el-slider
          :model-value="progress"
          :max="1"
          :step="0.001"
          :show-tooltip="false"
          @input="player.seek"
        />
        <span class="time-label">{{ formatDuration(Math.round(player.duration)) }}</span>
      </div>
    </div>

    <!-- Right: volume + queue toggle -->
    <div class="player-right">
      <button class="ctrl-btn volume-btn" :title="player.isMuted ? '取消静音' : '静音'" @click="player.toggleMute">
        <!-- muted -->
        <svg v-if="player.isMuted || player.volume === 0" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
          <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
        </svg>
        <!-- low volume -->
        <svg v-else-if="player.volume < 0.5" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
          <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
        </svg>
        <!-- full volume -->
        <svg v-else width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
        </svg>
      </button>
      <el-slider
        v-model="volumeModel"
        :max="1"
        :step="0.01"
        :show-tooltip="false"
        class="volume-slider"
      />
      <button
        class="ctrl-btn mode-btn"
        :class="{ 'mode-btn--active': player.playMode !== 'sequential' }"
        :title="{ sequential: '顺序播放', 'repeat-all': '列表循环', 'repeat-one': '单曲循环', shuffle: '随机播放' }[player.playMode]"
        @click="player.toggleMode"
      >
        <!-- shuffle -->
        <svg v-if="player.playMode === 'shuffle'" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
        </svg>
        <!-- repeat-one -->
        <span v-else-if="player.playMode === 'repeat-one'" class="mode-icon-wrap">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
          </svg>
          <span class="mode-one-label">1</span>
        </span>
        <!-- repeat-all -->
        <svg v-else-if="player.playMode === 'repeat-all'" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
          <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
        </svg>
        <!-- sequential (dimmed repeat icon) -->
        <svg v-else width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style="opacity:0.4">
          <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
        </svg>
      </button>
      <button
        class="ctrl-btn queue-toggle-btn"
        :class="{ active: showQueue }"
        title="播放队列"
        @click="toggleQueue"
      >
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
        </svg>
      </button>
    </div>
  </footer>
</template>
