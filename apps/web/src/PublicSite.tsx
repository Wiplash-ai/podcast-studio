import { useLayoutEffect, useRef, useState } from "react";

import { LandingFooter, PricingView, PrivacyView } from "./MarketingPages";
import { PwaInstallButton } from "./PwaInstallButton";
import { appPath, type PublicAppPage } from "./public-path";
import { StudioIcon } from "./StudioIcon";
import type { AccountModel } from "./use-account";

import "./PublicSite.css";
import "./marketing-pages.css";

export interface PublicSiteProps {
  account: AccountModel;
  onBook: () => void;
  onNavigate: (page: PublicAppPage) => void;
  page: PublicAppPage;
  publicPath: (page: PublicAppPage, state?: string) => string;
}

export function PublicSite({
  account,
  onBook,
  onNavigate,
  page,
  publicPath,
}: PublicSiteProps) {
  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".landing-main, .marketing-main")
        ?.scrollTo({ left: 0, top: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [page]);

  if (page === "pricing") {
    return <PricingView account={account} onBook={onBook} onNavigate={onNavigate} publicPath={publicPath} />;
  }
  if (page === "privacy") {
    return <PrivacyView onNavigate={onNavigate} publicPath={publicPath} />;
  }
  return <LandingView onBook={onBook} onNavigate={onNavigate} publicPath={publicPath} />;
}

