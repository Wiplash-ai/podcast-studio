// Generated browser-safe contract snapshot from the private service repository.
// Do not add worker, compositor, infrastructure, or billing-provider implementation here.

import { z } from "zod";

export const recorderLayoutSchema = z.enum(["horizontal", "vertical"]);

export type RecorderLayout = z.infer<typeof recorderLayoutSchema>;

export const programDeferredReasonSchema = z.enum([
  "timeline_not_ready",
  "media_lock_busy",
  "runtime_unavailable",
  "compositor_interrupted",
  "qa_review_pending",
  "source_evidence_incomplete",
]);

export type ProgramDeferredReason = z.infer<typeof programDeferredReasonSchema>;

export const videoPresetSchema = z.enum(["data_saver", "balanced", "high_fidelity"]);

export type VideoPreset = z.infer<typeof videoPresetSchema>;

export const audioPresetSchema = z.enum(["voice", "studio"]);

export type AudioPreset = z.infer<typeof audioPresetSchema>;

export const screenSharePresetSchema = z.enum(["balanced", "detail"]);

export type ScreenSharePreset = z.infer<typeof screenSharePresetSchema>;

export const recordingAdapterSchema = z.enum(["browser_local", "vdo_local", "server"]);

export const roomRoleSchema = z.enum(["host", "guest"]);

/** Public room-capacity tiers. The maximum includes twelve guests plus the host. */
export const FREE_ROOM_GUEST_LIMIT = 2;

export const STUDIO_ROOM_GUEST_LIMIT = 12;

export const MAX_ROOM_GUEST_LIMIT = STUDIO_ROOM_GUEST_LIMIT;

// `guest` remains valid for rooms created by the original one-guest client.
// New admitted guests use their server-issued admission UUID so every seat has
// an independent media, chat, event, and recorder identity.
export const roomParticipantIdSchema = z.union([
  z.literal("host"),
  z.literal("guest"),
  z.string().uuid(),
]);

export type RoomParticipantId = z.infer<typeof roomParticipantIdSchema>;

export const roomAdmissionModeSchema = z.enum([
  "invite_link",
  "verified_wiplash",
  "host_approval",
]);

export type RoomAdmissionMode = z.infer<typeof roomAdmissionModeSchema>;

export const roomAdmissionStatusSchema = z.enum([
  "pending",
  "admitted",
  "denied",
  "left",
  "expired",
]);

export const mediaSourceKindSchema = z.enum(["camera", "screen"]);

export const roomMediaFaultCodeSchema = z.enum([
  "connection_failed",
  "connection_recovering",
  "track_ended",
  "negotiated_media_degraded",
]);

export const appendRoomMediaEventRequestSchema = z.object({
  type: z.enum([
    "source_connected",
    "source_disconnected",
    "screen_started",
    "screen_stopped",
    "active_speaker_changed",
    "fault",
  ]),
  sourceKind: mediaSourceKindSchema.nullable().default(null),
  faultCode: roomMediaFaultCodeSchema.nullable().default(null),
}).strict().superRefine((event, context) => {
  const expectedKind = event.type === "screen_started" || event.type === "screen_stopped"
    ? "screen"
    : event.type === "active_speaker_changed"
      ? "camera"
      : null;
  if (expectedKind && event.sourceKind && event.sourceKind !== expectedKind) {
    context.addIssue({
      code: "custom",
      message: `${event.type} must use the ${expectedKind} source`,
      path: ["sourceKind"],
    });
  }
  if (
    ["source_connected", "source_disconnected", "fault"].includes(event.type)
    && !event.sourceKind
  ) {
    context.addIssue({
      code: "custom",
      message: `${event.type} requires a source kind`,
      path: ["sourceKind"],
    });
  }
  if ((event.type === "fault") !== Boolean(event.faultCode)) {
    context.addIssue({
      code: "custom",
      message: "Only a fault event may include a fault code",
      path: ["faultCode"],
    });
  }
});

export type AppendRoomMediaEventRequest = z.infer<typeof appendRoomMediaEventRequestSchema>;

