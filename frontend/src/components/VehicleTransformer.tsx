import { useState, type CSSProperties } from "react";
import { Bot, CarFront } from "lucide-react";
import type { Vehicle, VehicleProfile, VinDecode } from "../api";
import { t } from "../i18n";
import { transformerAppearance } from "../utils/transformerAppearance";

export function VehicleTransformer({ vehicle, profile, decode, hero = false, car = false, className = "" }: {
  vehicle: Vehicle | null; profile?: VehicleProfile | null; decode?: VinDecode | null;
  hero?: boolean; car?: boolean; className?: string;
}) {
  const appearance = transformerAppearance(vehicle, profile, decode);
  const { artwork } = appearance;
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const src = artwork?.src;
  const ready = !!src && loaded === src && failed !== src;
  const crop = artwork && (car ? artwork.carCrop : artwork.robotCrop);
  const cropStyle: CSSProperties | undefined = !hero && crop ? {
    width: `${1536 / crop[2] * 100}%`, height: `${1024 / crop[3] * 100}%`,
    left: `${-crop[0] / crop[2] * 100}%`, top: `${-crop[1] / crop[3] * 100}%`,
  } : undefined;
  const status = !artwork ? t("Образ моделі ще не готовий") : failed === src ? t("Не вдалося завантажити образ")
    : appearance.exteriorColor ? t("Концепт · колір не відтворено") : t("Концепт · колір не вказано");
  return <span className={`vehicle-transformer ${hero ? "transformer-hero" : car ? "vehicle-artwork" : "transformer-portrait"} ${className}`}
    data-appearance={appearance.key} data-artwork={artwork?.id ?? "unavailable"} data-ready={ready}
    role="img" aria-label={`${car ? appearance.label : t("Трансформер авто: {0}", { 0: appearance.label })}. ${status}`} title={status}>
    {src && failed !== src && <img key={src} src={src} alt="" style={cropStyle} className={hero ? "transformer-scene" : "transformer-crop"}
      fetchPriority={hero ? "high" : "auto"} decoding="async" onLoad={() => setLoaded(src)} onError={() => setFailed(src)}/>}
    {!ready && <span className="transformer-fallback">{car ? <CarFront aria-hidden="true"/> : <Bot aria-hidden="true"/>}</span>}
    {hero && <span className="artwork-status">{status}</span>}
  </span>;
}
