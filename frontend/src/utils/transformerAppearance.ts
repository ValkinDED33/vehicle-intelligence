import type { Vehicle, VehicleProfile, VinDecode } from "../api";
import { profileDisplayFacts } from "./profileDisplayFacts";

type Crop = readonly [x: number, y: number, width: number, height: number];
export interface VehicleArtwork {
  id: string;
  src: string;
  make: string;
  model: string;
  years: readonly [number, number];
  conceptColor: string;
  carCrop: Crop;
  robotCrop: Crop;
}

// Model-specific concepts share a camera/platform, not a body or a random VIN color.
export const VEHICLE_ARTWORK: readonly VehicleArtwork[] = [
  { id: "volkswagen-golf-5", make: "Volkswagen", model: "Golf", years: [2004, 2008], conceptColor: "blue",
    src: "/vehicle-artwork/volkswagen-golf-5-v2.webp", carCrop: [55, 465, 700, 525], robotCrop: [840, 55, 450, 450] },
  { id: "skoda-citigo-2012", make: "Škoda", model: "Citigo", years: [2012, 2016], conceptColor: "green",
    src: "/vehicle-artwork/skoda-citigo-2012-v2.webp", carCrop: [80, 480, 640, 480], robotCrop: [890, 185, 350, 350] },
  { id: "nissan-qashqai-j11", make: "Nissan", model: "Qashqai", years: [2017, 2017], conceptColor: "white",
    src: "/vehicle-artwork/nissan-qashqai-j11-v2.webp", carCrop: [35, 445, 720, 540], robotCrop: [810, 0, 510, 510] },
];

function normalize(value: string | null | undefined): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function transformerAppearance(vehicle: Vehicle | null, profile?: VehicleProfile | null, decode?: VinDecode | null) {
  const saved = decode?.vin && vehicle?.vin && normalize(decode.vin) === normalize(vehicle.vin)
    && (!decode.vehicleId || decode.vehicleId === vehicle.id) ? decode : null;
  const make = normalize(saved?.make || vehicle?.make);
  const model = normalize(saved?.model || vehicle?.model);
  const year = Number(saved?.modelYear || vehicle?.modelYear);
  const artwork = VEHICLE_ARTWORK.find(item => {
    // A legacy garage value combined the misspelled model with the make.
    const sameMake = make === normalize(item.make) || (item.make === "Škoda" && make === "skoda sitigo") || (item.make === "Volkswagen" && make === "vw");
    return sameMake && model === normalize(item.model) && Number.isInteger(year) && year >= item.years[0] && year <= item.years[1];
  }) ?? null;
  const label = artwork ? `${artwork.make} ${artwork.model}` : [saved?.make || vehicle?.make, saved?.model || vehicle?.model].filter(Boolean).join(" ") || vehicle?.nickname || "CARA";
  const { exteriorColor } = profileDisplayFacts(vehicle, profile, saved);
  return {
    key: `${artwork?.id ?? "unavailable"}:${vehicle?.id ?? "general"}:${exteriorColor?.trim() || "unknown"}`,
    artwork,
    label,
    exteriorColor: exteriorColor?.trim() || null,
  };
}
