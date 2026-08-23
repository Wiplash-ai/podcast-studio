import {
  type Room,
  type RoomAccess,
  type RoomAdmission,
  type RoomAdmissionMode,
} from "@wiplash/podcast-contracts";
import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createWebRuntime } from "./backend/web-runtime";
import type { PorchcastBackend } from "./backend/porchcast-backend";
import { randomDisplayName } from "./participant-name";
import { pricingQuery } from "./plan-catalog";
import { PwaStatus } from "./PwaStatus";
import type { BookRoomInput } from "./room-booking";
import {
  appPath,
  publicAppPageFromPath,
  type PublicAppPage,
} from "./public-path";
import {
  roomSaveControlState,
  type RoomSaveState,
} from "./studio-controls";
import { StudioIcon } from "./StudioIcon";
import { useTransientMessage } from "./use-transient-message";
import type { ImportedVdoRoom } from "./vdo-url";
import { useAccount, type AccountModel } from "./use-account";

const loadAccountDialog = () => import("./AccountDialog");
const loadBookingView = () => import("./BookingView");
const loadCloudStudio = () => import("./CloudStudioView");
const loadDemoStudio = () => import("./DemoStudioView");
const loadPublicSite = () => import("./PublicSite");

function preloadSurface(loader: () => Promise<unknown>) {
  // React.lazy owns the visible error path. A speculative preload should not
  // also create an unhandled rejection if the network drops mid-navigation.
  void loader().catch(() => undefined);
}

const AccountDialog = lazy(async () => ({
  default: (await loadAccountDialog()).AccountDialog,
}));
const BookingView = lazy(async () => ({
  default: (await loadBookingView()).BookingView,
}));
const CloudStudioView = lazy(async () => ({
  default: (await loadCloudStudio()).CloudStudioView,
}));
const DemoStudioView = lazy(async () => ({
  default: (await loadDemoStudio()).DemoStudioView,
}));
const PublicSite = lazy(async () => ({
  default: (await loadPublicSite()).PublicSite,
}));

function SurfaceLoading({ label }: { label: string }) {
  return <main aria-busy="true" className="surface-loading"><span>{label}</span></main>;
}

function DialogLoading({ label }: { label: string }) {
  return (
    <div className="confirmation-backdrop">
      <section aria-busy="true" className="confirmation-modal" role="status">
        <p>{label}</p>
      </section>
    </div>
  );
}

function roomTokenKey(roomId: string): string {
  return `podcast-studio:host-token:${roomId}`;
}

function guestTokenKey(roomId: string): string {
  return `podcast-studio:guest-token:${roomId}`;
}

function participantTokenKey(roomId: string): string {
  return `podcast-studio:participant-token:${roomId}`;
}

function participantAdmissionIdKey(roomId: string): string {
  return `podcast-studio:participant-admission:${roomId}`;
}

function roomInviteKey(roomId: string): string {
  return `podcast-studio:guest-invite:${roomId}`;
}

