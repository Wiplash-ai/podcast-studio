# Podcast Studio

Podcast Studio is the public browser application for Wiplash's Cloud-recorded
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
