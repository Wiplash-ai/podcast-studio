import type {
  AudioPreset,
  RecorderLayout,
  RoomAdmissionMode,
  ScreenSharePreset,
  VideoPreset,
} from "@wiplash/podcast-contracts";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { AdmissionModeSelect } from "./AdmissionModeSelect";
import { randomDisplayName } from "./participant-name";
import { appPath } from "./public-path";
import type { BookRoomInput } from "./room-booking";

const videoPresets: Array<{
  id: VideoPreset;
  name: string;
  summary: string;
  detail: string;
}> = [
  {
    id: "data_saver",
    name: "Basic",
    summary: "360p · 24 fps",
    detail: "For older laptops or unstable connections.",
  },
  {
    id: "balanced",
    name: "Balanced",
    summary: "720p · 30 fps",
    detail: "The safest default for most conversations.",
  },
  {
    id: "high_fidelity",
    name: "Studio",
    summary: "1080p · 30 fps",
    detail: "Sharper video with more CPU and bandwidth.",
  },
];

const guestSeatOptions = [
  { value: 0, label: "Solo recording", detail: "Just you" },
  { value: 1, label: "1 guest", detail: "Two people total" },
  { value: 2, label: "2 guests", detail: "Three people total" },
  { value: 3, label: "3 guests", detail: "Four people total" },
  { value: 4, label: "4 guests", detail: "Five people total" },
  { value: 8, label: "8 guests", detail: "Nine people total · Showrunner" },
  { value: 12, label: "12 guests", detail: "Thirteen people total · Studio" },
] as const;

