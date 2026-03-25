import axios from 'axios'

import type { AlbumDetail, AlbumListItem, CollectionDetail, SearchResult, TrackRecord } from '@vgm/shared'

export interface CollectionSummary {
  publicId: string
  title: string
  description?: string
  status: 'draft' | 'published'
  coverAssetId?: string
  trackCount: number
}

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem('vgm-admin-token')
  if (token) {
    config.headers['x-admin-token'] = token
  }
  return config
})

export async function fetchAlbums() {
  const { data } = await api.get<AlbumListItem[]>('/albums')
  return data
}

export async function fetchAlbum(id: string) {
  const { data } = await api.get<AlbumDetail>(`/albums/${id}`)
  return data
}

export async function fetchTrack(id: string) {
  const { data } = await api.get<TrackRecord>(`/tracks/${id}`)
  return data
}

export async function fetchCollections() {
  const { data } = await api.get<CollectionSummary[]>('/collections')
  return data
}

export async function fetchCollection(id: string) {
  const { data } = await api.get<CollectionDetail>(`/collections/${id}`)
  return data
}

export async function searchCatalog(query: string) {
  const { data } = await api.get<SearchResult>('/search', {
    params: { q: query },
  })
  return data
}

export async function scanLibrary() {
  const { data } = await api.post('/admin/import/scan')
  return data
}

export async function commitLibrary() {
  const { data } = await api.post('/admin/import/commit')
  return data
}

export async function syncCos() {
  const { data } = await api.post('/admin/sync/cos')
  return data
}

export async function createCollection(payload: {
  title: string
  description?: string
  coverAssetId?: string
  status: 'draft' | 'published'
}) {
  const { data } = await api.post('/admin/collections', payload)
  return data
}

export async function addTracksToCollection(collectionId: string, trackIds: string[]) {
  const { data } = await api.post(`/admin/collections/${collectionId}/tracks`, { trackIds })
  return data
}
