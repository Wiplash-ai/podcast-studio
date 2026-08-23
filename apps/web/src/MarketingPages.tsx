import type { MouseEvent } from "react";

import { podcastPlans, pricingQuestions } from "./plan-catalog";
import { pricingAction } from "./pricing-action";
import { appPagePath, type PublicAppPage } from "./public-path";
import type { AccountModel } from "./use-account";

function MarketingFooter({
  onNavigate,
  publicPath = appPagePath,
}: {
  onNavigate: (page: PublicAppPage) => void;
  publicPath?: (page: PublicAppPage) => string;
}) {
  function publicLink(page: PublicAppPage) {
    return {
      href: publicPath(page),
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        onNavigate(page);
      },
    };
  }

  return (
    <footer className="marketing-footer">
      <div><strong>Porchcast</strong><span>Cloud recording for conversations worth keeping.</span></div>
      <nav aria-label="Legal and product links">
        <a {...publicLink("home")}>Product</a>
        <a {...publicLink("pricing")}>Pricing</a>
        <a {...publicLink("privacy")}>Privacy</a>
        <a href="mailto:support@wiplash.ai?subject=Porchcast%20Support">Support</a>
      </nav>
      <small>© {new Date().getFullYear()} Wiplash.ai</small>
    </footer>
  );
}

export function LandingFooter({
  onNavigate,
  publicPath,
}: {
  onNavigate: (page: PublicAppPage) => void;
  publicPath?: (page: PublicAppPage) => string;
}) {
  return <MarketingFooter onNavigate={onNavigate} publicPath={publicPath} />;
}

