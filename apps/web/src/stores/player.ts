import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { TrackListItem } from '@vgm/shared'
import { useAudioEngine } from '../composables/useAudioEngine'

const DEFAULT_QUEUE_LABEL = '\u64ad\u653e\u961f\u5217'

export type PlayMode = 'sequential' | 'repeat-all' | 'repeat-one' | 'shuffle'
const PLAY_MODES: PlayMode[] = ['sequential', 'repeat-all', 'repeat-one', 'shuffle']

export const usePlayerStore = defineStore('player', () => {
  const engine = useAudioEngine()
  const queue = ref<TrackListItem[]>([])
  const currentIndex = ref(-1)
  const queueLabel = ref(DEFAULT_QUEUE_LABEL)
  const coverId = ref<string | undefined>()
  const playMode = ref<PlayMode>('sequential')

  const currentTrack = computed(() => (
    currentIndex.value >= 0 ? queue.value[currentIndex.value] : undefined
  ))

  const activeCoverUrl = computed(() =>
    engine.embeddedCoverUrl.value
    ?? (coverId.value ? `/covers/${coverId.value}.png` : undefined),
  )

  function bindAudio(element: HTMLAudioElement) {
    engine.bind(element)
    element.addEventListener('ended', () => { void next() })
  }

  async function playCurrent() {
    const track = currentTrack.value
    if (!track) return
    await engine.play(track.publicId)
  }

  async function playQueue(
    inputQueue: TrackListItem[],
    index: number,
    label = DEFAULT_QUEUE_LABEL,
    cover?: string,
  ) {
    queue.value = inputQueue
    queueLabel.value = label
    coverId.value = cover
    currentIndex.value = index
    engine.currentTime.value = 0
    engine.duration.value = 0
    await playCurrent()
  }

  async function previous() {
    const len = queue.value.length
    if (len === 0) return
    if (playMode.value === 'repeat-one') {
      await engine.restart()
      return
    }
    if (playMode.value === 'shuffle') {
      if (len === 1) { await engine.restart(); return }
      let idx: number
      do { idx = Math.floor(Math.random() * len) } while (idx === currentIndex.value)
      currentIndex.value = idx
      await playCurrent()
      return
    }
    if (playMode.value === 'repeat-all') {
      currentIndex.value = (currentIndex.value - 1 + len) % len
      await playCurrent()
      return
    }
    // sequential
    if (currentIndex.value <= 0) return
    currentIndex.value -= 1
    await playCurrent()
  }

  async function next() {
    const len = queue.value.length
    if (len === 0) return
    if (playMode.value === 'repeat-one') {
      await engine.restart()
      return
    }
    if (playMode.value === 'shuffle') {
      if (len === 1) { await engine.restart(); return }
      let idx: number
      do { idx = Math.floor(Math.random() * len) } while (idx === currentIndex.value)
      currentIndex.value = idx
      await playCurrent()
      return
    }
    if (playMode.value === 'repeat-all') {
      currentIndex.value = (currentIndex.value + 1) % len
      await playCurrent()
      return
    }
    // sequential
    if (currentIndex.value >= len - 1) return
    currentIndex.value += 1
    await playCurrent()
  }

  function toggleMode() {
    const idx = PLAY_MODES.indexOf(playMode.value)
    playMode.value = PLAY_MODES[(idx + 1) % PLAY_MODES.length] as PlayMode
  }

  return {
    queue,
    queueLabel,
    coverId,
    currentIndex,
    currentTrack,
    activeCoverUrl,
    isPlaying: engine.isPlaying,
    currentTime: engine.currentTime,
    duration: engine.duration,
    volume: engine.volume,
    isMuted: engine.isMuted,
    bindAudio,
    playQueue,
    playAt: async (index: number) => {
      if (index < 0 || index >= queue.value.length) return
      currentIndex.value = index
      engine.currentTime.value = 0
      engine.duration.value = 0
      await playCurrent()
    },
    toggle: engine.toggle,
    previous,
    next,
    seek: engine.seek,
    setVolume: engine.setVolume,
    toggleMute: engine.toggleMute,
    playMode,
    toggleMode,
  }
})
