import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { TrackListItem } from '@vgm/shared'

const DEFAULT_QUEUE_LABEL = '\u64ad\u653e\u961f\u5217'

export const usePlayerStore = defineStore('player', () => {
  const audio = ref<HTMLAudioElement | null>(null)
  const queue = ref<TrackListItem[]>([])
  const currentIndex = ref(-1)
  const queueLabel = ref(DEFAULT_QUEUE_LABEL)
  const coverAssetId = ref<string | undefined>()
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const volume = ref(1)
  const isMuted = ref(false)

  const currentTrack = computed(() => (
    currentIndex.value >= 0 ? queue.value[currentIndex.value] : undefined
  ))

  function syncVolume() {
    if (audio.value) {
      audio.value.volume = isMuted.value ? 0 : volume.value
    }
  }

  function bindAudio(element: HTMLAudioElement) {
    audio.value = element
    syncVolume()
    element.addEventListener('play', () => { isPlaying.value = true })
    element.addEventListener('pause', () => { isPlaying.value = false })
    element.addEventListener('timeupdate', () => {
      currentTime.value = element.currentTime
      duration.value = Number.isFinite(element.duration) ? element.duration : 0
    })
    element.addEventListener('ended', () => { void next() })
  }

  function setVolume(v: number) {
    volume.value = Math.max(0, Math.min(1, v))
    isMuted.value = false
    syncVolume()
  }

  function toggleMute() {
    isMuted.value = !isMuted.value
    syncVolume()
  }

  async function playCurrent() {
    const element = audio.value
    const track = currentTrack.value
    if (!element || !track) return
    element.src = `/api/tracks/${track.publicId}/stream`
    await element.play()
  }

  async function playQueue(
    inputQueue: TrackListItem[],
    index: number,
    label = DEFAULT_QUEUE_LABEL,
    cover?: string,
  ) {
    queue.value = inputQueue
    queueLabel.value = label
    coverAssetId.value = cover
    currentIndex.value = index
    currentTime.value = 0
    duration.value = 0
    await playCurrent()
  }

  async function toggle() {
    const element = audio.value
    if (!element) return
    if (element.paused) { await element.play(); return }
    element.pause()
  }

  async function previous() {
    if (currentIndex.value <= 0) return
    currentIndex.value -= 1
    await playCurrent()
  }

  async function next() {
    if (currentIndex.value >= queue.value.length - 1) return
    currentIndex.value += 1
    await playCurrent()
  }

  function seek(ratio: number) {
    const element = audio.value
    if (!element || !duration.value) return
    element.currentTime = Math.max(0, Math.min(duration.value, duration.value * ratio))
  }

  return {
    queue,
    queueLabel,
    coverAssetId,
    currentIndex,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    bindAudio,
    playQueue,
    playAt: async (index: number) => {
      if (index < 0 || index >= queue.value.length) return
      currentIndex.value = index
      currentTime.value = 0
      duration.value = 0
      await playCurrent()
    },
    toggle,
    previous,
    next,
    seek,
    setVolume,
    toggleMute,
  }
})
