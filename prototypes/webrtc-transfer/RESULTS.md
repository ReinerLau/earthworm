# Prototype results

Test date: 2026-09-18

This is a technical spike, not a production benchmark. Both automated peers ran
in separate desktop browser tabs. The iPhone Safari/Home Screen check remains a
manual acceptance step.

## Observed results

| Path                            | Result                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| Local Worker signaling          | Connected in about 1 second                                                             |
| Local 73,216-byte real course   | SHA-256 matched; receiver completed in 502 ms                                           |
| Local 1,048,735-byte JSON       | SHA-256 matched; receiver completed in 5,945 ms                                         |
| Cloudflare Worker signaling     | Connected; DataChannel opened without TURN                                              |
| Cloudflare-signaled real course | SHA-256 matched; sender got acknowledgement in 865 ms                                   |
| Cloudflare-signaled 1 MB JSON   | SHA-256 matched; receiver completed in 8,710 ms                                         |
| GitHub Pages + QR auto-join     | Receiver role, signaling URL, and room were populated automatically; DataChannel opened |
| GitHub Pages real course        | SHA-256 matched; receiver completed in 593 ms; sender acknowledgement took 772 ms       |
| IndexedDB                       | Received payload survived page reload and was readable on the next load                 |

The selected ICE pair was UDP `srflx` in the desktop checks. No TURN server was
configured or used. This proves the intended Cloudflare-signaling/WebRTC data path
works in the tested environment, but it does not prove that every router or mobile
browser can establish a direct path.

## Remaining acceptance check

On a real iPhone connected to the same Wi-Fi:

1. Open <https://reinerlau.github.io/earthworm/> on the desktop and create a room.
2. Scan the displayed QR code with the iPhone camera. Confirm that the receiver
   joins without typing a room code.
3. Send both payloads and confirm SHA-256 success within 5 seconds for the real
   course and 15 seconds for the 1 MB payload.
4. Add the page to the Home Screen, force-close it, disable networking, reopen it,
   and use **读取本机已保存数据**.
5. Repeat connection and both transfers five times before treating the spike as a
   full go decision.

## Provisional verdict

Proceed to the iPhone check. The core architecture is viable on desktop with the
live GitHub Pages and Cloudflare paths. Do not begin the production refactor until
the real-device and five-run checks pass.
