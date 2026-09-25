import { connect } from "./data";
import { daily, today, dateLabel, tvDayPages, esc } from "./model.mjs";
// Poniżej tej skali czcionki klasa dostaje całą kolumnę slajdu.
const MIN_SCALE = 0.8;
const nowTime = () =>
  new Date().toLocaleTimeString("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  });
// Grupy tej samej lekcji w jednym wierszu: numer i przedmiot raz, pod spodem grupy.
function periods(entries: any[]) {
  const out: any[][] = [];
  const seen = new Set<string>();
  for (const l of [...entries].sort((x, y) => x.period - y.period)) {
    // Te same zajęcia wpisane kilka razy (np. religia łącząca klasy) — raz.
    const key = JSON.stringify([
      l.period,
      l.subject,
      l.status,
      l.roomNames,
      [...new Set(l.groupNames)],
      l.teacherNames,
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    const last = out.at(-1);
    if (last && last[0].period === l.period) last.push(l);
    else out.push([l]);
  }
  return out;
}
const badge = (l: any) =>
  l.status !== "base"
    ? ` <strong class="tv-badge">${l.status === "transfer" ? "Przeniesienie" : l.status === "cancelled" ? "Odwołana / później" : "Zastępstwo"}</strong>`
    : "";
const details = (l: any) =>
  `Sala ${esc(l.roomNames.join(" / "))}${l.groupNames.length ? " · " + esc([...new Set(l.groupNames)].join(", ")) : ""}${l.teacherNames.length ? " · " + esc(l.teacherNames.join(", ")) : ""}`;
function card(c: any, now: string) {
  const lessons = periods(c.entries)
    .map((group) => {
      const first = group[0],
        same = group.every((l) => l.subject === first.subject),
        changed = group.some((l) => l.status !== "base"),
        current = group.some((l) => l.start <= now && l.end > now);
      const body = same
        ? `<h3>${esc(first.subject)}${group.length === 1 ? badge(first) : ""}</h3>${group.map((l) => `<p>${details(l)}${group.length > 1 ? badge(l) : ""}</p>`).join("")}`
        : group
            .map(
              (l) =>
                `<h3>${esc(l.subject)}${badge(l)}</h3><p>${details(l)}</p>`,
            )
            .join("");
      return `<article class="tv-lesson${changed ? " changed" : ""}${current ? " now" : ""}"><p class="tv-nr">${first.period}<small>${esc(first.start)}</small></p><div>${body}</div></article>`;
    })
    .join("");
  return `<section class="tv-card${c.tall ? " tall" : ""}"><h2>${esc(c.name)}</h2><div class="tv-day">${lessons}</div></section>`;
}
// Zmniejsz czcionkę karty, aż cały dzień się zmieści; zwraca użytą skalę.
function fit(el: HTMLElement) {
  let scale = 1;
  el.style.setProperty("--tv-scale", "1");
  while (el.scrollHeight > el.clientHeight + 1 && scale > 0.5) {
    scale = Math.round((scale - 0.05) * 100) / 100;
    el.style.setProperty("--tv-scale", String(scale));
  }
  return scale;
}
// Dopasowanie do rzeczywistego ekranu: widok 1080×1920 skalowany i
// wyśrodkowany w oknie; marginesy (ramka) z parametrów adresu, np.
// tv.html?top=140&bottom=40&left=90&right=90. Parametr ?diag pokazuje
// wymiary okna, żeby łatwiej dobrać marginesy na danym telewizorze.
function setupScreen() {
  const params = new URLSearchParams(location.search),
    body = document.body;
  for (const side of ["top", "bottom", "left", "right"]) {
    const value = Number(params.get(side));
    if (params.has(side) && Number.isFinite(value) && value >= 0)
      body.style.setProperty(`padding-${side}`, `${Math.min(value, 400)}px`);
  }
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const diag = params.has("diag") ? document.createElement("div") : null;
  if (diag) {
    diag.className = "tv-diag";
    body.after(diag);
  }
  const fitScreen = () => {
    const scale = Math.min(innerWidth / 1080, innerHeight / 1920);
    body.style.transform =
      scale === 1 && innerWidth === 1080 && innerHeight === 1920
        ? ""
        : `translate(${(innerWidth - 1080 * scale) / 2}px, ${(innerHeight - 1920 * scale) / 2}px) scale(${scale})`;
    scrollTo(0, 0);
    if (diag)
      diag.textContent = `okno ${innerWidth}×${innerHeight} · DPR ${devicePixelRatio} · skala ${scale.toFixed(3)} · ekran ${screen.width}×${screen.height}`;
  };
  fitScreen();
  addEventListener("resize", fitScreen);
  setInterval(fitScreen, 60000);
}
export async function init() {
  let slides: any[] = [],
    index = 0,
    plan: any,
    changes: any,
    manifest: any,
    date = "";
  const content = document.getElementById("tv-content")!;
  setupScreen();
  function prepare() {
    date = today();
    if (date < manifest.validFrom || date > manifest.validTo) {
      slides = [];
      return;
    }
    const rows = daily(plan, changes, date).filter(
      (l: any) =>
        !["removed", "moved-out", "duty", "duty-change"].includes(l.status),
    );
    const groups = Object.values(plan.classes)
      .sort((a: any, b: any) => a.localeCompare(b, "pl"))
      .map((name) => [
        name,
        rows.filter((l: any) => l.classNames.includes(name)),
      ])
      .filter(([, rows]: any) => rows.length);
    // Zmierz każdą klasę w zwykłej komórce (1/4 slajdu): jeśli litery
    // musiałyby być za małe, klasa zajmie całą kolumnę.
    const tall = new Set<any[]>();
    for (const [name, entries] of groups as any[]) {
      content.innerHTML = card({ name, entries }, "");
      if (fit(content.firstElementChild as HTMLElement) < MIN_SCALE)
        tall.add(entries);
    }
    slides = tvDayPages(groups, 4, (entries: any[]) => tall.has(entries));
  }
  function show() {
    if (!slides.length) {
      content.innerHTML =
        '<p class="tv-empty">Brak zajęć do wyświetlenia na dziś.</p>';
      return;
    }
    index %= slides.length;
    const now = nowTime();
    content.innerHTML = slides[index].map((c: any) => card(c, now)).join("");
    content.querySelectorAll<HTMLElement>(".tv-card").forEach(fit);
  }
  await connect(["plan", "changes"], (d, m) => {
    plan = d.plan;
    changes = d.changes;
    manifest = m;
    prepare();
    show();
  });
  setInterval(() => {
    index++;
    show();
  }, 10000);
  // Po zmianie lekcji odśwież wyróżnienie bieżącej lekcji.
  let shownPeriod: number | null = null;
  const clock = () => {
    const time = nowTime();
    const period = plan?.periods.find(
      (p: any) => p.start <= time && p.end > time,
    );
    const status = !slides.length
      ? "Brak zajęć"
      : period
        ? `Trwa lekcja ${period.number}`
        : time < (plan?.periods[0]?.start || "08:00")
          ? "Przed lekcjami"
          : time > (plan?.periods.at(-1)?.end || "20:00")
            ? "Po lekcjach"
            : "Przerwa";
    document.getElementById("tv-clock")!.innerHTML =
      `${esc(dateLabel(today()))} · ${esc(time)} <span class="tv-live">${esc(status)}</span>`;
    if (plan && date !== today()) {
      prepare();
      show();
    } else if (plan && (period?.number ?? null) !== shownPeriod) show();
    shownPeriod = period?.number ?? null;
  };
  clock();
  setInterval(clock, 1000);
  // Komunikaty w stopce zmieniają się niezależnie od slajdów planu.
  const notes = document.querySelectorAll(".tv-footer-slide");
  let note = 0;
  if (notes.length > 1)
    setInterval(() => {
      notes[note].classList.remove("active");
      note = (note + 1) % notes.length;
      notes[note].classList.add("active");
    }, 10000);
}
