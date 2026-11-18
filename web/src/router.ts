import { createRouter, createWebHistory } from "vue-router";
import FinishedRunsView from "./views/FinishedRunsView.vue";
import RunDetailView from "./views/RunDetailView.vue";
import RunListView from "./views/RunListView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: RunListView },
    { path: "/finished", component: FinishedRunsView },
    { path: "/runs/:repo/:issue", component: RunDetailView },
  ],
});
