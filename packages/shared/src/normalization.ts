import path from 'node:path';

const pathSeparatorPattern = /\\/g;
const sortablePrefixPattern = /^\d+\.\s*/;

export const SUPPORTED_AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.ogg', '.wav', '.m4a']);
export const SUPPORTED_COVER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export function normalizeRelativePath(libraryRoot: string, absolutePath: string): string {
  const relativePath = path.relative(libraryRoot, absolutePath);

  return relativePath.replace(pathSeparatorPattern, '/');
}

export function toPosixPath(value: string): string {
  return value.replace(pathSeparatorPattern, '/');
}

export function sanitizeSegment(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
}

export function makeSourceKey(
  albumArtist: string,
  album: string,
  discNumber: number | undefined,
  trackNumber: number | undefined,
  title: string,
): string {
  const normalizedArtist = normalizeDisplayValue(albumArtist).toLowerCase();
  const normalizedAlbum = normalizeDisplayValue(album).toLowerCase();
  const normalizedDisc = discNumber != null ? `${discNumber}` : '0';
  const normalizedTrack = trackNumber != null ? `${trackNumber}` : '0';
  const normalizedTitle = normalizeDisplayValue(title).toLowerCase();
  return `${normalizedArtist}::${normalizedAlbum}::${normalizedDisc}::${normalizedTrack}::${normalizedTitle}`;
}

export function normalizeDisplayValue(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizeSortTitle(value: string): string {
  return normalizeDisplayValue(value).replace(sortablePrefixPattern, '').toLowerCase();
}

export function makeAlbumKey(album: string, albumArtist: string): string {
  const normalizedAlbum = normalizeDisplayValue(album).toLowerCase();
  const normalizedArtist = normalizeDisplayValue(albumArtist).toLowerCase();

  return `${normalizedArtist}::${normalizedAlbum}`;
}

export function makeSeriesKey(seriesName: string): string {
  return normalizeDisplayValue(seriesName).toLowerCase();
}

/**
 * 从专辑的 sourceDirectory 路径中提取系列名（第一层文件夹名）。
 * 例如 "Pokemon/01. Pokemon Red" → "Pokemon"
 */
export function parseSeriesFromPath(sourceDirectory: string | undefined): string | undefined {
  if (!sourceDirectory) return undefined;
  const segments = sourceDirectory.split('/');
  return segments[0] || undefined;
}

/**
 * 从专辑的 sourceDirectory 中提取该专辑在系列内的排序序号。
 * 第二层文件夹若以 "XX." 开头（如 "01. Pokemon Red"），则提取 1 作为 sortOrder。
 */
export function parseAlbumSortOrderInSeries(sourceDirectory: string | undefined): number | undefined {
  if (!sourceDirectory) return undefined;
  const segments = sourceDirectory.split('/');
  const albumSegment = segments.length >= 2 ? segments[1] : undefined;
  if (!albumSegment) return undefined;

  const match = /^(\d+)\.\s*/.exec(albumSegment);
  if (!match) return undefined;

  return Number.parseInt(match[1]!, 10);
}

export function parseTagNumber(value: string | number | undefined | null): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const numericPrefix = value.split('/')[0]?.trim();

  if (!numericPrefix) {
    return undefined;
  }

  const parsed = Number.parseInt(numericPrefix, 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export function safeFileStem(relativePath: string): string {
  const parsedPath = path.parse(relativePath);
  return sanitizeSegment(parsedPath.name).toLowerCase();
}

export function buildCoverFileName(publicId: string, extension: string): string {
  const normalizedExtension = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  return `${publicId}${normalizedExtension}`;
}

export function compareTrackOrder(
  left: { discNumber?: number; trackNumber?: number; relativePath?: string },
  right: { discNumber?: number; trackNumber?: number; relativePath?: string },
): number {
  return (
    (left.discNumber ?? 0) - (right.discNumber ?? 0)
    || (left.trackNumber ?? 0) - (right.trackNumber ?? 0)
    || (left.relativePath ?? '').localeCompare(right.relativePath ?? '')
  );
}
