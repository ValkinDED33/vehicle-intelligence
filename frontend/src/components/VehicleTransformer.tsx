import { useEffect, useMemo, useRef, useState } from "react";
import type { Vehicle, VehicleProfile, VinDecode } from "../api";
import { t } from "../i18n";
import { transformerAppearance } from "../utils/transformerAppearance";
import { profileDisplayFacts } from "../utils/profileDisplayFacts";

export function VehicleTransformer({ vehicle, profile, decode, hero = false, className = "" }: {
  vehicle: Vehicle | null; profile?: VehicleProfile | null; decode?: VinDecode | null; hero?: boolean; className?: string;
}) {
  const { bodyType, exteriorColor } = profileDisplayFacts(vehicle, profile, decode);
  const appearance = useMemo(() => transformerAppearance(vehicle, { bodyType, exteriorColor }), [vehicle?.id, vehicle?.make, vehicle?.model, vehicle?.nickname, bodyType, exteriorColor]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [portrait, setPortrait] = useState<{ key: string; url: string } | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false, dispose: (() => void) | undefined;
    setReady(false);
    void import("./transformerScene").then(async scene => {
      if (cancelled) return;
      if (hero && canvas.current) {
        dispose = scene.mountTransformer(canvas.current, appearance);
        setReady(true);
      } else {
        const url = await scene.transformerPortrait(appearance);
        if (!cancelled) { setPortrait({ key: appearance.key, url }); setReady(true); }
      }
    }).catch(() => { if (!cancelled) setReady(false); });
    return () => { cancelled = true; dispose?.(); };
  }, [appearance.key, hero]);
  return <span className={`vehicle-transformer ${hero ? "transformer-hero" : "transformer-portrait"} ${className}`} data-appearance={appearance.key} data-ready={ready} role="img" aria-label={t("Трансформер авто: {0}", { 0: appearance.label })}>
    {hero && <canvas key={appearance.key} ref={canvas} aria-hidden="true"/>}
    {!hero && portrait?.key === appearance.key && <img src={portrait.url} alt=""/>}
    {!ready && <span className="transformer-fallback" style={{ color: appearance.accent, borderColor: appearance.paint }}><b>{appearance.label.slice(0, 2).toUpperCase()}</b><small>{appearance.code.slice(-4)}</small></span>}
  </span>;
}
