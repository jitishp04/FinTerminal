import { createLocalStore } from "./localStore";

export const {
  subscribe: subscribeLayout,
  getSnapshot: getLayoutSnapshot,
  getServerSnapshot: getServerLayoutSnapshot,
  save: saveLayout,
} = createLocalStore("finterminal.layout.v1");
