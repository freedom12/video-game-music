import { ref } from 'vue'

export function useAudioEngine() {
  const element = ref<HTMLAudioElement | null>(null)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const volume = ref(1)
  const isMuted = ref(false)
  const embeddedCoverUrl = ref<string | undefined>()

  let coverFetchSeq = 0

  function syncVolume() {
    if (element.value) {
      element.value.volume = isMuted.value ? 0 : volume.value
    }
  }

  function bind(el: HTMLAudioElement) {
    element.value = el
    syncVolume()
    el.addEventListener('play', () => { isPlaying.value = true })
    el.addEventListener('pause', () => { isPlaying.value = false })
    el.addEventListener('timeupdate', () => {
      currentTime.value = el.currentTime
      duration.value = Number.isFinite(el.duration) ? el.duration : 0
    })
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

  async function play(trackId: string) {
    const el = element.value
    if (!el) return

    if (embeddedCoverUrl.value?.startsWith('blob:')) URL.revokeObjectURL(embeddedCoverUrl.value)
    embeddedCoverUrl.value = undefined

    el.src = `/api/tracks/${trackId}/stream`
    await el.play()

    // todo 考虑服务器负担暂时不请求每首曲目的内置封面资源
    // const seq = ++coverFetchSeq
    // void (async () => {
    //   try {
    //     const resp = await fetch(`/api/tracks/${trackId}/embedded-cover`)
    //     if (seq !== coverFetchSeq || !resp.ok) return
    //     const blob = await resp.blob()
    //     if (seq !== coverFetchSeq) return
    //     if (embeddedCoverUrl.value?.startsWith('blob:')) URL.revokeObjectURL(embeddedCoverUrl.value)
    //     embeddedCoverUrl.value = URL.createObjectURL(blob)
    //   }
    //   catch { /* ignore */ }
    // })()
  }

  async function toggle() {
    const el = element.value
    if (!el) return
    if (el.paused) { await el.play(); return }
    el.pause()
  }

  async function restart() {
    const el = element.value
    if (!el) return
    el.currentTime = 0
    await el.play()
  }

  function seek(ratio: number) {
    const el = element.value
    if (!el || !duration.value) return
    el.currentTime = Math.max(0, Math.min(duration.value, duration.value * ratio))
  }

  return {
    element,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    embeddedCoverUrl,
    bind,
    play,
    toggle,
    restart,
    seek,
    setVolume,
    toggleMute,
  }
}
