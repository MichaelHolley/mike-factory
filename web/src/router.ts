import { createRouter, createWebHistory } from "vue-router";
import FinishedRunsView from "./views/FinishedRunsView.vue";
import MetricsView from "./views/MetricsView.vue";
import RunDetailView from "./views/RunDetailView.vue";
import RunListView from "./views/RunListView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: RunListView },
    { path: "/finished", component: FinishedRunsView },
    { path: "/metrics", component: MetricsView },
    { path: "/runs/:repo/:issue", component: RunDetailView },
  ],
});
