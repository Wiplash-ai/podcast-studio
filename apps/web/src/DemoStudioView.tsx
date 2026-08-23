import type { RoomAccess } from "@wiplash/podcast-contracts";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

import type { DemoScenario } from "./backend/demo-scenarios";
import "./DemoStudioView.css";

interface DemoStudioViewProps {
  access: RoomAccess;
  scenario: DemoScenario;
  onLeave: () => void;
  onRecordingChange: (active: boolean) => void;
}

interface DemoParticipant {
  accent: string;
  id: string;
  local: boolean;
  name: string;
  role: "Host" | "Guest";
}

interface ScenarioDetail {
  detail: string;
  label: string;
  tone: "good" | "live" | "busy" | "warning";
}

const scenarioDetails: Record<DemoScenario, ScenarioDetail> = {
  ready: {
    label: "Ready",
    detail: "The simulated room is ready. No device connection is required.",
    tone: "good",
  },
  recording: {
    label: "Recording",
    detail: "A deterministic cloud-recording preview is active. No file is being created.",
    tone: "live",
  },
  finalizing: {
    label: "Finalizing",
    detail: "The demo is preparing simulated recording artifacts. Controls stay read-only.",
    tone: "busy",
  },
  "full-room": {
    label: "Full room",
    detail: "Every configured seat is occupied in this simulated capacity view.",
    tone: "warning",
  },
  reconnecting: {
    label: "Reconnecting",
    detail: "Participant connections are in a fixed recovery state for UI testing.",
    tone: "warning",
  },
};

const guestNames = [
  "Maya Chen",
  "Theo Brooks",
  "Noor Hassan",
  "June Park",
  "Mateo Silva",
  "Avery Jones",
  "Sam Okafor",
  "Priya Shah",
  "Elliot Reed",
  "Lena Ortiz",
  "Kai Morgan",
  "Remy Laurent",
] as const;

const participantAccents = [
  "#64d2ff",
  "#bf5af2",
  "#ff9f0a",
  "#30d158",
  "#ff6482",
  "#5e5ce6",
  "#ffd60a",
  "#40c8e0",
  "#ac8e68",
  "#ff6961",
  "#66d4cf",
  "#d0a8ff",
  "#7d9cff",
] as const;