function AppHeader({
  account,
  mode,
  onAccount,
  onBookRoom,
  onHome,
  onPublicPage,
  onSaveRoom,
  publicPath,
  publicPage,
  roomSaveState,
  roomTitle,
}: {
  account: AccountModel;
  mode: "booking" | "home" | "room";
  onAccount: () => void;
  onBookRoom: () => void;
  onHome: () => void;
  onPublicPage: (page: PublicAppPage) => void;
  onSaveRoom: () => void;
  publicPath: (page: PublicAppPage) => string;
  publicPage: PublicAppPage;
  roomSaveState: RoomSaveState;
  roomTitle?: string | null;
}) {
  const roomSaveLabel = roomSaveState === "saved"
    ? "Saved"
    : roomSaveState === "saving"
      ? "Saving…"
      : roomSaveState === "limit"
        ? "Room limit"
        : "Save room";
  const roomSaveTooltip = roomSaveState === "saved"
    ? "Saved to your account"
    : roomSaveState === "sign-in"
      ? "Sign in to save this room"
      : roomSaveState === "saving"
        ? "Saving room…"
        : roomSaveState === "limit"
          ? "This account reached the operational room limit"
          : "Save this room";
  return (
    <header className="topbar">
      <button aria-label="Porchcast home" className="wordmark" onClick={onHome} type="button">
        <span className="wordmark-mark" aria-hidden="true">
          <img alt="" src={`${appPath()}porchcast-mark.svg`} />
        </span>
        <span>Porchcast</span>
      </button>
      {mode === "home" ? (
        <nav className="landing-nav" aria-label="Product navigation">
          {publicPage === "home" ? <>
            <a href="#why-cloud">Why Cloud</a>
            <a href="#how-it-works">How it works</a>
            <a href={publicPath("pricing")} onClick={(event) => { event.preventDefault(); onPublicPage("pricing"); }}>Pricing</a>
          </> : <>
            <a href={publicPath("home")} onClick={(event) => { event.preventDefault(); onPublicPage("home"); }}>Product</a>
            <a aria-current={publicPage === "pricing" ? "page" : undefined} href={publicPath("pricing")} onClick={(event) => { event.preventDefault(); onPublicPage("pricing"); }}>Pricing</a>
            <a aria-current={publicPage === "privacy" ? "page" : undefined} href={publicPath("privacy")} onClick={(event) => { event.preventDefault(); onPublicPage("privacy"); }}>Privacy</a>
          </>}
        </nav>
      ) : (
        <nav className="app-breadcrumb" aria-label="Current location">
          <span>Rooms</span><i>/</i><strong>{mode === "booking" ? "Book a room" : roomTitle}</strong>
        </nav>
      )}
      <div className="topbar-actions">
        {roomSaveState !== "hidden" ? <button
          aria-label={roomSaveState === "saved" ? "Room saved. Open your account" : roomSaveTooltip}
          className={`room-save-trigger ${roomSaveState === "saved" ? "saved" : roomSaveState === "limit" ? "limit-reached" : ""}`}
          data-tooltip={roomSaveTooltip}
          disabled={roomSaveState === "saving"}
          onClick={roomSaveState === "saved" || roomSaveState === "limit" ? onAccount : onSaveRoom}
          type="button"
        ><StudioIcon name="bookmark" /><span>{roomSaveLabel}</span>{roomSaveState === "saved" ? <i aria-hidden="true">✓</i> : null}</button> : null}
        <button
          aria-label={account.snapshot.account ? "Open your Porchcast account" : "Sign in with Wiplash.ai"}
          className={`account-trigger ${account.snapshot.account ? "signed-in" : ""}`}
          onClick={onAccount}
          type="button"
        ><AccountHeaderIcon /><span>{account.snapshot.account?.displayName ?? "Sign in"}</span><i className={account.status} /></button>
        <button
          className="new-room-button"
          onClick={mode === "booking" ? onHome : onBookRoom}
          type="button"
        >
          {mode === "booking" ? "Back home" : "Book a room"}
        </button>
      </div>
    </header>
  );
}

function AccountHeaderIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4.5 21c.8-5 3.3-7 7.5-7s6.7 2 7.5 7" /></svg>;
}

interface AdmissionGateState {
  roomId: string;
  roomTitle: string;
  mode: Exclude<RoomAdmissionMode, "invite_link">;
  invitationToken: string;
  admissionToken: string;
  admission: RoomAdmission | null;
}

interface DepartedRoom {
  id: string;
  title: string;
}

function RoomExitView({
  busy,
  onHome,
  onRejoin,
  room,
}: {
  busy: boolean;
  onHome: () => void;
  onRejoin: () => void;
  room: DepartedRoom;
}) {
  return (
    <main className="room-exit-main">
      <section className="room-exit-card">
        <span className="room-exit-mark" aria-hidden="true"><img alt="" src={`${appPath()}porchcast-mark.svg`} /></span>
        <p className="eyebrow">CALL ENDED</p>
        <h1>You left {room.title}</h1>
        <p>
          The room is still yours. Rejoin with the same link whenever you are ready;
          Cloud recordings continue finalizing even while this page is closed.
        </p>
        <div>
          <button className="room-exit-secondary" onClick={onHome} type="button">Back to home</button>
          <button className="room-exit-primary" disabled={busy} onClick={onRejoin} type="button">
            {busy ? "Opening room…" : "Rejoin room"}<span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    </main>
  );
}

