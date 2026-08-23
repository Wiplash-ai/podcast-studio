# Porchcast browser extension roadmap

Status: planned on 2026-08-22; implementation and store submission require
separate authorization.

## Strategic context

Porchcast is already a secure web studio. The extension should make that studio
easier to return to and operate while someone works in other tabs; it must not
duplicate camera capture, recording, rendering, account, or billing logic.

The first release has one narrow purpose:

> Keep the current Porch and recent Porches within reach while someone works in
> other tabs.

This is deliberately more useful than a website launcher. Chrome rejects
extensions whose only purpose is opening a webpage, and both Chrome and Opera
expect one clear purpose with minimum permissions. The extension therefore
provides a browser-native draggable widget, safe Porch history and status,
focus/rejoin actions, and direct access to the Porch's invite and download
surfaces while the web app remains authoritative.

### Product terminology boundary

- **Porch** and **Porches** are the customer-facing names for a reusable
  conversation/recording space.
- Use “Book a Porch,” “Your Porches,” “Return to this Porch,” “Porch details,”
  and “Invite people to this Porch” in browser UI and marketing copy.
- Keep `room`, room IDs, database tables, API contracts, storage keys, and old
  links as stable internal compatibility terms. A copy change does not justify
  an identity or data migration.

## Product outcomes

| Outcome | First-release measure |
| --- | --- |
| Faster return to a Porch | At least 60% of activated users focus or rejoin a Porch from the extension within 7 days |
| Repeat utility | At least 30% of repeat hosts use the extension in a second room session within 30 days |
| Reliable control | At least 99.5% successful focus/open/status commands, excluding offline browsers |
| Safe media behavior | Zero duplicate camera, screen, WHIP, or recorder sessions caused by extension commands |
| Completion awareness | At least 95% of opted-in users with a connected Porchcast tab receive one alert per newly ready recording |
| Permission trust | No broad browsing-history permission and no unexplained install warning |

Store installs, ratings, and subscription conversion are secondary metrics.
They do not justify broad permissions or a second media pipeline.

## Accepted architecture

- Keep the extension source in this public repository under `apps/extension`
  so reviewers can reproduce the same source that produces each package.
- Use one TypeScript implementation and generated Manifest V3 variants:
  Chromium for Chrome, Edge, and Opera; Gecko for Firefox.
- Do not register a toolbar popup. Clicking the toolbar action toggles a
  packaged widget inside the active tab.
- Render the widget in an isolated Shadow DOM. It is draggable, collapsible,
  keyboard movable, viewport constrained, and remembers only non-sensitive
  position and presentation preferences.
- On arbitrary sites, inject the widget only after the user's toolbar click or
  keyboard command through `activeTab`. Do not inject on every page load.
- Add a typed, versioned companion bridge to the Porchcast page. It exposes only
  safe display state such as Porch title, role, recording state, render state,
  and whether invite/download panels are available. It never exposes room,
  invitation, media, or account credentials.
- Use an exact Porchcast content-script match to record recent Porch metadata
  after a participant actually enters. Store at most 10 recent records containing
  only the stable Porch ID, title, role, and last-visited time. Never store the
  invitation URL, invite token, room token, media grant, artifact URL, chat
  content, or participant media.
- Send a server-authoritative `recording_ready` transition through that bridge
  only when all requested programs reach their final ready state. Include an
  opaque, non-authorizing notice key so the extension can suppress duplicate
  alerts without storing recording or download credentials.
- Reopening a recent Porch constructs the public app path from its non-secret ID.
  The web app uses its own same-origin session state to rejoin; otherwise it asks
  for admission or a fresh invitation instead of allowing the extension to
  impersonate access.
- The page remains responsible for copying invite links, starting or stopping
  recording, downloading artifacts, and showing confirmations.
- Keep camera, microphone, screen sharing, WHIP/WHEP, chat, recording, and
  rendering inside the existing web app. The extension never captures or
  republishes media in the first release.
