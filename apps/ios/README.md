# Porchcast for iOS

Universal SwiftUI scaffold for iPhone and iPad. It uses Swift 6 language mode,
strict concurrency, a minimum deployment target of iOS 18, and native adaptive
layouts for rotation, Split View, and Stage Manager.

Validated with Xcode 26.6 and Apple Swift 6.3.3.

## Open in Xcode

Open `Porchcast.xcodeproj` with the latest stable App Store-compatible Xcode.
Install an iOS Simulator runtime from **Xcode → Settings → Components**; the
Xcode app and SDK alone are not enough to compile asset catalogs or run tests.

Shared schemes:

- `Porchcast`: Cloud is the default. Its adapters intentionally report
  unavailable until the private OpenAPI, auth, and media implementations land.
- `Porchcast Demo`: explicitly sets `PORCHCAST_RUNTIME=demo` and runs the
  deterministic local UI without network, camera, microphone, timers, or
  randomness.

The runtime fails closed to Cloud for any unknown environment value.

## Command-line checks

```bash
npm run ios:sourcecheck
npm run ios:build
npm run ios:test:build
```

`ios:sourcecheck` compiles the app and Swift Testing bundle while skipping the
asset catalog, so it remains useful before a Simulator runtime is installed.
The other two commands are complete Xcode builds and require the iOS platform
component. Run tests in Xcode with **Product → Test** after selecting an iPhone
or iPad Simulator.

## Architecture boundary

SwiftUI talks to a deep application module through service interfaces for
authentication, Porches, media sessions, recording, entitlements,
notifications, and a future watch bridge. Cloud and deterministic-demo
adapters meet at that seam. Views contain no HTTP, WHIP/WHEP, credential,
recorder, APNs, or watch transport details.

The app target already reserves camera/microphone descriptions, background
audio, Universal Links for `labs.wiplash.ai`, APNs entitlements, a privacy
manifest, and a future watch interface. Production signing and associated-domain
configuration still require the Apple Developer team and server-side AASA file.

## Current production work

- Generate the Swift API client/models from the private OpenAPI snapshot.
- Implement OAuth/OIDC PKCE with system authentication and Keychain storage.
- Implement native WebRTC WHIP/WHEP media, admissions, chat/files, PiP, and
  background audio.
- Implement Cloud recording history, playback, download, and sharing.
- Implement APNs registration/routing, safe offline metadata, moderation, and
  accessibility/privacy release verification.
