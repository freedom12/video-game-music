import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { TrackListItem } from '@vgm/shared'

export const usePlayerStore = defineStore('player', () => {
  const audio = ref<HTMLAudioElement | null>(null)
  const queue = ref<TrackListItem[]>([])
  const currentIndex = ref(-1)
  const queueLabel = ref('Queue')
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)

  const currentTrack = computed(() => (
    currentIndex.value >= 0 ? queue.value[currentIndex.value] : undefined
  ))

  function bindAudio(element: HTMLAudioElement) {
    audio.value = element
    element.addEventListener('play', () => {
      isPlaying.value = true
    })
    element.addEventListener('pause', () => {
      isPlaying.value = false
    })
    element.addEventListener('timeupdate', () => {
      currentTime.value = element.currentTime
      duration.value = Number.isFinite(element.duration) ? element.duration : 0
    })
    element.addEventListener('ended', () => {
      void next()
    })
  }

  async function playCurrent() {
    const element = audio.value
    const track = currentTrack.value
    if (!element || !track) {
      return
    }

    element.src = `/api/tracks/${track.publicId}/stream`
    await element.play()
  }

  async function playQueue(inputQueue: TrackListItem[], index: number, label = 'Queue') {
    queue.value = inputQueue
    queueLabel.value = label
    currentIndex.value = index
    currentTime.value = 0
    duration.value = 0
    await playCurrent()
  }

  async function toggle() {
    const element = audio.value
    if (!element) {
      return
    }

    if (element.paused) {
      await element.play()
      return
    }

    element.pause()
  }

  async function previous() {
    if (currentIndex.value <= 0) {
      return
    }

    currentIndex.value -= 1
    await playCurrent()
  }

  async function next() {
    if (currentIndex.value >= queue.value.length - 1) {
      return
    }

    currentIndex.value += 1
    await playCurrent()
  }

  function seek(ratio: number) {
    const element = audio.value
    if (!element || !duration.value) {
      return
    }

    element.currentTime = Math.max(0, Math.min(duration.value, duration.value * ratio))
  }

  return {
    queue,
    queueLabel,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    bindAudio,
    playQueue,
    toggle,
    previous,
    next,
    seek,
  }
})
