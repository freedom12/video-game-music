export function formatDuration(value: number) {
  const minutes = Math.floor(value / 60)
  const seconds = Math.round(value % 60)
  return `${minutes}:${`${seconds}`.padStart(2, '0')}`
}