export const roomChatAttachmentKindSchema = z.enum(["image", "audio", "video", "gif"]);

export const roomChatAttachmentSchema = z.object({
  id: z.string().regex(/^ca_[a-z0-9]{32}$/),
  kind: roomChatAttachmentKindSchema,
  fileName: z.string().min(1).max(160),
  mediaType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive().max(25 * 1_024 * 1_024),
  provider: z.enum(["tenor"]).nullable().default(null),
  downloadPath: z.string().regex(/^\/v1\/rooms\/[0-9a-f-]{36}\/chat-attachments\/ca_[a-z0-9]{32}$/),
});

export type RoomChatAttachment = z.infer<typeof roomChatAttachmentSchema>;

export const roomChatGifResultSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().max(200),
  previewUrl: z.string().url().startsWith("https://"),
  width: z.number().int().positive().max(4_096),
  height: z.number().int().positive().max(4_096),
});

export type RoomChatGifResult = z.infer<typeof roomChatGifResultSchema>;

export const roomChatGifSearchResponseSchema = z.object({
  results: z.array(roomChatGifResultSchema).max(12),
});

export const roomChatMessageSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  sequence: z.number().int().positive(),
  participantId: roomParticipantIdSchema,
  displayName: z.string().min(1).max(80),
  body: z.string().max(1_000),
  attachment: roomChatAttachmentSchema.nullable().default(null),
  sentAt: z.string().datetime(),
}).superRefine((message, context) => {
  if (!message.body.trim() && !message.attachment) {
    context.addIssue({
      code: "custom",
      message: "A chat message requires text or an attachment",
      path: ["body"],
    });
  }
});

export type RoomChatMessage = z.infer<typeof roomChatMessageSchema>;

export const roomChatMessageListSchema = z.object({
  messages: z.array(roomChatMessageSchema).max(2_000),
});

export const roomProgramStatusSchema = z.object({
  layout: recorderLayoutSchema,
  state: z.enum(["queued", "running", "deferred", "ready", "failed"]),
  attempt: z.number().int().nonnegative(),
  deferredReason: programDeferredReasonSchema.nullable(),
  updatedAt: z.string().datetime(),
  error: z.string().max(500).nullable(),
});

export const mediaEndpointSchema = z.object({
  sourceId: z.string().regex(/^ps_[a-z0-9]{32}$/),
  url: z.string().startsWith("/v1/media/sources/"),
  token: z.string().min(32).max(1_024),
});

export type MediaEndpoint = z.infer<typeof mediaEndpointSchema>;

export const participantMediaGrantSchema = z.object({
  participantId: roomParticipantIdSchema,
  displayName: z.string().min(1).max(80),
  camera: mediaEndpointSchema,
  screen: mediaEndpointSchema,
});

