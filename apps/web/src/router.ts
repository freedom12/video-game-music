import { createRouter, createWebHistory } from 'vue-router'

import AdminView from './views/AdminView.vue'
import AlbumListView from './views/AlbumListView.vue'
import AlbumView from './views/AlbumView.vue'
import CollectionListView from './views/CollectionListView.vue'
import CollectionView from './views/CollectionView.vue'
import SearchView from './views/SearchView.vue'
import SeriesListView from './views/SeriesListView.vue'
import SeriesView from './views/SeriesView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/series' },
    { path: '/series', name: 'series-list', component: SeriesListView },
    { path: '/series/:id', name: 'series', component: SeriesView },
    { path: '/albums', name: 'album-list', component: AlbumListView },
    { path: '/albums/:id', name: 'album', component: AlbumView },
    { path: '/collections', name: 'collections-list', component: CollectionListView },
    { path: '/collections/:id', name: 'collection', component: CollectionView },
    { path: '/search', name: 'search', component: SearchView },
    { path: '/admin', name: 'admin', component: AdminView },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})
