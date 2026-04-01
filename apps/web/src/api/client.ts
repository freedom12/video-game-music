import axios from 'axios'

import type {
  AlbumDetail,
  AlbumListItem,
  CollectionDetail,
  CollectionListItem,
  LibrarySearchResult,
  SeriesDetail,
  SeriesListItem,
  SimilarTrack,
  TrackDetail,
} from '@vgm/shared'

export type { CollectionListItem, SeriesListItem, SeriesDetail }

const api = axios.create({
  baseURL: '/api',
})

export async function fetchMediaSource(): Promise<'local' | 'cos'> {
  const { data } = await api.get<{ source: 'local' | 'cos' }>('/media-source')
  return data.source
}

export async function fetchAlbums() {
  const { data } = await api.get<AlbumListItem[]>('/albums')
  return data
}

export async function fetchAlbum(id: string) {
  const { data } = await api.get<AlbumDetail>(`/albums/${id}`)
  return data
}

export async function fetchTrack(id: string) {
  const { data } = await api.get<TrackDetail>(`/tracks/${id}`)
  return data
}

export async function fetchCollections() {
  const { data } = await api.get<CollectionListItem[]>('/collections')
  return data
}

export async function fetchCollection(id: string) {
  const { data } = await api.get<CollectionDetail>(`/collections/${id}`)
  return data
}

export async function searchCatalog(query: string) {
  const { data } = await api.get<LibrarySearchResult>('/search', {
    params: { q: query },
  })
  return data
}

export async function fetchSeries() {
  const { data } = await api.get<SeriesListItem[]>('/series')
  return data
}

export async function fetchSeriesDetail(id: string) {
  const { data } = await api.get<SeriesDetail>(`/series/${id}`)
  return data
}

export interface SimilarTrackItemResponse extends SimilarTrack {
  streamUrl: string
  coverUrl?: string
}

export async function searchSimilar(file: File, limit = 20) {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<{ items: SimilarTrackItemResponse[] }>(
    `/similarity/search?limit=${limit}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data.items
}