export const mediaSessionGrantSchema = z.object({
  transport: z.literal("whip_whep"),
  roomId: z.string().uuid(),
  participantId: roomParticipantIdSchema,
  publish: participantMediaGrantSchema,
  recordingBootstrap: participantMediaGrantSchema,
  subscribe: z.array(participantMediaGrantSchema).max(MAX_ROOM_GUEST_LIMIT),
  expiresAt: z.string().datetime(),
}).superRefine((grant, context) => {
  if (grant.publish.participantId !== grant.participantId) {
    context.addIssue({
      code: "custom",
      message: "A media grant may publish only for its authenticated participant",
      path: ["publish", "participantId"],
    });
  }
  if (grant.recordingBootstrap.participantId !== grant.participantId) {
    context.addIssue({
      code: "custom",
      message: "A recording bootstrap may read only its authenticated participant",
      path: ["recordingBootstrap", "participantId"],
    });
  }
  if (
    grant.recordingBootstrap.camera.sourceId !== grant.publish.camera.sourceId
    || grant.recordingBootstrap.screen.sourceId !== grant.publish.screen.sourceId
  ) {
    context.addIssue({
      code: "custom",
      message: "A recording bootstrap must preserve the participant's published source identities",
      path: ["recordingBootstrap"],
    });
  }
  if (
    !grant.publish.camera.url.endsWith("/whip")
    || !grant.publish.screen.url.endsWith("/whip")
    || !grant.recordingBootstrap.camera.url.endsWith("/whep")
    || !grant.recordingBootstrap.screen.url.endsWith("/whep")
    || grant.recordingBootstrap.camera.url
      !== grant.publish.camera.url.replace(/\/whip$/, "/whep")
    || grant.recordingBootstrap.screen.url
      !== grant.publish.screen.url.replace(/\/whip$/, "/whep")
  ) {
    context.addIssue({
      code: "custom",
      message: "Publish and recording-bootstrap capabilities require WHIP and WHEP endpoints",
      path: ["recordingBootstrap"],
    });
  }
  if (grant.subscribe.some((peer) => peer.participantId === grant.participantId)) {
    context.addIssue({
      code: "custom",
      message: "A media grant may subscribe only to a peer participant",
      path: ["subscribe"],
    });
  }
  if (new Set(grant.subscribe.map((peer) => peer.participantId)).size !== grant.subscribe.length) {
    context.addIssue({
      code: "custom",
      message: "A media grant may subscribe only once to each peer participant",
      path: ["subscribe"],
    });
  }
  const endpoints = [
    grant.publish.camera,
    grant.publish.screen,
    ...grant.subscribe.flatMap((peer) => [peer.camera, peer.screen]),
  ];
  if (new Set(endpoints.map((endpoint) => endpoint.sourceId)).size !== endpoints.length) {
    context.addIssue({
      code: "custom",
      message: "Every participant media endpoint requires a unique server-derived source identity",
      path: ["subscribe"],
    });
  }
});

export type MediaSessionGrant = z.infer<typeof mediaSessionGrantSchema>;

export const mediaGrantRefreshResponseSchema = z.object({
  mediaGrant: mediaSessionGrantSchema,
});

export const lifecycleStateSchema = z.enum([
  "created",
  "preflight",
  "armed",
  "recording",
  "finalizing",
  "ready",
  "failed",
  "cancelled",
]);

export const healthStateSchema = z.enum([
  "healthy",
  "degraded",
  "recovering",
]);

export const sessionWarningSchema = z.object({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(500),
  firstObservedAt: z.string().datetime(),
});

export const roomSettingsSchema = z.object({
  maxGuests: z.number().int().min(0).max(MAX_ROOM_GUEST_LIMIT),
  admissionMode: roomAdmissionModeSchema.default("invite_link"),
  videoPreset: videoPresetSchema,
  audioPreset: audioPresetSchema,
  screenSharePreset: screenSharePresetSchema,
  requestedLayouts: z
    .array(recorderLayoutSchema)
    .min(1)
    .max(2)
    .refine((layouts) => new Set(layouts).size === layouts.length, {
      message: "Layouts must be unique",
    }),
});

export const roomSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120),
  hostName: z.string().min(1).max(80),
  settings: roomSettingsSchema,
  lifecycleState: lifecycleStateSchema,
  healthState: healthStateSchema,
  warnings: z.array(sessionWarningSchema),
  recordingAdapter: recordingAdapterSchema.nullable(),
  recordingEpoch: z.string().datetime().nullable(),
  stoppedAt: z.string().datetime().nullable(),
  currentRecordingId: z.string().uuid().nullable().default(null),
  programs: z.array(roomProgramStatusSchema).max(2).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  revision: z.number().int().nonnegative(),
}).superRefine((room, context) => {
  if (new Set(room.programs.map((program) => program.layout)).size !== room.programs.length) {
    context.addIssue({
      code: "custom",
      message: "A room can expose only one program status per layout",
      path: ["programs"],
    });
  }
});

export type Room = z.infer<typeof roomSchema>;

export const roomRecordingSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  name: z.string().min(1).max(120),
  lifecycleState: lifecycleStateSchema,
  healthState: healthStateSchema,
  warnings: z.array(sessionWarningSchema),
  recordingAdapter: recordingAdapterSchema.nullable(),
  recordingEpoch: z.string().datetime().nullable(),
  stoppedAt: z.string().datetime().nullable(),
  programs: z.array(roomProgramStatusSchema).max(2).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  revision: z.number().int().nonnegative(),
}).superRefine((recording, context) => {
  if (new Set(recording.programs.map((program) => program.layout)).size !== recording.programs.length) {
    context.addIssue({
      code: "custom",
      message: "A recording can expose only one program status per layout",
      path: ["programs"],
    });
  }
});

