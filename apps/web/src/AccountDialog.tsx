import { useEffect, useRef, useState } from "react";

import type {
  AccountRoomSummary,
  RecorderLayout,
  Room,
  UpdateAccountRoomRequest,
} from "@wiplash/podcast-contracts";

import type { AccountModel } from "./use-account";
import { pricingQuery } from "./plan-catalog";
import { appPagePath, appPath } from "./public-path";
import { recordingViewLabel } from "./studio-controls";

function AccountIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4.5 21c.8-5 3.3-7 7.5-7s6.7 2 7.5 7" /></svg>;
}

function EditIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 20 4.2-1 10.4-10.4a2.1 2.1 0 0 0-3-3L5.2 16Z" /><path d="m14.5 6.7 2.8 2.8" /></svg>;
}

function TrashIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7" /><path d="M10 11v5m4-5v5" /></svg>;
}

function formatExpiry(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Duration pending";
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

function formatHours(seconds: number): string {
  const hours = seconds / 3_600;
  return Number.isInteger(hours) ? `${hours} hr` : `${hours.toFixed(1)} hr`;
}

const accountPlanLabels = {
  creator: "PORCHCASTER ACCOUNT",
  free: "FREE ACCOUNT",
  internal: "INTERNAL ACCOUNT",
  professional: "SHOWRUNNER ACCOUNT",
  studio: "STUDIO ACCOUNT",
} as const;

const subscriptionPlanLabels = {
  creator: "Porchcaster",
  professional: "Showrunner",
  studio: "Studio",
} as const;

const accountGuestSeatOptions = [
  { value: 0, label: "Solo", detail: "Just you" },
  { value: 1, label: "One guest", detail: "Two total" },
  { value: 2, label: "Two guests", detail: "Three total" },
  { value: 3, label: "Three guests", detail: "Four total" },
  { value: 4, label: "Four guests", detail: "Five total" },
  { value: 8, label: "Eight guests", detail: "Nine total · Showrunner" },
  { value: 12, label: "Twelve guests", detail: "Thirteen total · Studio" },
] as const;

export function AccountDialog({
  currentRoom,
  hostToken,
  model,
  onClose,
  onRoomDeleted,
  onRoomUpdated,
  onOpenRoom,
  open,
}: {
  currentRoom: Room | null;
  hostToken: string;
  model: AccountModel;
  onClose: () => void;
  onRoomDeleted: (roomId: string) => void;
  onRoomUpdated: (room: Room) => void;
  onOpenRoom: (roomId: string) => void;
  open: boolean;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [draft, setDraft] = useState<UpdateAccountRoomRequest | null>(null);
  const account = model.snapshot.account;
  const allowance = model.recordingLibrary?.allowance ?? null;
  const currentSaved = Boolean(
    currentRoom && model.rooms.some((entry) => entry.room.id === currentRoom.id),
  );
  const editingRoom = model.rooms.find((entry) => entry.room.id === editingRoomId) ?? null;
  const deletingRoom = model.rooms.find((entry) => entry.room.id === deletingRoomId) ?? null;

  function startEditing(entry: AccountRoomSummary) {
    setDeletingRoomId(null);
    setEditingRoomId(entry.room.id);
    setDraft({
      title: entry.room.title,
      hostName: entry.room.hostName,
      settings: {
        ...entry.room.settings,
        maxGuests: Math.min(
          entry.room.settings.maxGuests,
          model.snapshot.capabilities.guestSeatLimit,
        ),
      },
    });
  }

  function closeRoomAction() {
    setEditingRoomId(null);
    setDeletingRoomId(null);
    setDraft(null);
  }

  async function saveRoomEdit() {
    if (!editingRoom || !draft || !draft.title.trim() || !draft.hostName.trim()) return;
    const updated = await model.updateRoom(editingRoom.room.id, {
      ...draft,
      title: draft.title.trim(),
      hostName: draft.hostName.trim(),
    });
    if (!updated) return;
    onRoomUpdated(updated.room);
    closeRoomAction();
  }

  async function deleteSavedRoom() {
    if (!deletingRoom || !await model.deleteRoom(deletingRoom.room.id)) return;
    onRoomDeleted(deletingRoom.room.id);
    closeRoomAction();
  }

  function toggleLayout(layout: RecorderLayout) {
    if (!draft) return;
    const selected = draft.settings.requestedLayouts.includes(layout);
    if (selected && draft.settings.requestedLayouts.length === 1) return;
    setDraft({
      ...draft,
      settings: {
        ...draft.settings,
        requestedLayouts: selected
          ? draft.settings.requestedLayouts.filter((item) => item !== layout)
          : [...draft.settings.requestedLayouts, layout],
      },
    });
  }

  useEffect(() => {
    if (!open) {
      setEditingRoomId(null);
      setDeletingRoomId(null);
      setDraft(null);
      return;
    }
    const frame = requestAnimationFrame(() => closeButton.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !model.busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [model.busy, onClose, open]);

  if (!open) return null;
  return (
    <div className="account-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !model.busy) onClose();
    }}>
      <section aria-labelledby="account-dialog-title" aria-modal="true" className="account-dialog" role="dialog">
        <header>
          <div className="account-brand"><span className="account-brand-mark"><img alt="" src={`${appPath()}porchcast-mark.svg`} /></span><div><strong>Porchcast</strong><small>One Wiplash identity, every app</small></div></div>
          <button aria-label="Close account" disabled={Boolean(model.busy)} onClick={onClose} ref={closeButton} type="button">×</button>
        </header>

        {account ? <>
          <div className="account-profile">
            <span><AccountIcon /></span>
            <div><small>{allowance ? accountPlanLabels[allowance.plan] : "WIPLASH ACCOUNT"}</small><h2 id="account-dialog-title">{account.displayName}</h2><p>{account.email}</p></div>
          </div>
          <div className={`account-recording-allowance ${allowance?.plan ?? "loading"}`}>
            <div><span>CLOUD RECORDING</span><strong>{allowance?.plan === "internal" || allowance?.plan === "studio"
              ? "Unlimited"
              : allowance
                ? `${formatHours(allowance.remainingSeconds ?? 0)} left`
                : "Loading…"}</strong></div>
            {allowance?.includedSeconds !== null && allowance?.resetsAt ? <>
              <span className="account-usage-track"><i style={{ width: `${Math.min(100, allowance.usedSeconds / allowance.includedSeconds! * 100)}%` }} /></span>
              <p>{formatHours(allowance.usedSeconds)} used of {formatHours(allowance.includedSeconds!)} this month · resets {formatExpiry(allowance.resetsAt!)}</p>
            </> : <p>{allowance ? "Recording time is not metered on this plan. Existing recordings are unchanged." : "Checking your recording allowance…"}</p>}
          </div>
          <div className="account-retention-note"><strong>Seven-day Cloud history</strong><span>Your rooms are reusable metadata. Recording time—not room count—is the Free plan allowance.</span></div>
          {model.billing?.plan === "internal" && !model.billing.subscriptionPlan ? (
            <p className="account-billing-summary"><strong>Admin Studio access</strong><span>No paid subscription is required for this account.</span></p>
          ) : model.billing?.subscriptionPlan ? (
            <p className={`account-billing-summary ${model.billing.mode === "test" ? "test" : ""}`}><strong>{subscriptionPlanLabels[model.billing.subscriptionPlan]} subscription</strong><span>{model.billing.mode === "test" ? "Stripe test mode · no real payment" : "Managed securely in Stripe"}</span></p>
          ) : null}
          {model.billing?.portalAvailable ? <button className="account-plan-link" disabled={Boolean(model.busy)} onClick={() => void model.manageBilling()} type="button"><span>{model.busy === "portal" ? "Opening secure billing…" : "Manage subscription and payment method"}</span><span aria-hidden="true">→</span></button> : <a className="account-plan-link" href={`${appPagePath("pricing")}${pricingQuery(allowance?.plan === "free" && allowance.remainingSeconds === 0 ? "recording_hours" : "account_plan")}`} rel="noreferrer" target="_blank"><span>{allowance?.plan === "free" && allowance.remainingSeconds === 0 ? "Compare plans for more recording time" : "Compare Porchcast plans"}</span><span aria-hidden="true">→</span></a>}
          {currentRoom && !currentSaved && hostToken ? (
            <button className="save-current-room" disabled={Boolean(model.busy)} onClick={() => void model.claimRoom(currentRoom.id, hostToken)} type="button">
              <span><strong>Save this room</strong><small>Add “{currentRoom.title}” to your reusable rooms.</small></span><i>{model.busy === "claim" ? "Saving…" : "+"}</i>
            </button>
          ) : currentRoom && currentSaved ? <p className="room-saved-state"><i /> This room is saved to your account.</p> : null}
          <section className="account-recording-library" aria-label="Your Porchcast recordings">
            <div className="account-library-heading"><span>YOUR RECORDINGS</span><strong>{model.recordingLibrary?.recordings.length ?? 0}</strong></div>
            {model.recordingLibrary?.recordings.length ? <ul>{model.recordingLibrary.recordings.map((entry) => (
              <li key={entry.recording.id}>
                <button onClick={() => onOpenRoom(entry.recording.roomId)} type="button">
                  <span><strong>{entry.recording.name}</strong><small>{entry.roomTitle} · {formatDuration(entry.durationSeconds)}</small></span>
                  <span><small>{entry.recording.lifecycleState.replace("_", " ")}</small><i aria-hidden="true">→</i></span>
                </button>
              </li>
            ))}</ul> : model.recordingLibrary ? <div className="account-recordings-empty"><strong>No recordings yet</strong><span>Your Cloud recordings will appear here after you press Record.</span></div> : <div className="account-recordings-empty"><strong>Loading recordings…</strong></div>}
          </section>
          <section className="account-room-library" aria-label="Your Porchcast rooms">
            <div><span>REUSABLE ROOMS</span><strong>{model.rooms.length}</strong></div>
            {editingRoom && draft ? <div className="account-room-editor">
              <div className="account-room-editor-heading"><span><small>ROOM SETTINGS</small><strong>Edit saved room</strong></span><button disabled={Boolean(model.busy)} onClick={closeRoomAction} type="button">Cancel</button></div>
              <label><span>Room name</span><input maxLength={120} onChange={(event) => setDraft({ ...draft, title: event.target.value })} value={draft.title} /></label>
              <label><span>Your display name</span><input maxLength={80} onChange={(event) => setDraft({ ...draft, hostName: event.target.value })} value={draft.hostName} /></label>
              <fieldset><legend>Guest seats</legend><div className="account-setting-options guest-capacity">{accountGuestSeatOptions.map((option) => <button className={draft.settings.maxGuests === option.value ? "selected" : ""} disabled={option.value > model.snapshot.capabilities.guestSeatLimit} key={option.value} onClick={() => setDraft({ ...draft, settings: { ...draft.settings, maxGuests: option.value } })} type="button"><strong>{option.label}</strong><small>{option.detail}{option.value > model.snapshot.capabilities.guestSeatLimit ? " · upgrade" : ""}</small></button>)}</div></fieldset>
              {draft.settings.maxGuests > 0 ? <fieldset><legend>Who can join</legend><div className="account-setting-options three"><button className={draft.settings.admissionMode === "invite_link" ? "selected" : ""} onClick={() => setDraft({ ...draft, settings: { ...draft.settings, admissionMode: "invite_link" } })} type="button">Invite link</button><button className={draft.settings.admissionMode === "verified_wiplash" ? "selected" : ""} onClick={() => setDraft({ ...draft, settings: { ...draft.settings, admissionMode: "verified_wiplash" } })} type="button">Verified</button><button className={draft.settings.admissionMode === "host_approval" ? "selected" : ""} onClick={() => setDraft({ ...draft, settings: { ...draft.settings, admissionMode: "host_approval" } })} type="button">Host admits</button></div></fieldset> : null}
              <fieldset><legend>Camera quality</legend><div className="account-setting-options three"><button className={draft.settings.videoPreset === "data_saver" ? "selected" : ""} onClick={() => setDraft({ ...draft, settings: { ...draft.settings, videoPreset: "data_saver" } })} type="button">Basic</button><button className={draft.settings.videoPreset === "balanced" ? "selected" : ""} onClick={() => setDraft({ ...draft, settings: { ...draft.settings, videoPreset: "balanced" } })} type="button">Balanced</button><button className={draft.settings.videoPreset === "high_fidelity" ? "selected" : ""} onClick={() => setDraft({ ...draft, settings: { ...draft.settings, videoPreset: "high_fidelity" } })} type="button">Studio</button></div></fieldset>
              <div className="account-setting-pair"><fieldset><legend>Audio</legend><div className="account-setting-options two"><button className={draft.settings.audioPreset === "voice" ? "selected" : ""} onClick={() => setDraft({ ...draft, settings: { ...draft.settings, audioPreset: "voice" } })} type="button">Conversation</button><button className={draft.settings.audioPreset === "studio" ? "selected" : ""} onClick={() => setDraft({ ...draft, settings: { ...draft.settings, audioPreset: "studio" } })} type="button">Original</button></div></fieldset><fieldset><legend>Screen share</legend><div className="account-setting-options two"><button className={draft.settings.screenSharePreset === "balanced" ? "selected" : ""} onClick={() => setDraft({ ...draft, settings: { ...draft.settings, screenSharePreset: "balanced" } })} type="button">Standard</button><button className={draft.settings.screenSharePreset === "detail" ? "selected" : ""} onClick={() => setDraft({ ...draft, settings: { ...draft.settings, screenSharePreset: "detail" } })} type="button">Detail</button></div></fieldset></div>
              <fieldset><legend>Recording views</legend><div className="account-setting-options two"><button aria-pressed={draft.settings.requestedLayouts.includes("horizontal")} className={draft.settings.requestedLayouts.includes("horizontal") ? "selected" : ""} onClick={() => toggleLayout("horizontal")} type="button">{recordingViewLabel("horizontal")}</button><button aria-pressed={draft.settings.requestedLayouts.includes("vertical")} className={draft.settings.requestedLayouts.includes("vertical") ? "selected" : ""} onClick={() => toggleLayout("vertical")} type="button">{recordingViewLabel("vertical")}</button></div></fieldset>
              <button className="account-room-save-edit" disabled={Boolean(model.busy) || !draft.title.trim() || !draft.hostName.trim()} onClick={() => void saveRoomEdit()} type="button">{model.busy === "update" ? "Saving changes…" : "Save changes"}</button>
            </div> : deletingRoom ? <div className="account-room-delete-confirm">
              <span className="confirmation-icon" aria-hidden="true">!</span><strong>Delete “{deletingRoom.room.title}”?</strong><p>The room disappears from your account, its existing links stop working, and retained Cloud media moves to the 24-hour cleanup schedule. This can’t be undone.</p><div><button disabled={Boolean(model.busy)} onClick={closeRoomAction} type="button">Keep room</button><button className="account-room-delete-action" disabled={Boolean(model.busy)} onClick={() => void deleteSavedRoom()} type="button">{model.busy === "delete" ? "Deleting…" : "Delete room"}</button></div>
            </div> : model.rooms.length ? <ul>{model.rooms.map((entry) => (
              <li key={entry.room.id}>
                <button className="account-room-open" onClick={() => onOpenRoom(entry.room.id)} type="button">
                  <span><strong>{entry.room.title}</strong><small>{entry.mediaDeletedAt
                    ? `media expired ${formatExpiry(entry.mediaDeletedAt)}`
                    : `${entry.room.lifecycleState.replace("_", " ")} · Media until ${formatExpiry(entry.mediaExpiresAt)}`}</small></span>
                  <i aria-hidden="true">→</i>
                </button>
                <div className="account-room-actions"><button aria-label={`Edit ${entry.room.title}`} data-tooltip="Edit room" disabled={Boolean(model.busy)} onClick={() => startEditing(entry)} type="button"><EditIcon /></button><button aria-label={`Delete ${entry.room.title}`} data-tooltip="Delete room" disabled={Boolean(model.busy)} onClick={() => { setEditingRoomId(null); setDeletingRoomId(entry.room.id); }} type="button"><TrashIcon /></button></div>
              </li>
            ))}</ul> : <div className="account-rooms-empty"><strong>No saved rooms yet</strong><span>Book while signed in, or save a room you already host.</span></div>}
          </section>
          {model.error ? <button className="account-error" onClick={model.clearError} type="button">{model.error}<small>Dismiss</small></button> : null}
          <footer><button onClick={onClose} type="button">Return to studio</button><button className="account-signout" disabled={Boolean(model.busy)} onClick={() => void model.signOut()} type="button">{model.busy === "sign-out" ? "Signing out…" : "Sign out"}</button></footer>
        </> : <>
          <div className="account-welcome">
            <span><AccountIcon /></span>
            <h2 id="account-dialog-title">Your podcasts, one sign-in away.</h2>
            <p>Continue through Wiplash.ai. Use your existing Wiplash session, Google, or GitHub—without creating another password here.</p>
          </div>
          <button className="wiplash-signin" disabled={model.status !== "available" || !model.snapshot.capabilities.signInAvailable || Boolean(model.busy)} onClick={() => void model.signIn()} type="button">
            <i aria-hidden="true">W</i><span><strong>Continue with Wiplash.ai</strong><small>Returns to this room · your camera and microphone choices are remembered</small></span><b aria-hidden="true">→</b>
          </button>
          <div className={`account-service-state ${model.status}`} role="status"><i /><span>{model.status === "checking" ? "Checking secure sign-in…" : model.snapshot.capabilities.signInAvailable ? "Wiplash sign-in is ready" : "Sign-in is not configured on this deployment yet"}</span>{model.status === "unavailable" ? <button onClick={() => void model.refresh()} type="button">Retry</button> : null}</div>
          {model.error ? <button className="account-error" onClick={model.clearError} type="button">{model.error}<small>Dismiss</small></button> : null}
          <button className="account-continue-anonymous" onClick={onClose} type="button">Continue without an account · downloads remain available for 24 hours</button>
        </>}
      </section>
    </div>
  );
}
