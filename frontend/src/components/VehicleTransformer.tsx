import { useState, type CSSProperties } from "react";
import { Bot, CarFront, Pencil } from "lucide-react";
import type { Vehicle, VehicleProfile, VinDecode } from "../api";
import { t } from "../i18n";
import { transformerAppearance } from "../utils/transformerAppearance";
import { useVehicleArtwork } from "../hooks/useVehicleArtwork";

export function VehicleTransformer({ vehicle, profile, decode, hero = false, car = false, className = "", onEditFacts }: {
  vehicle: Vehicle | null; profile?: VehicleProfile | null; decode?: VinDecode | null;
  hero?: boolean; car?: boolean; className?: string;
  onEditFacts?: () => void;
}) {
  const appearance = transformerAppearance(vehicle, profile, decode);
  const generated = useVehicleArtwork(vehicle, profile, decode);
  const { artwork } = appearance;
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const personal = generated?.state === "ready" && generated.fingerprint && generated.facts && generated.framing && generated.imageDataUrl?.startsWith("data:image/webp;base64,") ? generated : null;
  const src = personal?.imageDataUrl || artwork?.src;
  const ready = !!src && loaded === src && failed !== src;
  const crop = personal ? car ? personal.framing!.carCrop : personal.framing!.robotCrop : artwork && (car ? artwork.carCrop : artwork.robotCrop);
  const cropStyle: CSSProperties | undefined = !hero && crop ? {
    width: `${1536 / crop[2] * 100}%`, height: `${1024 / crop[3] * 100}%`,
    left: `${-crop[0] / crop[2] * 100}%`, top: `${-crop[1] / crop[3] * 100}%`,
  } : undefined;
  const status = failed === src && src ? t("Не вдалося завантажити образ") : personal ? t("Персональний AI-образ") : generated?.state === "generating" ? t("Створюємо образ автомобіля…")
    : generated?.state === "uncertain" ? t("Результат генерації потребує перевірки") : generated?.state === "failed" ? t("Не вдалося створити образ") : generated?.state === "limit" ? t("Ліміт генерацій вичерпано")
    : !artwork ? t("Образ моделі ще не готовий")
    : appearance.exteriorColor ? t("Концепт · колір не відтворено") : t("Концепт · колір не вказано");
  return <span className={`vehicle-transformer ${hero ? "transformer-hero" : car ? "vehicle-artwork" : "transformer-portrait"} ${className}`}
    data-appearance={personal?.fingerprint || appearance.key} data-artwork={personal ? "personal" : artwork?.id ?? "unavailable"} data-ready={ready}
    role={hero ? undefined : "img"} aria-label={`${car ? appearance.label : t("Трансформер авто: {0}", { 0: appearance.label })}. ${status}`} title={status}>
    {src && failed !== src && <img key={src} src={src} alt={hero ? appearance.label : ""} style={cropStyle} className={hero ? "transformer-scene" : "transformer-crop"}
      fetchPriority={hero ? "high" : "auto"} decoding="async" onLoad={() => setLoaded(src)} onError={() => setFailed(src)}/>}
    {!ready && <span className="transformer-fallback">{car ? <CarFront aria-hidden="true"/> : <Bot aria-hidden="true"/>}</span>}
    {hero && <span className="artwork-status">{status}{generated?.state === "missing_details" && onEditFacts && <button type="button" className="artwork-edit" onClick={onEditFacts} title={t("Уточнити дані авто")}><Pencil size={12}/>{t("Уточнити дані авто")}</button>}</span>}
  </span>;
}
