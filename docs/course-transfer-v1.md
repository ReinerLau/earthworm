# Cloudflare WebRTC course transfer v1

The production transfer path uses the existing Nuxt client as the desktop sender and a
GitHub Pages PWA as the iPhone receiver. The Cloudflare Worker only relays the WebRTC
offer, answer, and ICE candidates. Course JSON is sent directly over the ordered,
reliable WebRTC DataChannel.

## Deployment variables

The `Deploy course transfer PWA and signaling` workflow needs:

- Repository secret `CLOUDFLARE_ACCOUNT_ID`.
- Repository secret `CLOUDFLARE_API_TOKEN` with permission to deploy Workers.
- Repository variable `SIGNAL_BASE_URL`, for example
  `https://earthworm-course-transfer.<account>.workers.dev`.
- Optional repository variable `PWA_PUBLIC_URL`; it defaults to
  `https://reinerlau.github.io/earthworm`.

The desktop deployment of the regular client must also expose the same
`SIGNAL_BASE_URL` at build time. End users only scan the QR code; they do not enter a
signal address or room code.

## Runtime limits

- One sender and one receiver per room.
- Room lifetime: 10 minutes.
- One CoursePackage per session.
- Maximum encoded course size: 5 MiB.
- No TURN relay and no cloud progress synchronization.
- The iPhone offline mode intentionally omits remote login, ranking, sharing, daily
  sentence, and pronunciation requests.

If the iPhone cannot reach `workers.dev`, the receiver reports a network/VPN error
within 15 seconds and the sender can create a new room.

The QR code carries only the receiver URL, Signal Worker URL, and room token. The
course package itself is validated as `earthworm-course-pack` and sent through the
ordered, reliable WebRTC DataChannel before it is written to IndexedDB.
