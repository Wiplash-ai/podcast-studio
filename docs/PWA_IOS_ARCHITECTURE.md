# Porchcast PWA and native architecture

## Purpose

This branch turns the existing browser UI into an installable web app, then
adds a native SwiftUI client without copying private service implementation
into this repository.

The public API contract remains the cross-platform seam. The private service
repository owns its OpenAPI definition. A future generated, language-neutral
snapshot in this repository will derive runtime-validated TypeScript plus Swift
models and clients from the same source.

## Delivery order

1. Refactor the web application around deep runtime modules.
2. Add an installable PWA with app-shell-only offline behavior.
3. Add deterministic local demo adapters and media states.
4. Scaffold a universal SwiftUI project in `apps/ios`.
5. Implement native auth, API, media, chat, and recording flows.
6. Add push, playback, accessibility, privacy, and App Store hardening.

## Web runtime

`PorchcastBackend` is the module interface for booking and opening a Porch.
Its adapters own transport details, credentials, idempotency, response
validation, and service error semantics:

- `HttpPorchcastBackend` is the default Cloud adapter.
- `DemoPorchcastBackend` is explicit and deterministic. It never invokes a
  camera, microphone, recorder, private API, or media endpoint.

The demo adapter exists for local UI development and automated tests. It must
never silently replace the Cloud adapter.

The service worker precaches only the static application shell. API responses,
room events, credentials, WHIP/WHEP traffic, chat attachments, recordings, and
other media are never runtime-cached. An active room also defers app-update
reloads until leaving is safe.

## Native target

- SwiftUI with the latest stable App Store-compatible Xcode and Swift toolchain.
- Swift 6 language mode.
- Minimum deployment target: iOS 18.
- Universal iPhone and iPad application, including rotation, Split View, and
  Stage Manager.
- Shared architecture leaves room for a future watchOS target, but v1 does not
  ship one. Future watch behavior is limited initially to status,
  recording-ready alerts, and opening the Porch on iPhone.

The native client preserves the Porchcast identity while following native
SwiftUI navigation, controls, accessibility, and system picker conventions.
It is not a pixel-for-pixel web wrapper.

The current native scaffold supplies the SwiftUI module, domain model, deep
service interfaces, deterministic demo adapters, and explicit unavailable
Cloud adapters. Local Debug launches deliberately select the offline demo so a
fresh checkout is runnable; Release/App Store builds remain Cloud-first and do
not silently fall back. The live OpenAPI, OIDC/Keychain, WebRTC, APNs, playback,
file, and persistence adapters remain production work.

## Native v1 scope

- OAuth/OIDC authorization code with PKCE through the system browser, Universal
  Link callback, custom-scheme fallback, and Keychain storage.
- Anonymous guests and free ephemeral hosts remain supported. Accounts unlock
  durable, premium, and cross-device state.
- Porch list, create, join, invitations, admissions, host, and guest flows.
- Native WebRTC using WHIP/WHEP, supporting up to one host and twelve guests
  with adaptive quality.
- Participant consent on every session before publishing media.
- Text and emoji chat, received attachments, and image/file sending through
  system pickers.
- Cloud recording, history, native playback, download, and share.
- Remote screen viewing, Picture in Picture, and background audio.
- APNs for admission and recording-ready events.
- Universal Links on `labs.wiplash.ai`.
- Read-only offline cache for safe account and recording metadata.

## Deferred from native v1

- Device screen broadcasting.
- Local recording UI. Keep a recording-provider seam for later.
- Pricing, purchases, and direct Stripe links. Existing entitlements are
  read-only in v1; keep a StoreKit provider seam.
- Marketing pages, VDO.Ninja, Tenor, and in-app camera capture for chat.
- watchOS application target or watch controls.

## Release gates

- Moderation APIs and native moderation UI must exist before native chat ships.
- Accessibility is a release gate, not a follow-up.
- Telemetry is privacy-first and excludes credentials, invite URLs, participant
  media, message content, and recording content.
- The product is 18+ and is not submitted to the Kids Category.
- Cloud recording uses a trusted recorder security model, not end-to-end
  encryption.