function LandingView({
  onBook,
  onNavigate,
  publicPath,
}: {
  onBook: () => void;
  onNavigate: (page: PublicAppPage) => void;
  publicPath: (page: PublicAppPage) => string;
}) {
  const mainRef = useRef<HTMLElement>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  function backToTop() {
    const main = mainRef.current;
    if (!main) return;
    const previousBehavior = main.style.scrollBehavior;
    main.style.scrollBehavior = "auto";
    main.scrollTop = 0;
    main.style.scrollBehavior = previousBehavior;
    setShowBackToTop(false);
  }

  return (
    <main
      className="landing-main"
      onScroll={(event) => {
        const nextVisible = event.currentTarget.scrollTop > 520;
        setShowBackToTop((current) => current === nextVisible ? current : nextVisible);
      }}
      ref={mainRef}
    >
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="eyebrow">A Cloud recording room for remote podcasts</p>
          <h1>
            <span className="landing-title-primary">Record a real podcast.</span>
            <span>Skip the production rig.</span>
          </h1>
          <p className="landing-lede">
            Invite your guest, talk face to face, and control the recording yourself. Porchcast moves the heavy media work to the Cloud.
          </p>
          <div className="landing-actions">
            <button className="hero-primary" onClick={onBook} type="button">Book a room <span aria-hidden="true">→</span></button>
            <PwaInstallButton />
            <a href="#why-cloud">Why the Cloud?</a>
          </div>
          <div className="landing-assurances" aria-label="Product highlights">
            <span><i /> One device setup per person</span>
            <span><i /> Host-controlled recording</span>
            <span><i /> Secure source recordings</span>
          </div>
        </div>
        <div className="landing-product" id="studio-preview" aria-label="Porchcast room experience">
          <div className="product-room-heading"><span>Rooms / Host</span><strong>The Midnight Show</strong></div>
          <div className="product-window">
            <div className="product-stage">
              <div className="stage-meta product-stage-meta"><span>LIVE ROOM</span><span><i />READY</span><time>00:00:00</time></div>
              <div className="product-participant-grid">
                <figure className="product-person"><img alt="Fictional podcast guest in a violet-lit studio" src={`${appPath()}images/podcast-guest-demo.webp`} /><figcaption>YOUR GUEST</figcaption></figure>
                <figure className="product-person"><img alt="Fictional podcast host in a violet-lit studio" src={`${appPath()}images/podcast-host-demo.webp`} /><figcaption>YOU · HOST</figcaption></figure>
              </div>
              <div className="product-controls stage-controls-overlay" aria-hidden="true">
                <div className="studio-controls">
                  <button tabIndex={-1} type="button"><StudioIcon name="microphone" /></button>
                  <button tabIndex={-1} type="button"><StudioIcon name="camera" /></button>
                  <button tabIndex={-1} type="button"><StudioIcon name="screen" /></button>
                  <button tabIndex={-1} type="button"><StudioIcon name="chat" /></button>
                  <button tabIndex={-1} type="button"><StudioIcon name="layout" /></button>
                  <button tabIndex={-1} type="button"><StudioIcon name="invite" /></button>
                  <button tabIndex={-1} type="button"><StudioIcon name="info" /></button>
                  <button className="hangup-control" tabIndex={-1} type="button"><StudioIcon name="hangup" /></button>
                </div>
                <div className="record-control"><button className="record-button" tabIndex={-1} type="button"><span aria-hidden="true" className="record-status-dot" />Record</button></div>
              </div>
            </div>
          </div>
          <p className="product-caption"><i /> The room you use: conversation, screen share, chat, views, and recording controls together.</p>
        </div>
      </section>

      <section className="landing-cloud-story" id="why-cloud">
        <div className="cloud-story-copy">
          <p className="eyebrow">Why it records in parts</p>
          <h2>A long episode shouldn’t depend on one giant file.</h2>
          <p>Porchcast safely closes short source sections as you go. If a connection drops or the last file is damaged, the rest of the episode stays intact. Those parts remain your secure source recordings; Desktop and Mobile views are prepared separately.</p>
          <div className="cloud-story-use-cases" aria-label="Supported recording types">
            <span>Solo episodes</span><span>Guest interviews</span><span>Screen sharing</span>
          </div>
        </div>
        <dl className="cloud-story-facts">
          <div><dt>One setup</dt><dd>per participant</dd></div>
          <div><dt>Separate</dt><dd>camera + audio sources</dd></div>
          <div><dt>Secure</dt><dd>short recovery sections</dd></div>
        </dl>
      </section>

      <section className="landing-benefits" id="outputs">
        <header className="landing-section-heading">
          <p className="eyebrow">From conversation to content</p>
          <h2>Record once. Keep your options open.</h2>
        </header>
        <div className="landing-benefit-grid">
          <article>
            <span className="benefit-number">01</span>
            <h3>Keep the laptop focused on the room.</h3>
            <p>Each browser publishes one camera and microphone feed. Cloud infrastructure takes on the recording workload.</p>
          </article>
          <article>
            <span className="benefit-number">02</span>
            <h3>Edit people, not one flattened call.</h3>
            <p>Host and guest sources stay separate, giving every episode a safer and more flexible editing foundation.</p>
          </article>
          <article>
            <span className="benefit-number">03</span>
            <h3>Ready for desktop and mobile.</h3>
            <p>Get a 16:9 Desktop view for complete episodes and a 9:16 Mobile view for short-form content.</p>
          </article>
        </div>
      </section>

      <section className="landing-process" id="how-it-works">
        <div className="process-heading">
          <p className="eyebrow">How it works</p>
          <h2>Book. Invite.<br />Record.</h2>
        </div>
        <ol>
          <li><span>1</span><div><strong>Book your room</strong><p>Name the episode, choose solo or invite up to two guests, and select a quality profile for the computers in the room.</p></div></li>
          <li><span>2</span><div><strong>Send one private link</strong><p>Each person chooses a camera and microphone once, gives consent, and joins the conversation.</p></div></li>
          <li><span>3</span><div><strong>Record it yourself</strong><p>The host starts and stops the Cloud recording—no agent required. Downloads stay attached to the room.</p></div></li>
        </ol>
      </section>

      <section className="landing-extension" id="extension">
        <img alt="" src={`${appPath()}porchcast-mark.svg`} />
        <div>
          <p className="eyebrow">Porchcast browser companion</p>
          <h2>Know when the final cut is ready.</h2>
          <p>Keep a movable Porchcast widget close in any tab, return to recent Porches, and get an alert when your Desktop and Mobile recordings finish preparing.</p>
        </div>
      </section>

      <section className="landing-final-cta">
        <p className="eyebrow">Ready when the conversation is</p>
        <h2>Bring a browser. Leave the production rig behind.</h2>
        <button className="hero-primary" onClick={onBook} type="button">Book your room <span aria-hidden="true">→</span></button>
      </section>
      <LandingFooter onNavigate={onNavigate} publicPath={publicPath} />
      {showBackToTop ? (
        <button aria-label="Back to top" className="back-to-top" onClick={backToTop} title="Back to top" type="button">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 14 7-7 7 7" /></svg>
        </button>
      ) : null}
    </main>
  );
}
