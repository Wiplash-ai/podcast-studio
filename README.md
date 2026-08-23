# Porchcast

Porchcast is the public browser application for Wiplash's Cloud-recorded
remote podcast rooms. Each participant chooses a camera and microphone once,
publishes once, talks with the room, and leaves the heavy recording work to the
private service plane.

## Repository boundary

This repository intentionally contains only browser-delivered code, public API
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

## Verification

```bash
npm run verify
```

Verification includes browser-safe boundary scans, unit tests, typechecks, a
production build, and deterministic responsive checks from 320px phones through
portrait tablets, including device setup, large rooms, and screen sharing.

The production container accepts `VITE_BASE_PATH` and `VITE_API_URL` build
arguments and serves the static application plus the same-origin API proxy on
port `8080`.

## Browser companion

The public Manifest V3 source lives in `apps/extension`. One deterministic
build produces unpacked Chromium and Firefox directories:

```bash
npm run build -w @wiplash/porchcast-extension
```

Load `apps/extension/dist/chromium` as an unpacked extension in Chrome,
BrowserOS, Edge, or Opera. The toolbar action has no popup: it toggles a
draggable companion inside the active tab. The companion stores only its
presentation preferences and up to ten recent Porch records containing a
stable Porch ID, title, role, and visit time in persistent extension storage.
While the browser is open, extension session storage may also hold up to twenty
signed-in saved-Porch summaries and twenty recording summaries supplied by the
authenticated web app. It never stores OAuth/session credentials, invitation
links, room or media capabilities, chat, artifact URLs, or participant media.
Current BrowserOS developer builds also require the
`--enable-unsafe-extension-debugging` launch flag for unpacked extensions; that
flag is not part of a signed store installation.

Firefox uses `apps/extension/dist/firefox`. Store submission, signing, and
publication remain separate release gates.

## Security

Room capabilities and media grants are bearer credentials. Do not add real
room links, access tokens, customer media, private hostnames, or production
configuration to this repository. Report vulnerabilities through GitHub's
private security-advisory workflow.

## License

[MIT](LICENSE). Produced by Wiplash.ai.
