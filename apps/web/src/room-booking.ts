import type {
  AudioPreset,
  RecorderLayout,
  RoomAdmissionMode,
  ScreenSharePreset,
  VideoPreset,
} from "@wiplash/podcast-contracts";

export interface BookRoomInput {
  title: string;
  hostName: string;
  maxGuests: number;
  admissionMode: RoomAdmissionMode;
  videoPreset: VideoPreset;
  audioPreset: AudioPreset;
  screenSharePreset: ScreenSharePreset;
  requestedLayouts: RecorderLayout[];
  saveToAccount: boolean;
}
