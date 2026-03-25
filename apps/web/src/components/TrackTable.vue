<script setup lang="ts">
import { CaretRight } from '@element-plus/icons-vue'
import { computed } from 'vue'

import type { TrackListItem } from '@vgm/shared'

import { usePlayerStore } from '../stores/player'
import { formatDuration } from '../utils/format'

const props = withDefaults(defineProps<{
  tracks: TrackListItem[]
  queueLabel?: string
  groupByDisc?: boolean
}>(), {
  queueLabel: 'Queue',
  groupByDisc: false,
})

const player = usePlayerStore()

const groups = computed(() => {
  if (!props.groupByDisc) {
    return [{
      key: 'all',
      title: '',
      tracks: props.tracks,
    }]
  }

  const map = new Map<number, TrackListItem[]>()
  for (const track of props.tracks) {
    const list = map.get(track.discNumber) ?? []
    list.push(track)
    map.set(track.discNumber, list)
  }

  return [...map.entries()].map(([discNumber, tracks]) => ({
    key: `${discNumber}`,
    title: tracks[0]?.discTitle || `Disc ${discNumber}`,
    tracks,
  }))
})

function playTrack(index: number) {
  void player.playQueue(props.tracks, index, props.queueLabel)
}
</script>

<template>
  <div class="track-groups">
    <section v-for="group in groups" :key="group.key" class="track-group">
      <header v-if="group.title" class="track-group-header">
        <span>Disc Segment</span>
        <strong>{{ group.title }}</strong>
      </header>

      <div class="track-list">
        <button
          v-for="track in group.tracks"
          :key="track.publicId"
          class="track-row"
          type="button"
          @click="playTrack(props.tracks.findIndex((item) => item.publicId === track.publicId))"
        >
          <span class="track-meta">
            <strong>{{ track.trackNumber || '-' }}</strong>
            <em>{{ track.title }}</em>
          </span>
          <span class="track-side">
            <small>{{ track.artist }}</small>
            <small>{{ formatDuration(track.durationSeconds) }}</small>
            <el-icon><CaretRight /></el-icon>
          </span>
        </button>
      </div>
    </section>
  </div>
</template>
