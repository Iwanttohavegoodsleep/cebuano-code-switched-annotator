export type AnnotationKeybinds = {
  complaint: string;
  notComplaint: string;
  wrongLanguage: string;
  skip: string;
  undo: string;
  history: string;
};

export const defaultAnnotationKeybinds: AnnotationKeybinds = {
  complaint: "y",
  notComplaint: "n",
  wrongLanguage: "l",
  skip: "s",
  undo: "z",
  history: "h",
};

export const keybindLabels: Array<{ key: keyof AnnotationKeybinds; label: string }> = [
  { key: "complaint", label: "Yes · Complaint" },
  { key: "notComplaint", label: "No · Not complaint" },
  { key: "wrongLanguage", label: "Not Cebuano-English" },
  { key: "skip", label: "Skip" },
  { key: "undo", label: "Undo" },
  { key: "history", label: "Open history" },
];

export function keybindStorageKey(profileId: string) {
  return `review-annotator-keybinds:${profileId}`;
}

export function displayKey(key: string) {
  return key === " " ? "Space" : key.toUpperCase();
}

export function isValidKeybinds(value: unknown): value is AnnotationKeybinds {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return keybindLabels.every(({ key }) => typeof candidate[key] === "string" && candidate[key].length === 1);
}
