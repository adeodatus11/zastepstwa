import { connect } from "./data";
import { addDays, dayOf, today, dateLabel, esc } from "./model.mjs";
// Telewizor pokazuje wyłącznie zastępstwa, pogrupowane według nieobecnych
// nauczycieli — wszystko naraz, bez slajdów. Zakończone lekcje znikają;
// gdy na dziś nic nie zostało, ekran pokazuje najbliższy dzień z zastępstwami.
const nowTime = () =>
  new Date().toLocaleTimeString("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  });
const SKUTEK: Record<string, [string, string]> = {
  late: ["Przychodzą później", "late"],
  cancelled: ["Zwolnieni do domu", "off"],
};
const effectOf = (s: any): [string, string] =>
  SKUTEK[s.kind] ?? [
    s.substituteTeacherName || s.rawSubstituteLabel || "Zastępstwo",
    "sub",
  ];
// Kolejne lekcje z tą samą klasą, przedmiotem, zastępcą i salą — jeden wiersz.
function merge(rows: any[]) {
  const out: any[] = [];
  const key = (s: any) =>
    JSON.stringify([
      s.branch.className,
      s.branch.groupName,
      s.replacementSubject || s.subject,
      effectOf(s),
      s.room,
    ]);
  for (const s of rows) {
    const last = out.at(-1);
    if (last && last.to.period + 1 === s.period && key(last.to) === key(s))
      last.to = s;
    else out.push({ from: s, to: s });
  }
  return out;
}
function row({ from: s, to }: any, now: string) {
  const [effect, kind] = effectOf(s);
  const current = s.timeFrom <= now && to.timeTo > now;
  const nr = s === to ? `${s.period}` : `${s.period}–${to.period}`;
  return `<li class="tvz-row${current ? " now" : ""}"><span class="tvz-nr${s === to ? "" : " range"}">${nr}<small>${esc(s.timeFrom)}–${esc(to.timeTo)}</small></span><span class="tvz-class">${esc(s.branch.className)}${s.branch.groupName ? `<small>${esc(s.branch.groupName)}</small>` : ""}</span><span class="tvz-subject">${esc(s.replacementSubject || s.subject)}</span><span class="tvz-effect ${kind}">${kind === "sub" ? "→ " : ""}${esc(effect)}</span><span class="tvz-room">${s.room ? `s.&nbsp;${esc(s.room)}` : ""}</span></li>`;
}
function teacher([name, rows]: [string, any[]], now: string, i: number) {
  return `<section class="tvz-teacher" data-i="${i % 6}"><h2><span>Nieobecność</span>${esc(name)}</h2><ol>${merge(
    rows,
  )
    .map((r) => row(r, now))
    .join("")}</ol></section>`;
}
// Dobierz liczbę kolumn (1–3) i największą czcionkę, przy której wszystko
// mieści się na ekranie. Więcej kolumn tylko wtedy, gdy wyraźnie powiększa
// tekst — jedna kolumna czyta się najłatwiej.
function fit(el: HTMLElement) {
  const fits = () =>
    el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth;
  const set = (cols: number, scale: number) => {
    el.dataset.cols = String(cols);
    el.style.setProperty("--tv-scale", String(scale));
  };
  let best = { cols: 1, scale: 0 };
  for (const cols of [1, 2, 3]) {
    let lo = 0.3,
      hi = 1;
    set(cols, hi);
    if (fits()) lo = hi;
    else
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        set(cols, mid);
        if (fits()) lo = mid;
        else hi = mid;
      }
    if (lo > best.scale * 1.1) best = { cols, scale: lo };
  }
  // Kontrola końcowa: po zmianie kolumn układ bywa o włos wyższy.
  let scale = best.scale || 0.3;
  set(best.cols, scale);
  while (!fits() && scale > 0.3) set(best.cols, (scale -= 0.01));
  return scale;
}
// Wiersze pod logo zawsze w jednej linii: gdy telewizor rysuje tekst szerzej,
// zmniejsz czcionkę danego wiersza, zamiast go zawijać albo ucinać.
function fitHeader() {
  for (const el of document.querySelectorAll<HTMLElement>(
    ".tv-info dt, .tv-info dd",
  )) {
    el.style.fontSize = "";
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth && size > 10)
      el.style.fontSize = `${--size}px`;
  }
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
      body.style.setProperty(`--tv-${side}`, `${Math.min(value, 400)}px`);
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
    // Strona nigdy nie może być przewinięta (Chrome na telewizorze przewijał).
    scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    body.scrollTop = 0;
    if (diag)
      diag.textContent = `okno ${innerWidth}×${innerHeight} · DPR ${devicePixelRatio} · skala ${scale.toFixed(3)} · ekran ${screen.width}×${screen.height}`;
  };
  fitScreen();
  addEventListener("resize", fitScreen);
  addEventListener("scroll", fitScreen, true);
  setInterval(fitScreen, 5000);
}
export async function init() {
  let plan: any, changes: any, manifest: any;
  const content = document.getElementById("tv-content")!;
  content.className = "tvz";
  setupScreen();
  // Zastępstwa dnia według nieobecnych, w kolejności pierwszej lekcji.
  const byTeacher = (date: string, now: string) => {
    const groups = new Map<string, any[]>();
    for (const s of [...(changes?.substitutions ?? [])]
      .filter((s: any) => s.date === date && s.timeTo > now)
      .sort((a: any, b: any) => a.period - b.period))
      groups.set(s.absentTeacherName, [
        ...(groups.get(s.absentTeacherName) ?? []),
        s,
      ]);
    return [...groups];
  };
  function show() {
    fitHeader();
    if (!changes) return;
    const now = nowTime();
    let date = today(),
      groups = byTeacher(date, now);
    // Po ostatnim zastępstwie dnia: najbliższy dzień z zastępstwami.
    for (let i = 1; !groups.length && i <= 7; i++) {
      date = addDays(today(), i);
      if (date > manifest.validTo) break;
      groups = byTeacher(date, "00:00");
    }
    if (!groups.length) {
      content.innerHTML =
        '<p class="tv-empty">Brak zaplanowanych zastępstw.</p>';
      return;
    }
    // Inny dzień niż dziś: wyraźny tytuł, żeby nikt nie wziął go za dzisiejszy.
    content.innerHTML = `${date === today() ? "" : `<h2 class="tvz-title">Zastępstwa na ${esc(dateLabel(date))}</h2>`}<div class="tvz-list">${groups.map((g, i) => teacher(g, date === today() ? now : "", i)).join("")}</div>`;
    fit(content.querySelector(".tvz-list") as HTMLElement);
  }
  // Krój pogrubiony z polskimi znakami dociąga się dopiero, gdy pojawią się
  // zastępstwa — tekst rośnie o kilka pikseli, więc dopasuj ponownie.
  document.fonts?.addEventListener("loadingdone", () => show());
  await connect(["plan", "changes"], (d, m) => {
    plan = d.plan;
    changes = d.changes;
    manifest = m;
    show();
  });
  // Co minutę: zakończone lekcje znikają, bieżąca jest wyróżniona.
  let shown = "";
  const clock = () => {
    const time = nowTime();
    const period = plan?.periods.find(
      (p: any) => p.start <= time && p.end > time,
    );
    const weekend = [0, 6].includes(dayOf(today()));
    const status = weekend
      ? "Dzień wolny"
      : period
        ? `Trwa lekcja ${period.number}`
        : time < (plan?.periods[0]?.start || "08:00")
          ? "Przed lekcjami"
          : time > (plan?.periods.at(-1)?.end || "20:00")
            ? "Po lekcjach"
            : "Przerwa";
    const [day, date] = dateLabel(today()).split(", ");
    document.getElementById("tv-clock")!.innerHTML =
      `<span class="tvc-time">${esc(time)}</span><span class="tv-live">${esc(status)}</span><span class="tvc-date">${esc(day)}, ${esc(date)}</span>`;
    if (time !== shown) show();
    shown = time;
  };
  clock();
  setInterval(clock, 1000);
}
