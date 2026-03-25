<script setup lang="ts">
import { computed } from 'vue'

import type { TrackListItem } from '@vgm/shared'

import { usePlayerStore } from '../stores/player'
import { formatDuration } from '../utils/format'

const props = withDefaults(defineProps<{
  tracks: TrackListItem[]
  queueLabel?: string
  groupByDisc?: boolean
  coverAssetId?: string
}>(), {
  queueLabel: '--',
  groupByDisc: false,
  coverAssetId: undefined,
})

const player = usePlayerStore()

const groups = computed(() => {
  if (!props.groupByDisc) {
    return [{ key: 'all', title: '', tracks: props.tracks }]
  }

  const map = new Map<number, TrackListItem[]>()
  for (const track of props.tracks) {
    const list = map.get(track.discNumber) ?? []
    list.push(track)
    map.set(track.discNumber, list)
  }

  return [...map.entries()].map(([discNumber, tracks]) => ({
    key: `${discNumber}`,
    title: tracks[0]?.discTitle || `第 ${discNumber} 张盘`,
    tracks,
  }))
})

function playTrack(index: number) {
  void player.playQueue(props.tracks, index, props.queueLabel, props.coverAssetId)
}

function isActive(track: TrackListItem) {
  return player.currentTrack?.publicId === track.publicId
}
</script>

<template>
  <div class="track-groups">
    <section v-for="group in groups" :key="group.key" class="track-group">
      <div v-if="group.title" class="track-group-label">
        {{ group.title }}
      </div>

      <div class="track-list">
        <button
          v-for="track in group.tracks"
          :key="track.publicId"
          class="track-row"
          :class="{ active: isActive(track) }"
          type="button"
          @click="playTrack(props.tracks.findIndex((t) => t.publicId === track.publicId))"
        >
          <span class="track-index">
            <svg
              v-if="isActive(track) && player.isPlaying"
              width="14"
              height="14"
              fill="currentColor"
              viewBox="0 0 24 24"
              style="margin-left:auto"
            >
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
            <template v-else>{{ track.trackNumber || '·' }}</template>
          </span>
          <span class="track-info">
            <span class="track-name">{{ track.title }}</span>
            <span class="track-artist">{{ track.artist }}</span>
          </span>
          <span class="track-duration">{{ formatDuration(track.durationSeconds) }}</span>
        </button>
      </div>
    </section>
  </div>
</template>
