import type { RoomAdmissionMode } from "@wiplash/podcast-contracts";

export const admissionModeOptions: Array<{
  id: RoomAdmissionMode;
  name: string;
  detail: string;
}> = [
  {
    id: "host_approval",
    name: "Host must admit",
    detail: "Guests wait in the lobby until you let them in.",
  },
  {
    id: "verified_wiplash",
    name: "Verified Wiplash users",
    detail: "Anyone with the link must sign in through Wiplash.ai.",
  },
  {
    id: "invite_link",
    name: "Anyone with the link",
    detail: "Fastest entry. Keep the invitation private.",
  },
];

export type AdmissionModeSelectProps = {
  value: RoomAdmissionMode;
  onChange: (value: RoomAdmissionMode) => void;
};

export function AdmissionModeSelect({
  value,
  onChange,
}: AdmissionModeSelectProps) {
  return (
    <div className="admission-options" role="radiogroup" aria-label="Who can join this room">
      {admissionModeOptions.map((option) => (
        <button
          aria-checked={value === option.id}
          className={value === option.id ? "active" : ""}
          key={option.id}
          onClick={() => onChange(option.id)}
          role="radio"
          type="button"
        >
          <span className="choice-radio" aria-hidden="true"><i /></span>
          <span><strong>{option.name}</strong><small>{option.detail}</small></span>
        </button>
      ))}
    </div>
  );
}