export function PricingView({
  account,
  onBook,
  onNavigate,
  publicPath,
}: {
  account: AccountModel;
  onBook: () => void;
  onNavigate: (page: PublicAppPage) => void;
  publicPath?: (page: PublicAppPage) => string;
}) {
  return (
    <main className="marketing-main pricing-page">
      <section className="marketing-hero pricing-hero">
        <p className="eyebrow">Porchcast plans</p>
        <h1>Start free.<br /><span>Grow when your show does.</span></h1>
        <p>Every plan moves the recording work to the Cloud and delivers the same quality. Choose the number of guests and monthly recording hours that fit your show.</p>
        <div className="pricing-availability-note" role="note"><i /> Paid plans are monthly subscriptions. Stripe will securely process payments.</div>
        {account.billing?.mode === "test" ? <div className="pricing-test-note" role="status"><strong>Stripe test mode</strong><span>This account is testing subscriptions. No real payment is collected.</span></div> : null}
      </section>

      <section className="pricing-access-note" aria-label="Access without an account">
        <span>NO ACCOUNT</span>
        <div><strong>Book first. Sign in when you record.</strong><p>You can create and join a room without an account. Sign in with Wiplash when you are ready to record; saved Free rooms keep finalized Cloud media for seven days and remain reusable.</p></div>
        <button onClick={onBook} type="button">Book a room <span aria-hidden="true">→</span></button>
      </section>

      <section className="pricing-grid" aria-label="Porchcast plans">
        {podcastPlans.map((plan) => {
          const action = pricingAction(
            plan.id,
            account.billing,
            Boolean(account.snapshot.account),
            account.snapshot.capabilities.signInAvailable,
          );
          const isCurrentSubscription = account.billing?.subscriptionPlan === plan.id;
          const isInternalStudio = account.billing?.plan === "internal" && plan.id === "studio";
          const actionClass = `plan-action${plan.id === "free" ? "" : " secondary"}`;
          const actionControl = action.kind === "book" ? (
            <button className={actionClass} onClick={onBook} type="button">{action.label}</button>
          ) : action.kind === "sign-in" ? (
            <button className={actionClass} disabled={Boolean(account.busy)} onClick={() => void account.signIn()} type="button">{account.busy === "sign-in" ? "Opening sign-in…" : action.label}</button>
          ) : action.kind === "checkout" ? (
            <button className={actionClass} disabled={Boolean(account.busy)} onClick={() => void account.subscribe(action.plan)} type="button">{account.busy === "checkout" ? "Opening secure checkout…" : action.label}</button>
          ) : action.kind === "plan-change" ? (
            <button className={actionClass} disabled={Boolean(account.busy)} onClick={() => void account.changePlan(action.plan)} type="button">{account.busy === "plan-change" ? "Opening plan details…" : action.label}</button>
          ) : action.kind === "manage" ? (
            <button className={actionClass} disabled={Boolean(account.busy)} onClick={() => void account.manageBilling()} type="button">{account.busy === "portal" ? "Opening billing…" : action.label}</button>
          ) : (
            <span className={`${actionClass} unavailable`}>{action.label}</span>
          );
          return (
          <article key={plan.id}>
            <header>
              <div><h2>{plan.name}</h2>{isCurrentSubscription ? <span className="plan-current-label">Current subscription</span> : isInternalStudio ? <span className="plan-current-label">Admin access</span> : null}</div>
              <div className="plan-price"><strong>{plan.priceLabel}</strong><span>{plan.priceCadence}</span></div>
            </header>
            <p>{plan.summary}</p>
            <dl><div><dt>Guests</dt><dd>{plan.guests}</dd></div><div><dt>Cloud recording</dt><dd>{plan.recordingStorage}</dd></div><div><dt>Quality</dt><dd>{plan.quality}</dd></div></dl>
            <ul>{plan.features.map((feature) => <li key={feature}><i />{feature}</li>)}</ul>
            {actionControl}
          </article>
        );})}
      </section>

      <section className="pricing-principles">
        <header><p className="eyebrow">What changes when you upgrade</p><h2>More room. More recording hours. The quality stays the same.</h2></header>
        <div>
          <article><span>01</span><h3>One recording standard</h3><p>Free and paid recordings use the same capture, isolated-source, and output-quality standards.</p></article>
          <article><span>02</span><h3>Bring a bigger panel</h3><p>Move from two guests on Free to four, eight, or twelve guests as your conversations grow.</p></article>
          <article><span>03</span><h3>Keep more work in the Cloud</h3><p>Choose 3, 10, 30, or unlimited Cloud recording hours without moving the workload back to your computer.</p></article>
        </div>
      </section>

      <section className="pricing-faq">
        <header><p className="eyebrow">Subscription details</p><h2>Straight answers before you subscribe.</h2></header>
        <div>
          {pricingQuestions.map((item, index) => <details key={item.question} open={index === 0}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
        </div>
      </section>
      <MarketingFooter onNavigate={onNavigate} publicPath={publicPath} />
    </main>
  );
}

const policySections = [
  {
    title: "Who we are and what this covers",
    body: <><p>This policy covers Porchcast at Wiplash Labs, including booked rooms, participant media, Cloud recordings, chat, downloads, and Porchcast account features. Porchcast is operated by Westward Envoy Technologies LLC, doing business as Wiplash.ai (“Wiplash,” “we,” “us,” or “our”).</p><p>The broader <a href="https://wiplash.ai/legal/privacy">Wiplash.ai Privacy Policy</a> also applies. If the policies conflict about Porchcast data, this product-specific policy controls.</p></>,
  },
  {
    title: "Information we collect",
    body: <><p>We collect room and display names, room settings, invitations, admission decisions, chat messages, images, GIFs, audio, or video you share in chat, recording status, source and recording-view metadata, and support messages you send us. When you sign in, we receive your Wiplash account identifier, display name, and email address.</p><p>After each participant gives device consent, the service relays selected camera, microphone, and screen-share media. Cloud media is recorded only when the host starts recording. Our infrastructure may also process IP address, browser and device details, timestamps, connection status, errors, and security logs.</p></>,
  },
  {
    title: "How we collect information",
    body: <p>We receive information when you book or save a room, join from an invitation, choose devices, chat, share a screen, start or stop a recording, download a file, sign in, or contact support. Browsers and hosting infrastructure provide technical connection and security data automatically.</p>,
  },
  {
    title: "How we use information",
    body: <p>We use information to create and secure rooms, connect participants, enforce consent and admission rules, relay media, produce requested recordings, recover damaged sessions, provide downloads, retain account history, prevent abuse, troubleshoot failures, support users, and comply with law. We do not use room media or chat to train public AI models.</p>,
  },
  {
    title: "Legal bases",
    body: <p>Where the GDPR or similar law applies, processing may be necessary to provide the service you request, based on your consent for device access and recording participation, necessary for our legitimate interests in security and service reliability, or required by law. You may withdraw device consent by stopping a share, muting, turning off the camera, or leaving the room. Withdrawal does not erase media already recorded with consent.</p>,
  },
  {
    title: "When information is shared",
    body: <><p>Room participants receive the live media, display names, chat, shared chat files, and presence information needed for the conversation. Hosts can control recording and download the room’s finalized media. We use service providers for cloud hosting, storage, database operations, email or support, and Wiplash identity. Google and GitHub may act as upstream sign-in providers when you choose them through Wiplash.ai. If you open GIF search, Tenor receives the search request and serves preview images under its own privacy terms; selected GIFs are copied into the room’s authenticated storage.</p><p>We may disclose information when required by law, to protect people or the service, or as part of a corporate transaction with appropriate safeguards. We do not sell personal information or share it for cross-context behavioral advertising.</p></>,
  },
  {
    title: "Payments",
    body: <p>Paid Porchcast memberships are not available as of this policy’s effective date. We expect to use Stripe to process future payments. Before paid memberships become available, we will update this policy and the checkout notice to explain the payment identifiers, subscription details, tax information, retention, and other data Stripe processes. We do not expect to receive your complete payment-card number.</p>,
  },
  {
    title: "International transfers",
    body: <p>Wiplash and its providers may process information in the United States and other countries. Privacy protections may differ from those where you live. Where required, we use contractual and other safeguards recognized by applicable law.</p>,
  },
  {
    title: "How long we keep information",
    body: <><p>Finalized Cloud media for a room without an account is scheduled for deletion 24 hours after recording stops. Free-account media is scheduled for deletion seven days after recording stops. Deleting a saved room shortens any remaining free retention to no more than 24 hours. The application displays the applicable media deadline.</p><p>Room, account, admission, chat, security, and deletion-receipt metadata may remain longer when needed to operate reusable rooms, secure the service, resolve disputes, meet legal duties, or document deletion. Legal holds pause ordinary media deletion. We keep this metadata only as long as those purposes require.</p></>,
  },
  {
    title: "Your choices and rights",
    body: <p>You can decline device access, mute, turn off your camera, stop sharing, leave a room, avoid signing in, delete a saved room, and sign out. Depending on where you live, you may request access, correction, deletion, restriction, objection, or a portable copy, withdraw consent, use an authorized agent, or complain to a regulator. We may verify a request before acting.</p>,
  },
  {
    title: "Cookies and browser storage",
    body: <p>Signed-in accounts use secure HTTP-only cookies for Wiplash sign-in, session, and logout state. The application uses browser session or local storage for scoped room and participant capabilities, invitation recovery, local viewing preferences, and room continuity. Media capabilities are kept in memory and are not placed in URLs or persistent browser storage. Porchcast does not currently load advertising trackers.</p>,
  },
  {
    title: "Security",
    body: <p>We use encrypted transport, scoped and hashed capabilities, server-derived media identities, consent checks, account authorization, restricted downloads, retention receipts, and isolated media infrastructure. No online service is perfectly secure. Keep invitation links private, use host admission when appropriate, and report suspected security issues to <a href="mailto:support@wiplash.ai?subject=Porchcast%20Security">support@wiplash.ai</a>.</p>,
  },
  {
    title: "Children’s privacy",
    body: <p>Porchcast is not directed to children under 13 and is not designed for school or parental-consent workflows. Do not use the service to record a child unless you have the authority and consent required by applicable law. Contact us if you believe a child provided personal information without proper authorization.</p>,
  },
  {
    title: "Contact and rights requests",
    body: <p>Email privacy requests to <a href="mailto:support@wiplash.ai?subject=Porchcast%20Privacy%20Request">support@wiplash.ai</a> and legal notices to <a href="mailto:legal@wiplash.ai?subject=Porchcast">legal@wiplash.ai</a>. Include “Porchcast” in the subject and do not send passwords, room capabilities, or private recordings unless we ask for a secure transfer. We will respond within the period required by applicable law.</p>,
  },
  {
    title: "Changes and additional terms",
    body: <p>We will update the effective date when this policy changes. Material changes may also be announced in the application or by account email when appropriate. Third-party sites and identity providers have their own terms and policies. This policy is a transparency notice and does not limit rights you have under applicable law.</p>,
  },
];

export function PrivacyView({
  onNavigate,
  publicPath,
}: {
  onNavigate: (page: PublicAppPage) => void;
  publicPath?: (page: PublicAppPage) => string;
}) {
  return (
    <main className="marketing-main privacy-page">
      <section className="marketing-hero privacy-hero">
        <p className="eyebrow">Porchcast privacy</p>
        <h1>Your conversation is the product.<br /><span>Not the raw material.</span></h1>
        <p>This notice explains what Porchcast receives, why the Cloud needs it, who can access a recording, and when media is scheduled for deletion.</p>
        <dl className="privacy-summary">
          <div><dt>Effective</dt><dd>August 17, 2026</dd></div>
          <div><dt>Operator</dt><dd>Westward Envoy Technologies LLC d/b/a Wiplash.ai</dd></div>
          <div><dt>Privacy contact</dt><dd><a href="mailto:support@wiplash.ai">support@wiplash.ai</a></dd></div>
        </dl>
      </section>

      <section className="privacy-callout">
        <strong>The short version</strong>
        <p>Participants choose their devices and consent before publishing. The host decides when Cloud recording starts. Hosts can download validated recordings. Anonymous media is scheduled for 24-hour retention; Free-account media for seven days. We do not sell personal information or train public AI models on room media.</p>
      </section>

      <article className="policy-body">
        <nav aria-label="Privacy policy sections">
          <span>IN THIS POLICY</span>
          {policySections.map((section, index) => <a href={`#privacy-${index + 1}`} key={section.title}>{String(index + 1).padStart(2, "0")} {section.title}</a>)}
        </nav>
        <div className="policy-sections">
          {policySections.map((section, index) => (
            <section id={`privacy-${index + 1}`} key={section.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><h2>{section.title}</h2>{section.body}</div>
            </section>
          ))}
        </div>
      </article>
      <MarketingFooter onNavigate={onNavigate} publicPath={publicPath} />
    </main>
  );
}
