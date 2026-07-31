export const FLAG_STATES = ["green", "yellow", "red", "unknown"] as const;
export type FlagState = typeof FLAG_STATES[number];

export interface ObservedBeachStatus {
  beachId: string;
  flag: FlagState;
  jellyfish: boolean | null;
  observedAtLocal: string | null;
  source: "gestiondeplayas";
}

export interface ObservedStatusResponse {
  fetchedAt: string;
  beaches: ObservedBeachStatus[];
}