function AdmissionGate({
  account,
  backend,
  gate,
  onAdmitted,
  onCancel,
  onChange,
}: {
  account: AccountModel;
  backend: PorchcastBackend;
  gate: AdmissionGateState;
  onAdmitted: (token: string) => void;
  onCancel: () => void;
  onChange: (gate: AdmissionGateState) => void;
}) {
  const [displayName, setDisplayName] = useState(
    account.snapshot.account?.displayName ?? randomDisplayName(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!gate.admission || gate.admission.status !== "pending") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await backend.getAdmission({
          roomId: gate.roomId,
          admissionId: gate.admission!.id,
          admissionToken: gate.admissionToken,
        });
        if (cancelled) return;
        if (
          next.revision !== gate.admission?.revision
          || next.status !== gate.admission?.status
        ) onChange({ ...gate, admission: next });
        if (next.status === "admitted") onAdmitted(gate.admissionToken);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "The waiting room is unavailable.");
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    backend,
    gate.admission?.id,
    gate.admission?.revision,
    gate.admission?.status,
    gate.admissionToken,
    gate.roomId,
  ]);

  async function requestAdmission() {
    setBusy(true);
    setError("");
    try {
      const next = await backend.requestAdmission({
        roomId: gate.roomId,
        invitationToken: gate.invitationToken,
        admissionToken: gate.admissionToken,
        displayName,
      });
      sessionStorage.setItem(participantTokenKey(gate.roomId), next.admissionToken);
      sessionStorage.setItem(participantAdmissionIdKey(gate.roomId), next.admission.id);
      onChange({ ...gate, admissionToken: next.admissionToken, admission: next.admission });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The host could not be notified.");
    } finally {
      setBusy(false);
    }
  }

  const status = gate.admission?.status ?? null;
  return (
    <main className="admission-gate">
      <section aria-labelledby="admission-title">
        <span className="admission-mark" aria-hidden="true"><i /><i /><i /></span>
        <p className="eyebrow">{gate.mode === "host_approval" ? "PRIVATE WAITING ROOM" : "VERIFIED ENTRY"}</p>
        <h1 id="admission-title">{gate.roomTitle}</h1>
        {gate.mode === "verified_wiplash" ? <>
          <p>This host welcomes verified Wiplash users. Your Google, GitHub, GitLab, or Wiplash.ai sign-in all resolve to one Wiplash account here.</p>
          {account.snapshot.account ? (
            <button className="admission-primary" onClick={() => onAdmitted(gate.invitationToken)} type="button">
              Join as {account.snapshot.account.displayName}<span>→</span>
            </button>
          ) : (
            <button className="admission-primary" disabled={!account.snapshot.capabilities.signInAvailable || Boolean(account.busy)} onClick={() => void account.signIn()} type="button">
              Continue with Wiplash.ai<span>→</span>
            </button>
          )}
        </> : status === "pending" ? <>
          <div className="admission-waiting-orbit" aria-hidden="true"><i /><span /></div>
          <h2>You’re in the lobby.</h2>
          <p>{displayName}, the host has your request. Keep this page open; the studio will join automatically when they admit you.</p>
        </> : status === "denied" ? <>
          <h2>The host didn’t admit this request.</h2>
          <p>You can close this page or ask the host for a fresh invitation.</p>
        </> : <>
          <p>Tell the host who’s waiting. Your camera and microphone stay off until you are admitted and choose Join.</p>
          <label><span>Your display name</span><input maxLength={80} onChange={(event) => setDisplayName(event.target.value)} value={displayName} /></label>
          <button className="admission-primary" disabled={busy || !displayName.trim()} onClick={() => void requestAdmission()} type="button">
            {busy ? "Notifying host…" : "Ask to join"}<span>→</span>
          </button>
        </>}
        {error ? <p className="admission-error" role="alert">{error}</p> : null}
        <button className="admission-cancel" onClick={onCancel} type="button">Leave waiting room</button>
      </section>
    </main>
  );
}

