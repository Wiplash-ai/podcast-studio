# Porchcast

Porchcast contains the public web app and native SwiftUI client for Wiplash's
Cloud-recorded remote podcast rooms. Each participant chooses a camera and
microphone once, publishes once, talks with the room, and leaves the heavy
recording work to the private service plane.

## Repository boundary

This repository intentionally contains only public client code, public API
schemas, static assets, and the generic same-origin web gateway. It does not
contain the API implementation, database migrations, recorder worker,
compositor, billing implementation, MediaMTX configuration, deployment
inventory, or operator credentials.

The private service repository is the source of truth for API schemas. The
browser-safe contract snapshot in `packages/contracts` must be updated in the
same release whenever that service contract changes.

## Development

```bash
npm ci
npm run dev
```

The development server listens on `127.0.0.1:5193` and proxies `/v1` and
`/healthz` to the local service on `127.0.0.1:8788`.

The Cloud adapter is always the default. When the private service is not
available, open a deterministic local studio explicitly:

```text
http://127.0.0.1:5193/?demo=ready
http://127.0.0.1:5193/?demo=recording
http://127.0.0.1:5193/?demo=finalizing
http://127.0.0.1:5193/?demo=full-room
http://127.0.0.1:5193/?demo=reconnecting
```

The demo adapter uses no API, camera, microphone, screen-capture, recorder, or
media service. Set `VITE_PORCHCAST_RUNTIME=demo` for an explicit demo-default
build and `VITE_PORCHCAST_DEMO_SCENARIO` to one of the scenarios above. A
`?runtime=cloud` query always restores the Cloud adapter.

## Native iOS

The universal SwiftUI project lives in `apps/ios`. Local Debug launches run the
deterministic, no-I/O native UI by default so a fresh checkout works offline.
Release and App Store launches remain Cloud-first; until the private OpenAPI and
native media adapters are connected, an explicit Cloud launch presents a
truthful unavailable state. The `Porchcast Demo` scheme also forces the offline
runtime explicitly.

See `apps/ios/README.md` for Xcode setup, build commands, current boundaries,
and the missing production adapters.

## Verification

```bash
npm run verify
```

Verification includes browser-safe boundary scans, unit tests, typechecks, a
production build, PWA cache-boundary checks, an actual offline-shell browser
test, deterministic demo isolation checks, and responsive checks from 320px
phones through portrait tablets.

The installed PWA caches only the static application shell. Rooms, API data,
credentials, events, WHIP/WHEP traffic, chat attachments, recordings, and media
remain network-only.

The production container accepts `VITE_BASE_PATH` and `VITE_API_URL` build
arguments and serves the static application plus the same-origin API proxy on
port `8080`.

## Security

Room capabilities and media grants are bearer credentials. Do not add real
room links, access tokens, customer media, private hostnames, or production
configuration to this repository. Report vulnerabilities through GitHub's
private security-advisory workflow.

## License

[MIT](LICENSE). Produced by Wiplash.ai.