function GuestSeatSelect({
  guestSeatLimit,
  value,
  onChange,
}: {
  guestSeatLimit: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const selected = guestSeatOptions.find((option) => option.value === value) ?? guestSeatOptions[1];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="guest-seat-select" ref={container}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby="guest-seat-label guest-seat-value"
        className="guest-seat-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span><strong id="guest-seat-value">{selected.label}</strong><small>{selected.detail}</small></span>
        <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5.5 7.5 4.5 4.5 4.5-4.5" /></svg>
      </button>
      {open ? <div aria-labelledby="guest-seat-label" className="guest-seat-menu" role="listbox">
        {guestSeatOptions.map((option) => (
          <button
            aria-selected={value === option.value}
            className={value === option.value ? "active" : ""}
            disabled={option.value > guestSeatLimit}
            key={option.value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            role="option"
            type="button"
          >
            <span><strong>{option.label}</strong><small>{option.detail}{option.value > guestSeatLimit ? " · Premium" : ""}</small></span>
            <i aria-hidden="true" />
          </button>
        ))}
      </div> : null}
    </div>
  );
}

export type BookingViewProps = {
  accountStorage: { guestSeatLimit: number; signedIn: boolean };
  busy: boolean;
  onClose: () => void;
  onPremium: () => void;
  onBook: (input: BookRoomInput) => Promise<void>;
};

export function bookingStepCanContinue(step: number, title: string, hostName: string): boolean {
  return step !== 0 || Boolean(title.trim() && hostName.trim());
}

export function BookingView({
  accountStorage,
  busy,
  onBook,
  onClose,
  onPremium,
}: BookingViewProps) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("The next great conversation");
  const [hostName, setHostName] = useState(() => randomDisplayName());
  const [maxGuests, setMaxGuests] = useState(1);
  const [admissionMode, setAdmissionMode] = useState<RoomAdmissionMode>("host_approval");
  const [videoPreset, setVideoPreset] = useState<VideoPreset>("data_saver");
  const [audioPreset, setAudioPreset] = useState<AudioPreset>("voice");
  const [screenSharePreset, setScreenSharePreset] = useState<ScreenSharePreset>("balanced");
  const [requestedLayouts, setRequestedLayouts] = useState<RecorderLayout[]>([
    "horizontal",
    "vertical",
  ]);

  useEffect(() => {
    if (maxGuests > accountStorage.guestSeatLimit) {
      setMaxGuests(accountStorage.guestSeatLimit);
    }
  }, [accountStorage.guestSeatLimit, maxGuests]);

  function toggleLayout(layout: RecorderLayout) {
    setRequestedLayouts((current) => {
      if (current.includes(layout)) {
        return current.length === 1 ? current : current.filter((item) => item !== layout);
      }
      return [...current, layout];
    });
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await onBook({
      title,
      hostName,
      maxGuests,
      admissionMode: maxGuests === 0 ? "invite_link" : admissionMode,
      videoPreset,
      audioPreset,
      screenSharePreset,
      requestedLayouts,
      saveToAccount: accountStorage.signedIn,
    });
  }

  return (
    <div className="booking-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form
        aria-label="Book a Porchcast room"
        aria-modal="true"
        className="booking-workspace booking-wizard booking-modal"
        onSubmit={(event) => void submit(event)}
        role="dialog"
      >
        <header className="workspace-heading">
          <div>
            <p className="eyebrow">Book a private studio</p>
            <h2>{["Room details", "Quality", "Recording"][step]}</h2>
            <p>{[
              "Start with the people and the episode.",
              "Choose a clear signal profile for every participant.",
              "Choose the recordings the Cloud should prepare after Stop.",
            ][step]}</p>
          </div>
          <button aria-label="Close room booking" className="modal-close" onClick={onClose} type="button">×</button>
          <ol className="form-progress" aria-label="Room setup steps">
            {["Details", "Quality", "Recording"].map((label, index) => (
              <li className={index === step ? "active" : index < step ? "complete" : ""} key={label}>
                <button disabled={index > step} onClick={() => setStep(index)} type="button"><span>0{index + 1}</span>{label}</button>
              </li>
            ))}
          </ol>
        </header>
        <div className="booking-fields">
          {step === 0 ? <section className="form-section wizard-step">
            <div className="section-heading">
              <span>01</span>
              <div><h2>Who’s joining?</h2><p>Choose a solo room or invite up to {accountStorage.guestSeatLimit} guests.</p></div>
            </div>
            <div className="field-grid">
              <label>
                <span>Episode or room name</span>
                <input
                  maxLength={120}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  value={title}
                />
              </label>
              <label>
                <span>Your display name</span>
                <input
                  maxLength={80}
                  onChange={(event) => setHostName(event.target.value)}
                  required
                  value={hostName}
                />
              </label>
              <div className="field-control">
                <span className="field-label" id="guest-seat-label">Guest seats</span>
                <GuestSeatSelect guestSeatLimit={accountStorage.guestSeatLimit} onChange={setMaxGuests} value={maxGuests} />
                {accountStorage.guestSeatLimit < 12 ? <button className="premium-seat-cta" onClick={onPremium} type="button">
                  <span><strong>Need a bigger panel?</strong><small>Showrunner supports 8 guests. Studio supports 12.</small></span>
                  <b>Explore Premium <i aria-hidden="true">→</i></b>
                </button> : <small className="field-help">Each guest receives an independent, reconnectable seat.</small>}
              </div>
              {maxGuests > 0 ? <div className="field-control admission-field">
                <span className="field-label">Who can join?</span>
                <AdmissionModeSelect onChange={setAdmissionMode} value={admissionMode} />
              </div> : null}
            </div>
          </section> : null}

          {step === 1 ? <section className="form-section wizard-step">
            <div className="section-heading">
              <span>02</span>
              <div><h2>Match the machine</h2><p>These settings apply to each participant’s browser publication.</p></div>
            </div>
            <span className="minor-label">CAMERA QUALITY</span>
            <div className="quality-options">
              {videoPresets.map((preset) => (
                <button
                  aria-pressed={videoPreset === preset.id}
                  className={`quality-option ${videoPreset === preset.id ? "active" : ""}`}
                  key={preset.id}
                  onClick={() => setVideoPreset(preset.id)}
                  type="button"
                >
                  <span className="quality-image-frame">
                    <img alt="Example podcast camera frame" className={`quality-preview quality-${preset.id}`} src={`${appPath()}images/podcast-host-demo.webp`} />
                    <span>{preset.summary}</span>
                  </span>
                  <span className="quality-option-copy">
                    <span className="choice-radio" aria-hidden="true"><i /></span>
                    <strong>{preset.name}</strong>
                    <small>{preset.detail}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="split-settings">
              <div>
                <span className="minor-label">AUDIO CAPTURE</span>
                <div className="segmented-control">
                  <button
                    aria-pressed={audioPreset === "voice"}
                    className={audioPreset === "voice" ? "active" : ""}
                    onClick={() => setAudioPreset("voice")}
                    type="button"
                  >Conversation</button>
                  <button
                    aria-pressed={audioPreset === "studio"}
                    className={audioPreset === "studio" ? "active" : ""}
                    onClick={() => setAudioPreset("studio")}
                    type="button"
                  >Original</button>
                </div>
                <p className="field-help">
                  {audioPreset === "voice"
                    ? "Reduces room echo and background noise before the participant audio is sent. It does not change the visual layout."
                    : "Preserves stereo input with browser cleanup off. Headphones are required to prevent feedback."}
                </p>
              </div>
              <div>
                <span className="minor-label">SCREEN SHARE CLARITY</span>
                <div className="segmented-control">
                  <button
                    aria-pressed={screenSharePreset === "balanced"}
                    className={screenSharePreset === "balanced" ? "active" : ""}
                    onClick={() => setScreenSharePreset("balanced")}
                    type="button"
                  >Standard</button>
                  <button
                    aria-pressed={screenSharePreset === "detail"}
                    className={screenSharePreset === "detail" ? "active" : ""}
                    onClick={() => setScreenSharePreset("detail")}
                    type="button"
                  >Detail</button>
                </div>
                <p className="field-help">Controls the clarity of a shared screen sent to the room. It does not resize camera recordings or choose the final recording view.</p>
              </div>
            </div>
          </section> : null}

          {step === 2 ? <section className="form-section recording-section wizard-step">
            <div className="section-heading">
              <span>03</span>
              <div><h2>Recording options</h2><p>The heavy recording workload stays off participant computers.</p></div>
            </div>
            <div className="cloud-recording-card">
              <span className="cloud-recording-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7.4 18.5h10.2a4.1 4.1 0 0 0 .6-8.2A6.4 6.4 0 0 0 6 8.7a4.9 4.9 0 0 0 1.4 9.8Z" /></svg></span>
              <div className="cloud-recording-copy">
                <div><strong>Record in the Cloud</strong><span className="availability">INCLUDED</span></div>
                <p>Your computer stays focused on the conversation while the Cloud preserves each participant and prepares your selected formats.</p>
                <ul><li>Separate camera and microphone sources</li><li>Downloadable recordings after Stop</li></ul>
              </div>
            </div>
            <div className="format-heading"><strong>Recording formats</strong><small>Keep one or choose both</small></div>
            <div className="format-options">
              {([{
                id: "horizontal" as const,
                ratio: "16:9",
                name: "Desktop",
                detail: "Wide view for full episodes",
              }, {
                id: "vertical" as const,
                ratio: "9:16",
                name: "Mobile",
                detail: "Tall view for clips and short-form",
              }]).map((format) => (
                <button
                  aria-pressed={requestedLayouts.includes(format.id)}
                  className={`format-option ${requestedLayouts.includes(format.id) ? "active" : ""}`}
                  key={format.id}
                  onClick={() => toggleLayout(format.id)}
                  type="button"
                >
                  <span className={`format-demo format-demo-${format.id}`} aria-hidden="true">
                    <span><img alt="" src={`${appPath()}images/podcast-guest-demo.webp`} /></span>
                    <span><img alt="" src={`${appPath()}images/podcast-host-demo.webp`} /></span>
                    <i>REC</i>
                  </span>
                  <span className="format-option-copy"><small>{format.ratio}</small><strong>{format.name}</strong><span>{format.detail}</span></span>
                  <span className="format-check" aria-hidden="true"><i /></span>
                </button>
              ))}
            </div>
            <p className="browser-recording-note"><strong>Browser backup</strong><span>Coming soon</span></p>
          </section> : null}

          <div className="booking-submit wizard-actions">
            <button className="wizard-back" disabled={step === 0 || busy} onClick={() => setStep((current) => current - 1)} type="button">← Back</button>
            <p><strong>Step {step + 1} of 3</strong><br />{accountStorage.signedIn
              ? "This reusable room will be saved to your Wiplash account."
              : "Book without an account. Sign in only when you are ready to record."}</p>
            {step < 2 ? (
              <button
                disabled={!bookingStepCanContinue(step, title, hostName)}
                onClick={() => setStep((current) => current + 1)}
                type="button"
              >Continue <span aria-hidden="true">→</span></button>
            ) : (
              <button disabled={busy} onClick={() => void submit()} type="button">
                {busy ? "Booking your room…" : "Book this room"}<span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
