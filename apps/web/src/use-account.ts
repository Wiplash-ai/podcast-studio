import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AccountBillingSnapshot,
  AccountRecordingLibrary,
  AccountRoomSummary,
  AccountSnapshot,
  PaidAccountPlan,
  UpdateAccountRoomRequest,
} from "@wiplash/podcast-contracts";

import {
  accountReturnUrl,
  createAccountClient,
  EMPTY_ACCOUNT_SNAPSHOT,
  rememberAccountSignInRedirect,
} from "./account";

export interface AccountModel {
  snapshot: AccountSnapshot;
  rooms: AccountRoomSummary[];
  recordingLibrary: AccountRecordingLibrary | null;
  billing: AccountBillingSnapshot | null;
  status: "checking" | "available" | "unavailable";
  busy: "checkout" | "claim" | "delete" | "invite" | "plan-change" | "portal" | "sign-in" | "sign-out" | "update" | null;
  error: string;
  refresh(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  subscribe(plan: PaidAccountPlan): Promise<void>;
  changePlan(plan: PaidAccountPlan): Promise<void>;
  manageBilling(): Promise<void>;
  claimRoom(roomId: string, hostToken: string): Promise<boolean>;
  updateRoom(roomId: string, input: UpdateAccountRoomRequest): Promise<AccountRoomSummary | null>;
  deleteRoom(roomId: string): Promise<boolean>;
  reissueRoomInvitation(roomId: string): Promise<string>;
  clearError(): void;
}

export function useAccount(): AccountModel {
  const client = useMemo(() => createAccountClient(), []);
  const [snapshot, setSnapshot] = useState<AccountSnapshot>(EMPTY_ACCOUNT_SNAPSHOT);
  const [rooms, setRooms] = useState<AccountRoomSummary[]>([]);
  const [recordingLibrary, setRecordingLibrary] = useState<AccountRecordingLibrary | null>(null);
  const [billing, setBilling] = useState<AccountBillingSnapshot | null>(null);
  const [status, setStatus] = useState<AccountModel["status"]>("checking");
  const [busy, setBusy] = useState<AccountModel["busy"]>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setStatus("checking");
    try {
      const next = await client.getSnapshot();
      setSnapshot(next);
      if (next.account) {
        const [nextRooms, nextRecordings, nextBilling] = await Promise.all([
          client.listRooms(),
          client.listRecordings().catch(() => null),
          client.getBilling().catch(() => null),
        ]);
        setRooms(nextRooms);
        setRecordingLibrary(nextRecordings);
        setBilling(nextBilling);
      } else {
        setRooms([]);
        setRecordingLibrary(null);
        setBilling(null);
      }
      setStatus("available");
      setError("");
    } catch {
      setSnapshot(EMPTY_ACCOUNT_SNAPSHOT);
      setRooms([]);
      setRecordingLibrary(null);
      setBilling(null);
      setStatus("unavailable");
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async () => {
    setBusy("sign-in");
    setError("");
    try {
      const returnUrl = accountReturnUrl(window.location.href);
      const authorizationUrl = await client.startSignIn(returnUrl);
      rememberAccountSignInRedirect(window.sessionStorage, returnUrl);
      window.location.assign(authorizationUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in could not be started.");
    } finally {
      setBusy(null);
    }
  }, [client]);

  const signOut = useCallback(async () => {
    setBusy("sign-out");
    setError("");
    try {
      const result = await client.signOut(accountReturnUrl(window.location.href));
      setSnapshot(result.snapshot);
      setRooms([]);
      setRecordingLibrary(null);
      setBilling(null);
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-out could not be completed.");
    } finally {
      setBusy(null);
    }
  }, [client]);

  const subscribe = useCallback(async (plan: PaidAccountPlan) => {
    setBusy("checkout");
    setError("");
    try {
      window.location.assign(await client.startCheckout(plan));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Secure checkout could not be started.");
    } finally {
      setBusy(null);
    }
  }, [client]);

  const manageBilling = useCallback(async () => {
    setBusy("portal");
    setError("");
    try {
      window.location.assign(await client.openBillingPortal());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Billing settings could not be opened.");
    } finally {
      setBusy(null);
    }
  }, [client]);

  const changePlan = useCallback(async (plan: PaidAccountPlan) => {
    setBusy("plan-change");
    setError("");
    try {
      window.location.assign(await client.startPlanChange(plan));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The plan change could not be started.");
    } finally {
      setBusy(null);
    }
  }, [client]);

  const claimRoom = useCallback(async (roomId: string, hostToken: string) => {
    setBusy("claim");
    setError("");
    try {
      const claimed = await client.claimRoom(roomId, hostToken);
      setRooms((current) => [claimed, ...current.filter((room) => room.room.id !== roomId)]);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This room could not be saved to your account.");
      return false;
    } finally {
      setBusy(null);
    }
  }, [client]);

  const reissueRoomInvitation = useCallback(async (roomId: string) => {
    setBusy("invite");
    setError("");
    try {
      return (await client.reissueRoomInvitation(roomId)).guestInvitePath;
    } catch (reason) {
      const message = reason instanceof Error
        ? reason.message
        : "A fresh guest invitation could not be created.";
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(null);
    }
  }, [client]);

  const updateRoom = useCallback(async (roomId: string, input: UpdateAccountRoomRequest) => {
    setBusy("update");
    setError("");
    try {
      const updated = await client.updateRoom(roomId, input);
      setRooms((current) => current.map((room) => room.room.id === roomId ? updated : room));
      return updated;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This room could not be updated.");
      return null;
    } finally {
      setBusy(null);
    }
  }, [client]);

  const deleteRoom = useCallback(async (roomId: string) => {
    setBusy("delete");
    setError("");
    try {
      await client.deleteRoom(roomId);
      setRooms((current) => current.filter((room) => room.room.id !== roomId));
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This room could not be deleted.");
      return false;
    } finally {
      setBusy(null);
    }
  }, [client]);

  return {
    snapshot,
    rooms,
    recordingLibrary,
    billing,
    status,
    busy,
    error,
    refresh,
    signIn,
    signOut,
    subscribe,
    changePlan,
    manageBilling,
    claimRoom,
    updateRoom,
    deleteRoom,
    reissueRoomInvitation,
    clearError: () => setError(""),
  };
}
