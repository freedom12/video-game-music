import { createRouter, createWebHistory } from 'vue-router'

import AdminView from './views/AdminView.vue'
import AlbumView from './views/AlbumView.vue'
import CollectionView from './views/CollectionView.vue'
import HomeView from './views/HomeView.vue'
import SearchView from './views/SearchView.vue'
import SeriesView from './views/SeriesView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/albums/:id', name: 'album', component: AlbumView },
    { path: '/collections/:id', name: 'collection', component: CollectionView },
    { path: '/series/:id', name: 'series', component: SeriesView },
    { path: '/search', name: 'search', component: SearchView },
    { path: '/admin', name: 'admin', component: AdminView },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})
