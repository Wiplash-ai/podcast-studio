const creatorAdjectives = ["Bright", "Calm", "Curious", "Electric", "Golden", "Midnight"];
const creatorNouns = ["Creator", "Host", "Maker", "Storyteller", "Voice", "Wave"];

export function randomDisplayName(random = Math.random): string {
  const adjective = creatorAdjectives[Math.floor(random() * creatorAdjectives.length)]!;
  const noun = creatorNouns[Math.floor(random() * creatorNouns.length)]!;
  return `${adjective} ${noun}`;
}
