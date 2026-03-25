<script setup lang="ts">
import { Back, CaretRight, DArrowRight, VideoPause } from '@element-plus/icons-vue'
import { computed, onMounted, ref } from 'vue'

import { usePlayerStore } from '../stores/player'
import { formatDuration } from '../utils/format'

const player = usePlayerStore()
const audioRef = ref<HTMLAudioElement>()

onMounted(() => {
  if (audioRef.value) {
    player.bindAudio(audioRef.value)
  }
})

const progress = computed(() => (
  player.duration > 0 ? player.currentTime / player.duration : 0
))
</script>

<template>
  <footer class="player-bar">
    <audio ref="audioRef" preload="none" />

    <div class="player-track">
      <span class="player-context">{{ player.queueLabel }}</span>
      <strong>{{ player.currentTrack?.title ?? 'Select a track to begin playback' }}</strong>
      <span>{{ player.currentTrack?.artist ?? 'Local library or COS stream' }}</span>
    </div>

    <div class="player-controls">
      <el-button circle @click="player.previous">
        <el-icon><Back /></el-icon>
      </el-button>
      <el-button circle type="primary" @click="player.toggle">
        <el-icon>
          <VideoPause v-if="player.isPlaying" />
          <CaretRight v-else />
        </el-icon>
      </el-button>
      <el-button circle @click="player.next">
        <el-icon><DArrowRight /></el-icon>
      </el-button>
    </div>

    <div class="player-progress">
      <span>{{ formatDuration(Math.round(player.currentTime)) }}</span>
      <el-slider
        :model-value="progress"
        :max="1"
        :step="0.001"
        :show-tooltip="false"
        @input="player.seek"
      />
      <span>{{ formatDuration(Math.round(player.duration)) }}</span>
    </div>
  </footer>
</template>
