import { createRouter, createWebHistory } from "vue-router";
import RunDetailView from "./views/RunDetailView.vue";
import RunListView from "./views/RunListView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: RunListView },
    { path: "/runs/:repo/:issue", component: RunDetailView },
  ],
});
