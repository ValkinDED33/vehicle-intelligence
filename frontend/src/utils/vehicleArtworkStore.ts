import { loadStoredUser, vehicleArtworkApi, type VehicleArtworkResponse } from "../api";

type Api = typeof vehicleArtworkApi;
type Entry = { data: VehicleArtworkResponse | null; listeners: Set<() => void>; running: boolean; timer?: ReturnType<typeof setTimeout>; expires: number; activate: (listener: () => void) => () => void };

export function createArtworkStore(api: Api, currentOwner: () => string | undefined) {
  const cache = new Map<string, Entry>();
  return function getEntry(key: string, ownerId: string, vehicleId: string): Entry {
    const cached = cache.get(key);
    if (cached) return cached;
    // Keep private images in memory only; discard inactive entries, never another owner's data.
    if (cache.size >= 30) for (const [id, e] of cache) if (!e.listeners.size && !e.running) { if (e.timer) clearTimeout(e.timer); cache.delete(id); }
    const entry: Entry = { data: null, listeners: new Set(), running: false, expires: 0, activate };
    const emit = (data: VehicleArtworkResponse | null) => { entry.data = data; for (const listener of entry.listeners) listener(); };
    const valid = (value: VehicleArtworkResponse | null) => value?.vehicleId === vehicleId && typeof value.state === "string" && Array.isArray(value.missing);
    async function load() {
      if (entry.running || currentOwner() !== ownerId) return;
      if (entry.timer) { clearTimeout(entry.timer); entry.timer = undefined; }
      entry.running = true;
      try {
        let value = await api.current(vehicleId);
        if (currentOwner() !== ownerId || !valid(value)) return;
        emit(value);
        if (value.state === "available" && value.fingerprint) {
          emit({ ...value, state: "generating" });
          value = await api.ensure(vehicleId, value.fingerprint);
          if (currentOwner() !== ownerId || !valid(value)) return;
          emit(value);
        }
        entry.expires = Date.now() + 60_000;
      } catch {
        // Optional module unavailable on older deployments: retain the honest static fallback.
        entry.expires = Date.now() + 60_000;
      } finally {
        entry.running = false;
        if (entry.data?.state === "generating" && entry.listeners.size && currentOwner() === ownerId) entry.timer = setTimeout(() => { void load(); }, 5000);
      }
    }
    function activate(listener: () => void) {
      entry.listeners.add(listener);
      if (entry.expires <= Date.now() || entry.data?.state === "generating") void load();
      return () => { entry.listeners.delete(listener); if (!entry.listeners.size && entry.timer) { clearTimeout(entry.timer); entry.timer = undefined; } };
    }
    cache.set(key, entry);
    return entry;
  };
}

export const artworkEntry = createArtworkStore(vehicleArtworkApi, () => loadStoredUser()?.id);