const participantTargets: Record<DemoScenario, number> = {
  ready: 4,
  recording: 6,
  finalizing: 6,
  "full-room": 13,
  reconnecting: 5,
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function demoParticipants(access: RoomAccess, scenario: DemoScenario): DemoParticipant[] {
  const capacity = Math.min(13, Math.max(1, access.room.settings.maxGuests + 1));
  const count = Math.min(capacity, participantTargets[scenario]);
  const localName = access.role === "host" ? access.room.hostName : "You";
  const participants: DemoParticipant[] = [{
    accent: participantAccents[0],
    id: String(access.participantId),
    local: true,
    name: localName,
    role: access.role === "host" ? "Host" : "Guest",
  }];

  if (access.role === "guest" && participants.length < count) {
    participants.push({
      accent: participantAccents[1],
      id: "demo-host",
      local: false,
      name: access.room.hostName,
      role: "Host",
    });
  }

  for (const name of guestNames) {
    if (participants.length >= count) break;
    participants.push({
      accent: participantAccents[participants.length % participantAccents.length] ?? participantAccents[0],
      id: `demo-guest-${participants.length}`,
      local: false,
      name,
      role: "Guest",
    });
  }

  return participants;
}

export function DemoStudioView({
  access,
  scenario,
  onLeave,
  onRecordingChange,
}: DemoStudioViewProps) {
  const [cameraOn, setCameraOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [localMessages, setLocalMessages] = useState<string[]>([]);
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [recordingActive, setRecordingActive] = useState(scenario === "recording");
  const [screenOn, setScreenOn] = useState(false);
  const chatId = useId();
  const recordingHelpId = useId();
  const recordingChangeRef = useRef(onRecordingChange);

  useEffect(() => {
    recordingChangeRef.current = onRecordingChange;
  }, [onRecordingChange]);

  useEffect(() => {
    const nextRecordingState = scenario === "recording";
    setRecordingActive(nextRecordingState);
    recordingChangeRef.current(nextRecordingState);
  }, [scenario]);

  const participants = demoParticipants(access, scenario);
  const roomCapacity = Math.min(13, Math.max(1, access.room.settings.maxGuests + 1));
  const scenarioDetail = scenarioDetails[scenario];
  const recordBlocked = scenario === "finalizing" || scenario === "reconnecting";
  const canRecord = access.role === "host" && !recordBlocked;
  const displayedState = recordingActive
    ? scenarioDetails.recording
    : scenario === "recording"
      ? scenarioDetails.ready
      : scenarioDetail;

  function changeRecording(active: boolean) {
    setRecordingActive(active);
    recordingChangeRef.current(active);
  }

  function handleLeave() {
    if (recordingActive) recordingChangeRef.current(false);
    onLeave();
  }

  function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = chatDraft.trim();
    if (!message) return;
    setLocalMessages((messages) => [...messages, message]);
    setChatDraft("");
  }

  const recordingHelp = access.role !== "host"
    ? "Only the host can use the demo recording control."
    : scenario === "finalizing"
      ? "Recording controls return after the simulated finalization finishes."
      : scenario === "reconnecting"
        ? "Recording controls are paused during simulated reconnection."
        : "This changes UI state only. It never creates or uploads media.";

  return (
    <main className="demo-studio" aria-labelledby="demo-studio-title">
      <header className="demo-studio__header">
        <div className="demo-studio__heading">
          <p className="demo-studio__eyebrow">Porchcast studio preview</p>
          <h1 id="demo-studio-title">{access.room.title}</h1>
          <p>
            Signed in as <strong>{access.role === "host" ? "Host" : "Guest"}</strong>
            <span aria-hidden="true"> · </span>
            <span>{participants.length} of {roomCapacity} seats</span>
          </p>
        </div>

        <div className="demo-studio__header-actions">
          <div
            className="demo-studio__state"
            data-tone={displayedState.tone}
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true" />
            <strong>{displayedState.label}</strong>
          </div>
          <button className="demo-studio__leave" type="button" onClick={handleLeave}>
            Leave demo
          </button>
        </div>
      </header>

      <section className="demo-studio__notice" aria-label="Local demo limitations">
        <strong><span aria-hidden="true">◇ </span>LOCAL DEMO · SIMULATED MEDIA</strong>
        <span>No camera, microphone, screen, recorder, or backend service is accessed.</span>
      </section>

      <section
        className="demo-studio__scenario"
        data-tone={scenarioDetail.tone}
        aria-label={`Demo scenario: ${scenarioDetail.label}`}
      >
        <div>
          <span>Scenario</span>
          <strong>{scenarioDetail.label}</strong>
        </div>
        <p>{scenarioDetail.detail}</p>
      </section>

      <div className="demo-studio__workspace" data-chat-open={chatOpen ? "true" : "false"}>
        <section className="demo-studio__stage" data-screen={screenOn ? "true" : "false"}>
          {screenOn ? (
            <section className="demo-studio__screen" aria-label="Simulated shared screen">
              <div className="demo-studio__screen-chrome" aria-hidden="true">
                <i /><i /><i />
                <span>porchcast.local/demo</span>
              </div>
              <div className="demo-studio__screen-content">
                <span>SIMULATED SCREEN</span>
                <strong>Episode rundown</strong>
                <div aria-hidden="true"><i /><i /><i /><i /></div>
                <p>This preview contains no captured screen content.</p>
              </div>
            </section>
          ) : null}

          <ul className="demo-studio__participants" aria-label="Simulated participants">
            {participants.map((participant, index) => {
              const reconnecting = scenario === "reconnecting" && !participant.local;
              const speaking = !reconnecting && (
                scenario === "recording" ? index === 1 : index === 0
              );
              const localCameraOff = participant.local && !cameraOn;
              return (
                <li
                  className="demo-studio__participant"
                  data-camera-off={localCameraOff ? "true" : "false"}
                  data-reconnecting={reconnecting ? "true" : "false"}
                  data-speaking={speaking ? "true" : "false"}
                  key={participant.id}
                  style={{ "--demo-accent": participant.accent } as CSSProperties}
                >
                  <div className="demo-studio__avatar" aria-hidden="true">
                    <span>{localCameraOff ? "Camera off" : initials(participant.name)}</span>
                  </div>
                  <div className="demo-studio__participant-meta">
                    <div>
                      <strong>{participant.name}{participant.local ? " (You)" : ""}</strong>
                      <span>{participant.role}</span>
                    </div>
                    <span className="demo-studio__connection">
                      <i aria-hidden="true" />
                      {reconnecting
                        ? "Reconnecting"
                        : participant.local && !microphoneOn
                          ? "Muted"
                          : "Connected"}
                    </span>
                  </div>
                  {speaking ? <span className="demo-studio__sr-only">Active speaker</span> : null}
                </li>
              );
            })}
          </ul>
        </section>

        {chatOpen ? (
          <aside className="demo-studio__chat" id={chatId} aria-label="Local demo chat">
            <header>
              <div>
                <span>Local only</span>
                <h2>Room chat</h2>
              </div>
              <button type="button" onClick={() => setChatOpen(false)} aria-label="Close demo chat">
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="demo-studio__messages" aria-live="polite">
              <article>
                <strong>{access.room.hostName}</strong>
                <p>Welcome to the local studio preview.</p>
              </article>
              <article>
                <strong>Maya Chen</strong>
                <p>Audio levels look good in the simulation.</p>
              </article>
              {localMessages.map((message, index) => (
                <article className="demo-studio__message-local" key={`local-${index}`}>
                  <strong>You</strong>
                  <p>{message}</p>
                </article>
              ))}
            </div>

            <form onSubmit={sendChatMessage}>
              <label className="demo-studio__sr-only" htmlFor={`${chatId}-message`}>
                Demo chat message
              </label>
              <textarea
                id={`${chatId}-message`}
                maxLength={280}
                onChange={(event) => setChatDraft(event.target.value)}
                placeholder="Write a local demo message"
                rows={3}
                value={chatDraft}
              />
              <div>
                <small>{chatDraft.length}/280 · Never sent</small>
                <button type="submit" disabled={!chatDraft.trim()}>Add locally</button>
              </div>
            </form>
          </aside>
        ) : null}
      </div>

      <footer className="demo-studio__transport" aria-label="Simulated studio controls">
        <div className="demo-studio__controls">
          <button
            className={!microphoneOn ? "is-off" : ""}
            type="button"
            aria-pressed={microphoneOn}
            onClick={() => setMicrophoneOn((active) => !active)}
          >
            <span aria-hidden="true">◉</span>
            Mic {microphoneOn ? "on" : "off"}
          </button>
          <button
            className={!cameraOn ? "is-off" : ""}
            type="button"
            aria-pressed={cameraOn}
            onClick={() => setCameraOn((active) => !active)}
          >
            <span aria-hidden="true">▣</span>
            Camera {cameraOn ? "on" : "off"}
          </button>
          <button
            className={screenOn ? "is-on" : ""}
            type="button"
            aria-pressed={screenOn}
            onClick={() => setScreenOn((active) => !active)}
          >
            <span aria-hidden="true">▤</span>
            {screenOn ? "Stop screen" : "Share screen"}
          </button>
          <button
            className={chatOpen ? "is-on" : ""}
            type="button"
            aria-expanded={chatOpen}
            aria-controls={chatId}
            onClick={() => setChatOpen((open) => !open)}
          >
            <span aria-hidden="true">◌</span>
            Chat {chatOpen ? "open" : "closed"}
          </button>
        </div>

        <div className="demo-studio__recording-control">
          <p id={recordingHelpId}>{recordingHelp}</p>
          <button
            className={recordingActive ? "is-recording" : ""}
            type="button"
            aria-describedby={recordingHelpId}
            aria-pressed={recordingActive}
            disabled={!canRecord}
            onClick={() => changeRecording(!recordingActive)}
          >
            <span aria-hidden="true" />
            {scenario === "finalizing"
              ? "Finalizing demo…"
              : recordingActive
                ? "Stop demo recording"
                : "Start demo recording"}
          </button>
        </div>
      </footer>
    </main>
  );
}
