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

export function makeSourceKey(relativePath: string): string {
  return toPosixPath(relativePath).toLowerCase();
}

export function normalizeDisplayValue(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizeSortTitle(value: string): string {
  return normalizeDisplayValue(value).replace(sortablePrefixPattern, '').toLowerCase();
}

export function makeAlbumKey(album: string, albumArtist: string, year?: number): string {
  const normalizedAlbum = normalizeDisplayValue(album).toLowerCase();
  const normalizedArtist = normalizeDisplayValue(albumArtist).toLowerCase();
  const normalizedYear = year ? `${year}` : 'unknown-year';

  return `${normalizedArtist}::${normalizedAlbum}::${normalizedYear}`;
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