- Keep Stripe Checkout, Portal, and all payment details on
  `https://labs.wiplash.ai/porchcast/`. The extension may open pricing or account
  management after a user action, but contains no Stripe SDK, keys, card form,
  or entitlement override.

### Initial permission budget

- `activeTab`: temporary access to show or hide the widget on the current tab
  after a user gesture.
- `scripting`: inject the packaged widget into that active tab.
- `storage`: non-sensitive widget preferences, the bounded recent-Porch index,
  and a bounded set of opaque completion-notice keys used only for deduplication.
- An exact `https://labs.wiplash.ai/porchcast/*` content-script match: observe a
  successful Porch entry through the typed bridge, not by scraping page text.
- Optional `notifications`: requested only when the user enables “Recording
  ready alerts.” The toolbar badge and widget-ready state work without it.

Do not require `tabs`, `cookies`, `notifications`, `tabCapture`,
`desktopCapture`, `<all_urls>`, or access to unrelated Labs applications in
version 1. Any later permission needs its own user outcome, threat review, and
listing disclosure. Chrome recommends optional permissions for features that
can work without them, while Chrome and Firefox both require the
`notifications` permission for system notifications. Official references:
[Chrome optional permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions),
[Chrome notifications](https://developer.chrome.com/docs/extensions/reference/api/notifications),
and [Firefox notifications](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Notifications).

## First-release experience

The toolbar button toggles a draggable widget. On a Porchcast Porch, it shows:

- Porch name and Host/Guest role;
- Live, Recording, Rendering, Ready, or Needs attention status;
- an opt-in recording-ready alert setting, with widget and toolbar-badge
  fallback when system notifications are disabled;
- Focus Porch;
- Open invite controls, when the current participant is the host;
- Open Cloud Downloads;
- Open account;
- Leave the Porch, using the web app's existing confirmation.

On another website, it shows:

- the 10 most recent Porches, with role and last-visited time;
- Return to Porch;
- Book a Porch;
- Open the full Porchcast app;
- Open pricing;
- a short explanation that camera, microphone, and recording continue in the
  secure Porchcast tab.

The user can drag, collapse, close, and reopen the widget. Closing it removes the
widget from that page without leaving or stopping a Porch. A clear-history
action removes the local recent-Porch index. The extension does not claim that a
Porch is recording based on stale local history; unknown or disconnected state
is displayed honestly.

## Delivery roadmap

### Now: 0-6 weeks

1. **Companion contract and threat model**

   - Define versioned request/response schemas shared by the app and extension.
   - Allow only a small command enum and safe state fields.
   - Reject non-Porchcast origins, malformed messages, stale room revisions,
     and commands from an unrecognized extension build.
   - Add tests proving no token, invite URL, participant media, chat attachment,
     or artifact URL crosses the bridge or recent-Porch index.

2. **One source, four packages**

   - Scaffold `apps/extension` with a base manifest and deterministic browser
     overlays.
   - Chromium build: MV3 service worker.
   - Firefox build: MV3 non-persistent background script plus a stable
     `browser_specific_settings.gecko.id` and current data-collection
     declaration.
   - Package reproducible ZIP files and an AMO source archive from one version.

3. **Movable companion widget MVP**

   - Implement the states and actions above with keyboard-accessible controls.
   - Reuse Porchcast typography, purple accents, icons, and status language at
     compact widget scale.
   - Constrain drag coordinates after viewport or zoom changes and support a
     keyboard move mode so dragging is not mouse-only.
   - Record, deduplicate, cap, reopen, and clear the non-secret recent-Porch
     history.
   - Keep the extension functional while the web app is offline by showing an
     explicit offline state and a retry action.
   - On the first final `recording_ready` transition, mark the widget Ready,
     place a check badge on the toolbar action, and create one optional system
     notification. Clicking it focuses the Porchcast tab or opens the Porch by
     its non-secret ID; it never opens or stores an artifact URL.

4. **Automated compatibility and security checks**

   - Unit-test manifest generation and the bridge allowlist.
   - Run loaded-extension interaction tests in Chromium and Firefox.
   - Assert the final package has no remote executable code, source maps with
     secrets, unused files, or undeclared network behavior.
   - Assert no media device is requested by an extension page or worker.
   - Add package diff checks so Chromium variants differ only where expected.

5. **Manual candidate review**

   - Chrome on Windows/macOS/Linux.
   - Edge on Windows.
   - Firefox on Windows/macOS/Linux.
   - Opera and Opera GX on Windows.
   - Verify install warnings, widget drag/keyboard movement, sign-in handoff,
     Porch recovery, recording status, downloads, offline recovery, history
     clearing, one-alert-per-recording deduplication, denied-notification
     fallback, and uninstall cleanup.

6. **Listing package, held for approval**

   - Porchcast icon family, screenshots, short/long descriptions, support URL,
     privacy URL, reviewer notes, and reproducible-build instructions.
   - Clearly disclose that the free app works without payment and that larger
     guest/storage allowances are optional Porchcast subscriptions sold by
     Wiplash.ai through Stripe on the website.
   - Do not submit any store package until the name/listing review and explicit
     publication authorization are complete.

### Next: 6-12 weeks

1. **Account-aware Porch history**

   - Merge account-owned Porches, recent recordings, and render-ready status
     with the local recent-Porch index only after an
     explicit Wiplash sign-in handoff.
   - Use a revocable, least-privilege extension session. Keep credentials in
     memory, never in a URL, log, analytics event, or persistent extension
     storage. Re-authenticate after browser restart if necessary.
   - Keep room/media grants out of extension state entirely.

2. **Closed-tab ready alerts and message indicators**

   - Add account-scoped Web Push so recording-ready alerts can arrive after all
     Porchcast tabs close. Registration must be explicit, revocable, and tied
     to the least-privilege extension session; notification payloads contain no
     room, media, invitation, or artifact capabilities.
   - Evaluate unread room chat separately. Do not add continuous background
     polling; use server-authoritative transitions and bounded retry.

3. **Platform enhancements**

   - Evaluate a Chrome/Edge side panel only if widget usage shows demand for a
     browser-owned persistent surface.
   - Provide equivalent Firefox and Opera UX rather than shipping a materially
     weaker port.

4. **Release automation**

   - Generate versioned packages, checksums, permission manifests, source
     archives, and reviewer notes in CI.
   - Keep uploads and submissions manual until every store has accepted at least
     one reproducible package and rollback procedures are proven.

### Later: 12+ weeks

- Evaluate an explicit “share this tab to my active room” flow. It may replace
  the web app's screen picker for that source, but may never create a second
  screen publisher or bypass browser consent.
- Evaluate native side-panel controls, richer notification actions, and Firefox
  for Android based on measured demand.
- Consider store submission automation only after policies, credentials,
  phased rollout, rollback, and dashboard verification are documented.
- Revisit Safari only as a separate product decision; it is not part of this
  four-browser plan.

## Prioritization

| Initiative | Reach | Impact | Confidence | Effort | Order |
| --- | ---: | ---: | ---: | ---: | ---: |
| Safe page bridge and draggable widget | High | High | High | Medium | 1 |
| Deterministic four-browser packaging | High | High | High | Medium | 2 |
| Recent Porch history and return actions | High | High | High | Medium | 3 |
| Invite, downloads, and leave actions | High | High | High | Medium | 4 |
| Connected-tab recording-ready alerts | High | High | High | Low | 5 |
| Account-aware Porches and closed-tab push | Medium | High | Medium | High | 6 |
| Browser-native tab sharing | Medium | High | Low | Very high | 7 |

## Store-specific plan

### Chrome Web Store

- Submit Manifest V3 only.
- Keep all executable logic in the package; remote APIs may return data, not
  executable behavior.
- Demonstrate real companion functionality because a launcher-only extension is
  not eligible.
- Link to the main web app only through clearly labeled user actions; the
  draggable history/status widget is the extension's own core functionality.
- Use the narrow single purpose and minimum permission set above.
- Identify Wiplash.ai as the seller and disclose optional paid functionality,
  terms, refund handling, and privacy practices.

Official references: [Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies),
[Manifest V3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements),
and [user-data guidance](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

### Microsoft Edge Add-ons

- Start from the tested Chromium package and verify every API against Edge.
- Generate an Edge package without an `update_url` and complete Partner Center
  privacy, availability, listing, and reviewer fields.
- Test subscription links and OIDC handoff in Edge rather than assuming Chrome
  behavior is identical.

Official references: [Port a Chrome extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/developer-guide/port-chrome-extension)
and [publish an Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).

### Firefox Add-ons

- Use MV3 with Firefox's non-persistent background script path; do not assume a
  Chromium service worker runs in Firefox.
- Include a stable Gecko add-on ID and the current
  `data_collection_permissions` declaration.
- Submit a reproducible source archive when the package is bundled/minified.
- Mark the listing as using optional paid services and provide the privacy
  policy because account/room data crosses the network.
- Obtain AMO signing even if an early candidate is distributed privately.

Official references: [MV3 migration](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/),
[background compatibility](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background),
[submission](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/),
and [add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/).

### Opera Add-ons

- Use the Chromium package only after loading it unpacked in current Opera and
  Opera GX.
- Keep one goal, all executable JavaScript packaged, no unused files or
  permissions, and no private-data transmission without clear authorization.
- Prepare a separate Opera listing and manual reviewer notes; do not treat a
  Chrome listing as proof of Opera acceptance.

Official references: [Opera extension overview](https://help.opera.com/en/extensions/),
[acceptance criteria](https://help.opera.com/en/extensions/acceptance-criteria/),
and [publishing guidelines](https://help.opera.com/en/extensions/publishing-guidelines/).

## Dependencies and capacity

- One frontend/extension implementation lane for 4-6 weeks.
- API support only for the later account-aware session; version 1 should not
  require a new private endpoint.
- Design time for icons, widget states, screenshots, and store assets.
- Access to all four developer dashboards and current test browsers.
- A fresh Porchcast name, trademark, and listing review before submission due
  to the documented existing Porchcast store-name collision.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Store rejects a website wrapper | Ship native status and room actions; never submit a launcher-only package |
| Extension creates a second media path | Keep all capture in the web app; test that extension contexts never call media APIs |
| Broad permission warning hurts trust | Start with user-gesture `activeTab`; request `notifications` only from the in-widget alert setting |
| Recent history leaks invitations | Persist only Porch ID, title, role, and time; never persist invite URLs or capabilities |
| Injected widget disrupts websites | Inject only on user action outside Porchcast, isolate styles in Shadow DOM, and remove cleanly on close |
| Browser APIs diverge | Generate explicit manifest variants and test Firefox background behavior separately |
| Auth token leaks | Keep credentials server-owned or memory-only; never include them in URLs, logs, analytics, or persistent storage |
| Paid-plan copy is misleading | Keep free functionality useful and disclose seller, subscription limits, terms, and web checkout |
| Porchcast name collides in store search | Complete fresh name/listing review before any submission |

## Not doing in version 1

- No iframe or WebView wrapper around the whole Porchcast website.
- No toolbar popup; the action toggles the user-controlled in-page widget.
- No camera, microphone, screen, WHIP, WHEP, recorder, compositor, or download
  implementation inside the extension.
- No live captions or translation claim.
- No background browsing-history collection, page scraping, ads, or analytics of
  visited sites.
- No card collection or Stripe Checkout embedded in an extension page.
- No store upload, staged release, or publication without explicit approval.