export type RoomRecording = z.infer<typeof roomRecordingSchema>;

export const roomRecordingListSchema = z.object({
  recordings: z.array(roomRecordingSchema).max(1_000),
});

export const roomBookingSchema = z.object({
  room: roomSchema,
  hostToken: z.string().min(32),
  guestInvitePath: z.string().startsWith("/?room="),
});

export const roomAdmissionSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  status: roomAdmissionStatusSchema,
  displayName: z.string().trim().min(1).max(80),
  verified: z.boolean(),
  requestedAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable(),
  admittedAt: z.string().datetime().nullable(),
  lastSeenAt: z.string().datetime().nullable(),
  leaseExpiresAt: z.string().datetime().nullable(),
  revision: z.number().int().nonnegative(),
});

export type RoomAdmission = z.infer<typeof roomAdmissionSchema>;

export const roomAdmissionResponseSchema = z.object({
  admission: roomAdmissionSchema,
  admissionToken: z.string().min(32).max(200),
});

export const roomAdmissionListSchema = z.object({
  admissions: z.array(roomAdmissionSchema).max(100),
});

export const accountSessionSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(160),
  expiresAt: z.string().datetime(),
});

export const accountCapabilitiesSchema = z.object({
  signInAvailable: z.boolean(),
  roomLibrary: z.boolean(),
  retentionDays: z.number().int().positive(),
  roomLimit: z.number().int().positive().max(100),
  guestSeatLimit: z.number().int().min(FREE_ROOM_GUEST_LIMIT).max(MAX_ROOM_GUEST_LIMIT),
});

export const accountSnapshotSchema = z.object({
  account: accountSessionSchema.nullable(),
  capabilities: accountCapabilitiesSchema,
  csrfToken: z.string().min(32).max(200).optional(),
});

export type AccountSnapshot = z.infer<typeof accountSnapshotSchema>;

export const accountAuthorizationResponseSchema = z.object({
  status: z.literal("redirect"),
  authorizationUrl: z.string().url(),
});

export const accountLogoutResponseSchema = accountSnapshotSchema.extend({
  redirectUrl: z.string().url().optional(),
});

export const accountRoomSummarySchema = z.object({
  room: roomSchema,
  retentionClass: z.literal("free"),
  mediaExpiresAt: z.string().datetime(),
  mediaDeletedAt: z.string().datetime().nullable(),
  claimedAt: z.string().datetime().nullable(),
  openPath: z.string().startsWith("/?room="),
});

export type AccountRoomSummary = z.infer<typeof accountRoomSummarySchema>;

export const accountRoomListSchema = z.object({
  rooms: z.array(accountRoomSummarySchema).max(100),
});

export const paidAccountPlanSchema = z.enum(["creator", "professional", "studio"]);

export type PaidAccountPlan = z.infer<typeof paidAccountPlanSchema>;

export const accountPlanSchema = z.enum([
  "free",
  "creator",
  "professional",
  "studio",
  "internal",
]);

