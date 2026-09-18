# WebRTC course transfer prototype

Throwaway prototype for [issue #784](https://github.com/cuixueshe/earthworm/issues/784).

It answers one question: can an iPhone Home Screen PWA use temporary Cloudflare
signaling to establish a direct WebRTC DataChannel with a desktop browser, receive
Earthworm course JSON, persist it in IndexedDB, and reopen it offline?

The prototype is intentionally separate from the production Nuxt and NestJS apps.
It has no production error handling, authentication, course synchronization, or
TURN fallback.

The committed default signaling URL is a short-lived Cloudflare guest deployment
used only for this spike. The field stays editable so a fresh Worker deployment
can replace it without rebuilding the page.

## Layout

- `site/`: static sender/receiver PWA for GitHub Pages.
- `worker/`: Cloudflare Worker and Durable Object used only for signaling.

## Manual verification

1. Deploy the Worker with `pnpm dlx wrangler deploy --config prototypes/webrtc-transfer/worker/wrangler.jsonc`.
2. Put the returned Worker URL into the signaling field in the page, or replace
   `DEFAULT_SIGNAL_URL` in `site/index.html`.
3. Deploy `site/` to GitHub Pages using the prototype workflow.
4. Open the PWA on desktop, choose **Desktop sender**, and create a room.
5. Install the same page to the iPhone Home Screen, choose **iPhone receiver**, and enter the room code.
6. Transfer the real largest course and the synthetic 1 MB course five times each.
7. Force-close the iPhone PWA, disable networking, reopen it, and load the saved course.

The page surfaces connection state, selected ICE candidates, byte counts, timings,
hash verification, and IndexedDB state so the feasibility verdict can be recorded.
