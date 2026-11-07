import type { Vehicle, VehicleProfile } from "../api";

export interface TransformerAppearance {
  key: string;
  seed: number;
  paint: string;
  accent: string;
  frame: "compact" | "sport" | "utility" | "van";
  label: string;
  code: string;
}

export function appearanceHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

const PAINTS: [RegExp, string][] = [
  [/white|білий|біла|biał/i, "#e3e9ed"], [/black|чорн|czarn/i, "#30383e"],
  [/silver|сріб|srebr/i, "#a7b8c1"], [/grey|gray|сір|szar/i, "#657580"],
  [/red|червон|czerwon/i, "#b62c39"], [/blue|син|блакит|niebies|błękit/i, "#2367a0"],
  [/green|зелен|zielon/i, "#277c62"], [/yellow|жовт|żółt/i, "#e4b83b"],
  [/orange|помаранч|pomarańcz/i, "#d26b30"], [/purple|фіолет|fiolet/i, "#79509a"],
  [/brown|коричн|brąz/i, "#775346"], [/beige|беж|beż/i, "#b9ad91"],
];

export function transformerAppearance(vehicle: Vehicle | null, profile?: Pick<VehicleProfile, "bodyType" | "exteriorColor"> | null): TransformerAppearance {
  const seed = appearanceHash(vehicle?.id.toLowerCase() ?? "cara-general");
  const body = profile?.bodyType?.toLowerCase() ?? "";
  const frame = /suv|crossover|pickup|пікап|позашлях/.test(body) ? "utility"
    : /van|mpv|bus|мінівен|фургон/.test(body) ? "van"
    : /coupe|convertible|roadster|купе|кабріолет/.test(body) ? "sport"
    : body ? "compact" : (["compact", "sport", "utility", "van"] as const)[seed % 4];
  const color = profile?.exteriorColor?.trim() ?? "";
  const paint = /^#[0-9a-f]{6}$/i.test(color) ? color : PAINTS.find(([pattern]) => pattern.test(color))?.[1]
    ?? ["#a4bac3", "#487f9c", "#5f9285", "#c0b574", "#9d6474"][seed % 5];
  const accent = ["#55ecdf", "#ffce66", "#8ecbff", "#d3f28b"][seed % 4];
  const label = vehicle ? [vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.nickname || "CARA" : "CARA";
  const code = seed.toString(36).toUpperCase().padStart(7, "0");
  return { key: `${code}:${frame}:${paint}:${label}`, seed, paint, accent, frame, label, code };
}
