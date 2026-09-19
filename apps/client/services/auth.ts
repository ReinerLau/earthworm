import { useLogto } from "@logto/vue";
import { useRuntimeConfig } from "nuxt/app";

let logto: ReturnType<typeof useLogto> | undefined;
let runtimeConfig: ReturnType<typeof useRuntimeConfig>;
export async function setupAuth() {
  runtimeConfig = useRuntimeConfig();
  logto = useLogto();
}

export async function signIn(callback?: string) {
  if (!logto) return;
  callback && setSignInCallback(callback);
  logto.signIn(runtimeConfig.public.signInRedirectURI);
}

export function signOut() {
  return logto?.signOut(runtimeConfig.public.signOutRedirectURI);
}

export function isAuthenticated() {
  return logto?.isAuthenticated.value ?? false;
}

export async function getToken() {
  if (!logto) return undefined;
  const accessToken = await logto.getAccessToken(runtimeConfig.public.backendEndpoint);

  return accessToken;
}

export function getSignInCallback() {
  let callback = sessionStorage.getItem("callback");
  if (callback) {
    sessionStorage.removeItem("callback");
    return callback;
  } else {
    return "/";
  }
}

function setSignInCallback(callback: string) {
  sessionStorage.setItem("callback", callback);
}
