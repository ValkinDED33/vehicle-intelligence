export interface AssistantPreferences {
  detailLevel: "concise" | "detailed";
  priority: "balanced" | "reliability" | "economy";
  drivingPattern: "unspecified" | "city" | "highway" | "mixed";
}
export interface AssistantPreferencesSnapshot extends AssistantPreferences { revision: number }
export const DEFAULT_ASSISTANT_PREFERENCES: AssistantPreferencesSnapshot = {
  detailLevel: "concise", priority: "balanced", drivingPattern: "unspecified", revision: 0,
};

export function preferencesPrompt(preferences?: AssistantPreferences): string {
  const value = preferences ?? DEFAULT_ASSISTANT_PREFERENCES;
  const detail = value.detailLevel === "detailed"
    ? "The owner prefers detailed answers: explain the reasoning, alternatives and practical next steps in up to 10 short sentences."
    : "The owner prefers concise answers: use 2-6 short sentences and prioritize the next useful action.";
  const priorities = {
    balanced: "Balance reliability, convenience and cost without assuming a specific budget.",
    reliability: "The owner's priority is reliability: prioritize prevention and the evidence needed to verify a problem.",
    economy: "The owner's priority is economy: compare sensible lower-cost options and avoid unnecessary purchases or repairs.",
  };
  return `${detail} ${priorities[value.priority]} ` +
    (value.drivingPattern === "unspecified" ? "The owner's driving pattern is unknown. " : `The owner reports a ${value.drivingPattern} driving pattern; consider it when relevant, but do not treat it as measured telemetry. `) +
    "These preferences never override safety, legal obligations, confirmed facts or manufacturer requirements. Do not invent or automatically change service intervals, dates or notification schedules based on preferences. ";
}