export const accountRecordingAllowanceSchema = z.object({
  plan: accountPlanSchema,
  includedSeconds: z.number().int().positive().nullable(),
  usedSeconds: z.number().int().nonnegative(),
  remainingSeconds: z.number().int().nonnegative().nullable(),
  maxSessionSeconds: z.number().int().positive().nullable(),
  periodStartedAt: z.string().datetime().nullable(),
  resetsAt: z.string().datetime().nullable(),
  activeRecordingId: z.string().uuid().nullable(),
}).superRefine((allowance, context) => {
  const unlimited = allowance.plan === "internal" || allowance.plan === "studio";
  for (const [field, value] of [
    ["includedSeconds", allowance.includedSeconds],
    ["remainingSeconds", allowance.remainingSeconds],
    ["maxSessionSeconds", allowance.maxSessionSeconds],
    ["periodStartedAt", allowance.periodStartedAt],
    ["resetsAt", allowance.resetsAt],
  ] as const) {
    if (unlimited !== (value === null)) {
      context.addIssue({
        code: "custom",
        message: unlimited
          ? "Unlimited recording allowances cannot contain finite limits or a reset period"
          : "Metered recording allowances require explicit limits and a reset period",
        path: [field],
      });
    }
  }
  if (
    !unlimited
    && allowance.includedSeconds !== null
    && allowance.remainingSeconds !== null
    && allowance.usedSeconds + allowance.remainingSeconds > allowance.includedSeconds
  ) {
    context.addIssue({
      code: "custom",
      message: "Used and remaining recording time cannot exceed the included allowance",
      path: ["remainingSeconds"],
    });
  }
});

export type AccountRecordingAllowance = z.infer<typeof accountRecordingAllowanceSchema>;

export const accountBillingStatusSchema = z.enum([
  "active",
  "trialing",
  "past_due",
  "incomplete",
  "unpaid",
  "canceled",
]);

export const accountBillingSnapshotSchema = z.object({
  mode: z.enum(["test", "live"]).nullable(),
  plan: accountPlanSchema,
  subscriptionPlan: paidAccountPlanSchema.nullable(),
  status: accountBillingStatusSchema,
  currentPeriodEnd: z.string().datetime().nullable(),
  cancelAt: z.string().datetime().nullable(),
  downloadUntil: z.string().datetime().nullable(),
  capabilities: z.object({
    guestSeatLimit: z.number().int().min(FREE_ROOM_GUEST_LIMIT).max(MAX_ROOM_GUEST_LIMIT),
    retentionDays: z.number().int().positive(),
    recording: accountRecordingAllowanceSchema,
  }),
  checkoutAvailable: z.boolean(),
  planChangeAvailable: z.boolean(),
  portalAvailable: z.boolean(),
}).superRefine((snapshot, context) => {
  if (snapshot.capabilities.recording.plan !== snapshot.plan) {
    context.addIssue({
      code: "custom",
      message: "Billing and recording allowance plans must agree",
      path: ["capabilities", "recording", "plan"],
    });
  }
});

export type AccountBillingSnapshot = z.infer<typeof accountBillingSnapshotSchema>;

export const accountBillingRedirectSchema = z.object({
  status: z.literal("redirect"),
  url: z.string().url(),
}).strict();

export const accountRecordingSummarySchema = z.object({
  recording: roomRecordingSchema,
  roomTitle: z.string().min(1).max(120),
  openPath: z.string().startsWith("/?room="),
  mediaExpiresAt: z.string().datetime(),
  mediaDeletedAt: z.string().datetime().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
});

export const accountRecordingLibrarySchema = z.object({
  allowance: accountRecordingAllowanceSchema,
  recordings: z.array(accountRecordingSummarySchema).max(1_000),
});

export type AccountRecordingLibrary = z.infer<typeof accountRecordingLibrarySchema>;

export const updateAccountRoomRequestSchema = z.object({
  title: z.string().trim().min(1).max(120),
  hostName: z.string().trim().min(1).max(80),
  settings: roomSettingsSchema,
}).strict();

export type UpdateAccountRoomRequest = z.infer<typeof updateAccountRoomRequestSchema>;

export const accountRoomInvitationSchema = z.object({
  roomId: z.string().uuid(),
  guestInvitePath: z.string().startsWith("/?room="),
  rotatedAt: z.string().datetime(),
});

export type AccountRoomInvitation = z.infer<typeof accountRoomInvitationSchema>;

export const roomAccessSchema = z.object({
  room: roomSchema,
  role: roomRoleSchema,
  participantId: roomParticipantIdSchema,
  participantToken: z.string().min(32).max(200).optional(),
  admissionId: z.string().uuid().optional(),
  vdoUrl: z.string().url(),
  mediaTransport: z.object({
    available: z.boolean(),
    kind: z.literal("whip_whep"),
    requiresConsent: z.literal(true),
  }),
  recorderAvailability: z.object({
    local: z.literal(true),
    server: z.boolean(),
  }),
});