export function App() {
  const accountCsrfTokenRef = useRef("");
  const runtime = useMemo(() => createWebRuntime({
    getCsrfToken: () => accountCsrfTokenRef.current,
  }), []);
  const account = useAccount({ enabled: runtime.mode === "cloud" });
  accountCsrfTokenRef.current = account.snapshot.csrfToken ?? "";
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialRoomRequested = Boolean(query.get("room") ?? runtime.initialRoom?.roomId);
  const [initialRoomEntryPending, setInitialRoomEntryPending] = useState(initialRoomRequested);
  const [surface, setSurface] = useState<"booking" | "home">("home");
  const [publicPage, setPublicPage] = useState<PublicAppPage>(() => (
    publicAppPageFromPath(window.location.pathname)
  ));
  const [accountOpen, setAccountOpen] = useState(false);
  const previousRecordingActiveRef = useRef(false);
  const [access, setAccess] = useState<RoomAccess | null>(null);
  const [importedRoom, setImportedRoom] = useState<ImportedVdoRoom | null>(null);
  const [recordingActive, setRecordingActive] = useState(false);
  const [hostToken, setHostToken] = useState("");
  const [guestInvitePath, setGuestInvitePath] = useState<string | null>(null);
  const [admissionGate, setAdmissionGate] = useState<AdmissionGateState | null>(null);
  const [departedRoom, setDepartedRoom] = useState<DepartedRoom | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<"booking" | "home" | null>(null);
  const [busy, setBusy] = useState(initialRoomRequested);
  const [error, setError] = useTransientMessage();

  const initialRoomEntryStarted = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      const locationQuery = new URLSearchParams(window.location.search);
      if (!locationQuery.has("room")) {
        setPublicPage(publicAppPageFromPath(window.location.pathname));
        setSurface("home");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const roomTitle = access?.room.title ?? importedRoom?.roomName;
    document.title = roomTitle
      ? `${roomTitle} | Porchcast`
      : publicPage === "pricing"
        ? "Pricing | Porchcast"
        : publicPage === "privacy"
          ? "Privacy | Porchcast"
          : "Porchcast";
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description && !roomTitle) {
      description.content = publicPage === "pricing"
        ? "Compare Porchcast plans for room capacity, guest seats, and Cloud recording history."
        : publicPage === "privacy"
          ? "Learn how Porchcast handles participant consent, live media, Cloud recordings, account data, retention, and downloads."
          : "Record remote podcasts in the Cloud with host-controlled rooms, secure sources, and Desktop and Mobile views.";
    }
  }, [access?.room.title, importedRoom?.roomName, publicPage]);

  function navigatePublicPage(page: PublicAppPage, search = "") {
    const target = runtime.publicPagePath(page, search);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== target) {
      window.history.pushState({}, "", target);
    }
    setPublicPage(page);
    setSurface("home");
  }

  function openBooking() {
    preloadSurface(loadBookingView);
    navigatePublicPage("home");
    setSurface("booking");
  }

  async function enterRoom(roomId: string, token?: string) {
    preloadSurface(runtime.mode === "demo" ? loadDemoStudio : loadCloudStudio);
    setBusy(true);
    setError(null);
    try {
      const admissionToken = sessionStorage.getItem(participantTokenKey(roomId))
        ?? crypto.randomUUID();
      const invitationToken = sessionStorage.getItem(guestTokenKey(roomId))
        ?? token;
      const entry = await runtime.backend.enterRoom({
        roomId,
        roomToken: token,
        invitationToken,
        admissionToken,
        displayName: account.snapshot.account?.displayName ?? undefined,
      });
      if (entry.kind === "invitation-inactive") {
        const invitationToken = sessionStorage.getItem(guestTokenKey(roomId));
        if (invitationToken && invitationToken !== token) {
          sessionStorage.removeItem(participantTokenKey(roomId));
          sessionStorage.removeItem(participantAdmissionIdKey(roomId));
          await enterRoom(roomId, invitationToken);
          return;
        }
        throw new Error("This room invitation is no longer active.");
      }
      if (entry.kind === "admission") {
        if (entry.admission) {
          sessionStorage.setItem(participantTokenKey(roomId), entry.admissionToken);
          sessionStorage.setItem(participantAdmissionIdKey(roomId), entry.admission.id);
        }
        setAdmissionGate({
          roomId: entry.roomId,
          roomTitle: entry.roomTitle,
          mode: entry.mode,
          invitationToken: entry.invitationToken,
          admissionToken: entry.admissionToken,
          admission: entry.admission,
        });
        return;
      }
      const nextAccess = entry.access;
      const activeToken = nextAccess.participantToken ?? token ?? "";
      if (nextAccess.participantToken) {
        sessionStorage.setItem(participantTokenKey(roomId), nextAccess.participantToken);
        if (nextAccess.admissionId) {
          sessionStorage.setItem(participantAdmissionIdKey(roomId), nextAccess.admissionId);
        }
      }
      setAdmissionGate(null);
      setDepartedRoom(null);
      setPublicPage("home");
      setHostToken(activeToken);
      setAccess(nextAccess);
      setGuestInvitePath(nextAccess.role === "host"
        ? localStorage.getItem(roomInviteKey(roomId))
        : null);
      window.history.replaceState({}, "", runtime.roomPath(roomId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This room could not be opened.");
    } finally {
      setInitialRoomEntryPending(false);
      setBusy(false);
    }
  }

  useEffect(() => {
    const roomId = query.get("room") ?? runtime.initialRoom?.roomId;
    const invitation = query.get("invite");
    if (!roomId || initialRoomEntryStarted.current) return;

    if (invitation) sessionStorage.setItem(guestTokenKey(roomId), invitation);
    if (runtime.mode === "cloud" && account.status === "checking") return;
    const token = sessionStorage.getItem(participantTokenKey(roomId))
      ?? invitation
      ?? sessionStorage.getItem(guestTokenKey(roomId))
      ?? localStorage.getItem(roomTokenKey(roomId));
    initialRoomEntryStarted.current = true;
    void enterRoom(roomId, token ?? runtime.initialRoom?.roomToken ?? undefined);
  }, [account.status, query, runtime]);

  async function bookRoom(input: BookRoomInput) {
    setBusy(true);
    setError(null);
    try {
      const nextBooking = await runtime.backend.bookRoom(input);
      localStorage.setItem(roomTokenKey(nextBooking.room.id), nextBooking.hostToken);
      localStorage.setItem(roomInviteKey(nextBooking.room.id), nextBooking.guestInvitePath);
      setHostToken(nextBooking.hostToken);
      setGuestInvitePath(nextBooking.guestInvitePath);
      setSurface("home");
      await enterRoom(nextBooking.room.id, nextBooking.hostToken);
      if (account.snapshot.account) void account.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The room could not be booked.");
    } finally {
      setBusy(false);
    }
  }

  function updateRoom(room: Room) {
    setAccess((current) => current ? { ...current, room } : current);
  }

  function savedRoomEntryToken(roomId: string): string | undefined {
    return sessionStorage.getItem(participantTokenKey(roomId))
      ?? sessionStorage.getItem(guestTokenKey(roomId))
      ?? localStorage.getItem(roomTokenKey(roomId))
      ?? undefined;
  }

  async function reissueGuestInvitation(): Promise<string> {
    if (!access || access.role !== "host") {
      throw new Error("Only the room host can create a guest invitation.");
    }
    const path = await account.reissueRoomInvitation(access.room.id);
    localStorage.setItem(roomInviteKey(access.room.id), path);
    setGuestInvitePath(path);
    return path;
  }

  function resetRoom(nextSurface: "booking" | "home") {
    setAccess(null);
    setImportedRoom(null);
    setRecordingActive(false);
    setHostToken("");
    setGuestInvitePath(null);
    setAdmissionGate(null);
    setDepartedRoom(null);
    setError(null);
    setPublicPage("home");
    setSurface(nextSurface);
    window.history.replaceState({}, "", runtime.publicPagePath("home"));
  }

  function requestNavigation(nextSurface: "booking" | "home") {
    if (departedRoom) {
      resetRoom(nextSurface);
      return;
    }
    if (access || importedRoom) {
      setPendingNavigation(nextSurface);
      return;
    }
    if (nextSurface === "booking") openBooking();
    else navigatePublicPage("home");
  }

  const headerMode = access || importedRoom || departedRoom
    ? "room"
    : "home";
  const currentRoomSaved = Boolean(
    access && account.rooms.some((entry) => entry.room.id === access.room.id),
  );
  const roomSaveState = roomSaveControlState({
    busy: account.busy === "claim",
    hasRoom: Boolean(access),
    isHost: access?.role === "host",
    limitReached: false,
    saved: currentRoomSaved,
    signedIn: Boolean(account.snapshot.account),
  });

  async function saveCurrentRoom() {
    if (!access || access.role !== "host") return;
    if (!account.snapshot.account) {
      openAccount();
      return;
    }
    if (!hostToken || !await account.claimRoom(access.room.id, hostToken)) {
      openAccount();
    }
  }

  async function leaveActiveRoom() {
    const leavingRoom = access
      ? { id: access.room.id, title: access.room.title }
      : null;
    if (access?.role === "guest" && access.admissionId) {
      try {
        await runtime.backend.leaveRoom({
          roomId: access.room.id,
          admissionId: access.admissionId,
          roomToken: hostToken,
        });
      } catch {
        // Local Hang Up remains available; the server lease still expires safely.
      } finally {
        sessionStorage.removeItem(participantTokenKey(access.room.id));
        sessionStorage.removeItem(participantAdmissionIdKey(access.room.id));
      }
    }
    setAccess(null);
    setImportedRoom(null);
    setRecordingActive(false);
    setHostToken("");
    setGuestInvitePath(null);
    setAdmissionGate(null);
    setError(null);
    setSurface("home");
    if (leavingRoom) {
      setDepartedRoom(leavingRoom);
      window.history.replaceState({}, "", runtime.roomPath(leavingRoom.id));
    } else {
      setDepartedRoom(null);
      window.history.replaceState({}, "", runtime.publicPagePath("home"));
    }
  }

  function openAccount() {
    preloadSurface(loadAccountDialog);
    setAccountOpen(true);
    if (account.snapshot.account) void account.refresh();
  }

  useEffect(() => {
    if (
      previousRecordingActiveRef.current
      && !recordingActive
      && account.snapshot.account
    ) void account.refresh();
    previousRecordingActiveRef.current = recordingActive;
  }, [account.refresh, account.snapshot.account, recordingActive]);

  return (
    <div className="app-shell">
      <AppHeader
        account={account}
        mode={headerMode}
        onAccount={openAccount}
        onBookRoom={() => requestNavigation("booking")}
        onHome={() => requestNavigation("home")}
        onPublicPage={navigatePublicPage}
        onSaveRoom={() => void saveCurrentRoom()}
        publicPath={runtime.publicPagePath}
        publicPage={publicPage}
        roomSaveState={roomSaveState}
        roomTitle={access?.room.title ?? importedRoom?.roomName ?? departedRoom?.title}
      />
      {error ? (
        <div className="global-error" role="alert">
          <span>STUDIO NOTICE</span><p>{error}</p><button onClick={() => setError(null)}>×</button>
        </div>
      ) : null}
      <Suspense fallback={<SurfaceLoading label="Opening Porchcast…" />}>
        {runtime.mode === "demo" && runtime.demoScenario && access ? (
          <DemoStudioView
            access={access}
            onLeave={() => void leaveActiveRoom()}
            onRecordingChange={setRecordingActive}
            scenario={runtime.demoScenario}
          />
        ) : access || importedRoom ? (
          <CloudStudioView
            accountCsrfToken={account.snapshot.csrfToken ?? ""}
            accountRecordingAllowance={account.recordingLibrary?.allowance ?? null}
            access={access}
            canReissueInvitation={Boolean(account.snapshot.account && access?.role === "host")}
            guestInvitePath={guestInvitePath}
            invitationBusy={account.busy === "invite"}
            importedRoom={importedRoom}
            signedIn={Boolean(account.snapshot.account)}
            onLeaveRoom={leaveActiveRoom}
            onRecordingChange={setRecordingActive}
            onRecordingQuotaRequired={openAccount}
            onReissueInvitation={reissueGuestInvitation}
            onRoomUpdate={updateRoom}
            onSignInRequired={openAccount}
            roomToken={hostToken}
          />
        ) : departedRoom ? (
          <RoomExitView
            busy={busy}
            onHome={() => resetRoom("home")}
            onRejoin={() => void enterRoom(
              departedRoom.id,
              savedRoomEntryToken(departedRoom.id),
            )}
            room={departedRoom}
          />
        ) : admissionGate ? (
          <AdmissionGate
            account={account}
            backend={runtime.backend}
            gate={admissionGate}
            onAdmitted={(token) => void enterRoom(admissionGate.roomId, token)}
            onCancel={() => {
              sessionStorage.removeItem(participantTokenKey(admissionGate.roomId));
              sessionStorage.removeItem(participantAdmissionIdKey(admissionGate.roomId));
              resetRoom("home");
            }}
            onChange={setAdmissionGate}
          />
        ) : initialRoomEntryPending ? (
          <SurfaceLoading label="Opening room…" />
        ) : (
          <PublicSite
            account={account}
            onBook={openBooking}
            onNavigate={navigatePublicPage}
            page={publicPage}
            publicPath={runtime.publicPagePath}
          />
        )}
      </Suspense>
      {!access && !importedRoom && !departedRoom && surface === "booking" ? (
        <Suspense fallback={<DialogLoading label="Opening room booking…" />}>
          <BookingView
            accountStorage={{
              guestSeatLimit: account.snapshot.capabilities.guestSeatLimit,
              signedIn: Boolean(account.snapshot.account),
            }}
            busy={busy}
            onBook={bookRoom}
            onClose={() => setSurface("home")}
            onPremium={() => navigatePublicPage("pricing", pricingQuery("guest_seats"))}
          />
        </Suspense>
      ) : null}
      {pendingNavigation ? <div className="confirmation-backdrop">
        <section aria-labelledby="leave-room-title" aria-modal="true" className="confirmation-modal" role="dialog">
          <span className="confirmation-icon" aria-hidden="true">!</span>
          <h2 id="leave-room-title">Leave this room?</h2>
          <p>{recordingActive
            ? "Cloud recording is active. Stop & save before leaving so the recording can finalize safely."
            : pendingNavigation === "booking"
              ? "This room view will close when you start booking a new room. Are you sure you want to continue?"
              : "This room view will close and you’ll return to the Porchcast home page."}</p>
          <div><button onClick={() => setPendingNavigation(null)} type="button">Stay here</button><button className="danger-action" disabled={recordingActive} onClick={() => {
            const target = pendingNavigation;
            setPendingNavigation(null);
            resetRoom(target);
          }} type="button">{recordingActive ? "Stop recording first" : pendingNavigation === "booking" ? "Book a new room" : "Leave room"}</button></div>
        </section>
      </div> : null}
      {accountOpen ? <Suspense fallback={<DialogLoading label="Opening your account…" />}><AccountDialog
        currentRoom={access?.role === "host" ? access.room : null}
        hostToken={hostToken}
        model={account}
        onClose={() => setAccountOpen(false)}
        onRoomDeleted={(roomId) => {
          localStorage.removeItem(roomTokenKey(roomId));
          localStorage.removeItem(roomInviteKey(roomId));
          sessionStorage.removeItem(guestTokenKey(roomId));
          sessionStorage.removeItem(participantTokenKey(roomId));
          sessionStorage.removeItem(participantAdmissionIdKey(roomId));
          if (access?.room.id === roomId) {
            setAccountOpen(false);
            resetRoom("home");
          } else if (departedRoom?.id === roomId) {
            setAccountOpen(false);
            resetRoom("home");
          }
        }}
        onRoomUpdated={(room) => {
          if (access?.room.id === room.id) updateRoom(room);
        }}
        onOpenRoom={(roomId) => {
          if (recordingActive) {
            setError("Stop and save the current recording before opening another room.");
            return;
          }
          setAccountOpen(false);
          setAccess(null);
          setImportedRoom(null);
          setDepartedRoom(null);
          setHostToken("");
          setGuestInvitePath(null);
          void enterRoom(roomId, savedRoomEntryToken(roomId));
        }}
        open
      /></Suspense> : null}
      <PwaStatus
        reloadSafe={Boolean(
          !access
          && !importedRoom
          && !admissionGate
          && !departedRoom
          && !initialRoomEntryPending
          && !recordingActive
          && !busy
          && surface === "home"
        )}
        roomHeaderSelector={access && runtime.mode === "demo"
          ? ".demo-studio__header"
          : access || importedRoom ? ".studio-header" : undefined}
      />
    </div>
  );
}
