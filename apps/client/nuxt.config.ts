// https://nuxt.com/docs/api/configuration/nuxt-config

const appScripts: any = [];
const appBaseURL = process.env.NUXT_APP_BASE_URL || "/";
if (process.env.NODE_ENV === "production") {
  addClarity();
}

// for https://clarity.microsoft.com/
function addClarity() {
  appScripts.push({
    innerHTML: `(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "${process.env.CLARITY}");`,
  });
}

export default defineNuxtConfig({
  ssr: false,
  // default is true, reference to https://nuxt.com/docs/guide/directory-structure/components
  // components: true,
  imports: {
    autoImport: false,
  },
  devtools: {
    enabled: true,
  },
  app: {
    baseURL: appBaseURL,
    head: {
      title: "Earthworm",
      link: [{ rel: "icon", type: "image/x-icon", href: `${appBaseURL}logo.png` }],
      script: appScripts,
    },
  },
  css: ["~/assets/css/globals.css"],
  modules: [
    "@nuxtjs/tailwindcss",
    "@vueuse/nuxt",
    "@nuxt/image",
    "@nuxt/test-utils/module",
    "@vite-pwa/nuxt",
  ],
  plugins: ["~/plugins/offline-hash.client.ts"],
  runtimeConfig: {
    public: {
      endpoint: process.env.LOGTO_ENDPOINT || "",
      appId: process.env.LOGTO_APP_ID || "",
      backendEndpoint: process.env.BACKEND_ENDPOINT || "",
      signInRedirectURI: process.env.LOGTO_SIGN_IN_REDIRECT_URI || "",
      signOutRedirectURI: process.env.LOGTO_SIGN_OUT_REDIRECT_URI || "",
      signalBaseUrl: process.env.SIGNAL_BASE_URL || "",
      pwaUrl: process.env.PWA_PUBLIC_URL || "",
      offlineMode: process.env.OFFLINE_PWA === "true",
      buildVersion: process.env.APP_VERSION || process.env.GITHUB_SHA || "dev",
    },
  },
  pwa: {
    registerType: "autoUpdate",
    manifest: {
      name: "Earthworm 本地课程",
      short_name: "Earthworm",
      description: "在 iPhone 上离线练习 Earthworm 课程",
      start_url: `${appBaseURL}#/course-pack`,
      scope: appBaseURL,
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#d946ef",
      icons: [{ src: `${appBaseURL}logo.png`, sizes: "192x192", type: "image/png" }],
    },
    workbox: {
      globPatterns: ["**/*.{js,css,html,png,svg,mp3,ttf,woff2,ico,json}"],
      maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      navigateFallback: appBaseURL,
    },
    devOptions: { enabled: false },
  },
});
