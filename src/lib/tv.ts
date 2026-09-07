import { connect } from "./data";
import { daily, today, dateLabel, tvPages, esc } from "./model.mjs";
export async function init() {
  let slides: any[] = [],
    index = 0,
    plan: any,
    changes: any,
    manifest: any,
    date = "";
  const content = document.getElementById("tv-content")!;
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
    slides = tvPages(groups, 2);
  }
  function show() {
    if (!slides.length) {
      content.innerHTML =
        '<p class="tv-empty">Brak zajęć do wyświetlenia na dziś.</p>';
      return;
    }
    index %= slides.length;
    content.innerHTML = slides[index]
      .map(
        (c: any) =>
          `<section class="tv-card"><h2>${esc(c.name)}${c.continued ? "<small>ciąg dalszy</small>" : ""}</h2>${c.entries.map((l: any) => `<article class="tv-lesson"><p class="tv-time">${esc(l.start)}–${esc(l.end)} · ${l.period}</p>${l.status !== "base" ? `<strong class="tv-badge">${l.status === "transfer" ? "Przeniesienie" : l.status === "cancelled" ? "Odwołana / później" : "Zastępstwo"}</strong>` : ""}<h3>${esc(l.subject)}</h3><p>${esc(l.teacherNames.join(", "))}</p><p>Sala ${esc(l.roomNames.join(" / "))}${l.groupNames.length ? " · " + esc(l.groupNames.join(", ")) : ""}</p></article>`).join("")}</section>`,
      )
      .join("");
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
  const clock = () => {
    const time = new Date().toLocaleTimeString("pl-PL", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      minute: "2-digit",
    });
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
    }
  };
  clock();
  setInterval(clock, 1000);
}
