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
      meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
      link: [{ rel: "icon", type: "image/x-icon", href: `${appBaseURL}logo.png` }],
      script: appScripts,
    },
  },
  css: ["~/assets/css/globals.css"],
  modules: ["@nuxtjs/tailwindcss", "@vueuse/nuxt", "@nuxt/image", "@nuxt/test-utils/module"],
  runtimeConfig: {
    public: {
      endpoint: process.env.LOGTO_ENDPOINT || "",
      appId: process.env.LOGTO_APP_ID || "",
      backendEndpoint: process.env.BACKEND_ENDPOINT || "",
      signInRedirectURI: process.env.LOGTO_SIGN_IN_REDIRECT_URI || "",
      signOutRedirectURI: process.env.LOGTO_SIGN_OUT_REDIRECT_URI || "",
      signalBaseUrl: process.env.SIGNAL_BASE_URL || "",
      appBaseURL,
      buildVersion: process.env.APP_VERSION || process.env.GITHUB_SHA || "dev",
    },
  },
});