export type RoomAccess = z.infer<typeof roomAccessSchema>;

export const roomConsentSchema = z.object({
  roomId: z.string().uuid(),
  participantId: roomParticipantIdSchema,
  role: roomRoleSchema,
  acceptedAt: z.string().datetime(),
});

export const roomConsentResponseSchema = z.object({
  consent: roomConsentSchema,
  mediaGrant: mediaSessionGrantSchema,
});

export const recordingArtifactDescriptorSchema = z.object({
  artifactId: z.string().regex(/^pa_[a-f0-9]{32}$/),
  kind: z.enum(["isolated", "program"]),
  participantId: roomParticipantIdSchema.nullable(),
  sourceKind: mediaSourceKindSchema.nullable(),
  layout: recorderLayoutSchema.nullable(),
  sequence: z.number().int().nonnegative().nullable(),
  fileName: z.string().min(1).max(160).refine(
    (value) => !value.includes("/") && !value.includes("\\"),
    { message: "Artifact filenames cannot contain path separators" },
  ),
  start: z.string().datetime(),
  end: z.string().datetime(),
  durationMs: z.number().int().positive(),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((artifact, context) => {
  const isolated = artifact.kind === "isolated";
  if (
    isolated !== Boolean(artifact.participantId)
    || isolated !== Boolean(artifact.sourceKind)
    || isolated !== (artifact.sequence !== null)
    || isolated === Boolean(artifact.layout)
  ) {
    context.addIssue({
      code: "custom",
      message: "Artifact identity fields must match isolated or program output",
      path: ["kind"],
    });
  }
  if (Date.parse(artifact.end) - Date.parse(artifact.start) !== artifact.durationMs) {
    context.addIssue({
      code: "custom",
      message: "Artifact duration must match its wall-clock interval",
      path: ["durationMs"],
    });
  }
});

export const roomArtifactSchema = recordingArtifactDescriptorSchema.extend({
  downloadPath: z.string().startsWith("/v1/rooms/"),
});

export type RoomArtifact = z.infer<typeof roomArtifactSchema>;

export const roomArtifactListSchema = z.object({
  artifacts: z.array(roomArtifactSchema).max(10_000),
});

export const porchcastCompanionStatusSchema = z.enum([
  "unknown",
  "live",
  "recording",
  "rendering",
  "ready",
  "attention",
]);

export type PorchcastCompanionStatus = z.infer<typeof porchcastCompanionStatusSchema>;

export const porchcastCompanionPorchSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{6,80}$/),
  title: z.string().trim().min(1).max(120),
  role: roomRoleSchema,
}).strict();

export const porchcastCompanionSnapshotSchema = z.object({
  revision: z.number().int().nonnegative(),
  porch: porchcastCompanionPorchSchema.nullable(),
  status: porchcastCompanionStatusSchema,
  capabilities: z.object({
    account: z.boolean(),
    downloads: z.boolean(),
    invite: z.boolean(),
  }).strict(),
  noticeKey: z.string().regex(/^[A-Za-z0-9:_-]{1,160}$/).nullable(),
}).strict();

export type PorchcastCompanionSnapshot = z.infer<typeof porchcastCompanionSnapshotSchema>;

export const porchcastCompanionStateMessageSchema = z.object({
  protocol: z.literal("porchcast-companion"),
  version: z.literal(1),
  source: z.literal("porchcast-web"),
  type: z.literal("state"),
  payload: porchcastCompanionSnapshotSchema,
}).strict();

export type PorchcastCompanionStateMessage = z.infer<typeof porchcastCompanionStateMessageSchema>;

export const porchcastCompanionStateRequestSchema = z.object({
  protocol: z.literal("porchcast-companion"),
  version: z.literal(1),
  source: z.literal("porchcast-extension"),
  type: z.literal("state_request"),
}).strict();

export type PorchcastCompanionStateRequest = z.infer<typeof porchcastCompanionStateRequestSchema>;
