/**
 * Nuxt's static shell is rendered at `/`, while the PWA uses hash history so
 * GitHub Pages does not need server-side route rewrites.  On a cold load the
 * server-rendered home page can win the initial route race; explicitly replay
 * the hash path once the client router is ready.
 */
import { defineNuxtPlugin, useRouter } from "#app";

export default defineNuxtPlugin(() => {
  const hash = window.location.hash;
  if (!hash.startsWith("#/")) return;

  const path = hash.slice(1) || "/";
  const router = useRouter();
  // Do not block Nuxt app mounting on the initial router promise.  Hash
  // history can resolve that promise only after the first client navigation.
  queueMicrotask(() => {
    if (router.currentRoute.value.fullPath !== path) void router.replace(path);
  });
});
