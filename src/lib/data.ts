import { assertManifest, assertPayload } from "./schema.mjs";
export type Manifest = {
  version: string;
  schoolYear: string;
  calendarFrom: string;
  calendarTo: string;
  validFrom: string;
  validTo: string;
  generatedAt: string;
  files: Record<string, string>;
};
let current: Manifest;
const cache = new Map<string, unknown>();
export async function manifest() {
  const r = await fetch("/data/manifest.json", { cache: "no-store" });
  if (!r.ok) throw Error("Nie można sprawdzić aktualizacji");
  const value = await r.json();
  assertManifest(value);
  return value as Manifest;
}
export async function load<T = any>(key: string, m = current): Promise<T> {
  if (!m) m = await manifest();
  const url = m.files[key];
  if (cache.has(url)) return cache.get(url) as T;
  const r = await fetch(url);
  if (!r.ok) throw Error("Nie można wczytać danych");
  const value = await r.json();
  assertPayload(key, value);
  cache.set(url, value);
  return value;
}
export async function connect(
  keys: string[],
  render: (data: Record<string, any>, m: Manifest) => void,
) {
  let busy = false,
    ready = false;
  async function refresh() {
    if (busy) return;
    busy = true;
    const status = document.querySelector<HTMLElement>("#data-status")!;
    try {
      const next = await manifest();
      const data = Object.fromEntries(
        await Promise.all(keys.map(async (k) => [k, await load(k, next)])),
      );
      current = next;
      render(data, next);
      ready = true;
      status.dataset.loaded = "true";
      status.classList.remove("error");
      status.textContent = `Dane opublikowane ${new Date(next.generatedAt).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })}`;
    } catch (error) {
      status.classList.add("error");
      status.textContent = ready
        ? "Nie udało się odświeżyć danych. Wyświetlamy ostatnio odczytaną wersję."
        : "Nie można wczytać danych. Sprawdź połączenie i spróbuj ponownie.";
      if (!status.querySelector("button")) {
        const b = document.createElement("button");
        b.textContent = "Spróbuj ponownie";
        b.onclick = refresh;
        status.append(" ", b);
      }
    } finally {
      busy = false;
    }
  }
  await refresh();
  setInterval(() => {
    if (!document.hidden) void refresh();
  }, 120000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refresh();
  });
}
