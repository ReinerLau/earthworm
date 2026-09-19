# Prototype results

Test dates: 2026-09-18 and 2026-09-19

This is a technical spike, not a production benchmark. Initial automated peers
ran in separate desktop browser tabs. A real iPhone running Chrome on the same
Wi-Fi was then used for the device transfer check.

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
| Real iPhone without VPN         | Failed: the temporary `workers.dev` signaling connection remained pending               |
| Real iPhone with VPN            | Connected; ICE selected UDP `srflx` to `prflx`; no TURN                                 |
| Real iPhone 73,216-byte course  | SHA-256 matched; sender acknowledgement took 1,445 ms                                   |
| Real iPhone 1,048,735-byte JSON | SHA-256 matched; sender acknowledgement took 7,171 ms                                   |

The selected ICE pair was UDP `srflx` in the desktop checks. No TURN server was
configured or used. This proves the intended Cloudflare-signaling/WebRTC data path
works in the tested environment, but it does not prove that every router or mobile
browser can establish a direct path.

## Remaining acceptance checks

On the real iPhone:

1. Add the page to the Home Screen, force-close it, disable networking, reopen it,
   and use **读取本机已保存数据**.
2. Repeat connection and both transfers five times if an alternative signaling
   endpoint that works without VPN is selected.

## Verdict

The WebRTC course-transfer architecture is technically viable on a real iPhone:
QR pairing, direct DataChannel transfer, integrity verification, and IndexedDB
writes all worked within the target timings.

The default Cloudflare `workers.dev` signaling choice is a **no-go for the stated
zero-configuration product goal in the tested network**. The iPhone could not
reach the signaling endpoint until a VPN was enabled. Do not begin the production
refactor with this endpoint as a hard dependency. First test a signaling origin
that is reachable without VPN, or return to a LAN-local discovery/signaling design.
