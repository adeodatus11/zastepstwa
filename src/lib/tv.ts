import { connect } from "./data";
import { daily, today, dateLabel, tvDayPages, esc } from "./model.mjs";
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
    slides = tvDayPages(groups, 2);
  }
  function show() {
    if (!slides.length) {
      content.innerHTML =
        '<p class="tv-empty">Brak zajęć do wyświetlenia na dziś.</p>';
      return;
    }
    index %= slides.length;
    const badge = (l: any) =>
      l.status !== "base"
        ? ` <strong class="tv-badge">${l.status === "transfer" ? "Przeniesienie" : l.status === "cancelled" ? "Odwołana / później" : "Zastępstwo"}</strong>`
        : "";
    const details = (l: any) =>
      `Sala ${esc(l.roomNames.join(" / "))}${l.groupNames.length ? " · " + esc(l.groupNames.join(", ")) : ""}${l.teacherNames.length ? " · " + esc(l.teacherNames.join(", ")) : ""}`;
    // Grupy tej samej lekcji w jednym wierszu: numer i przedmiot raz, pod spodem grupy.
    const periods = (entries: any[]) => {
      const out: any[][] = [];
      for (const l of [...entries].sort((x, y) => x.period - y.period)) {
        const last = out.at(-1);
        if (last && last[0].period === l.period) last.push(l);
        else out.push([l]);
      }
      return out;
    };
    content.innerHTML = slides[index]
      .map(
        (c: any) =>
          `<section class="tv-card"><h2>${esc(c.name)}</h2><div class="tv-day">${periods(
            c.entries,
          )
            .map((group) => {
              const first = group[0],
                same = group.every((l) => l.subject === first.subject),
                changed = group.some((l) => l.status !== "base");
              const body = same
                ? `<h3>${esc(first.subject)}${group.length === 1 ? badge(first) : ""}</h3>${group.map((l) => `<p>${details(l)}${group.length > 1 ? badge(l) : ""}</p>`).join("")}`
                : group
                    .map(
                      (l) =>
                        `<h3>${esc(l.subject)}${badge(l)}</h3><p>${details(l)}</p>`,
                    )
                    .join("");
              return `<article class="tv-lesson${changed ? " changed" : ""}"><p class="tv-nr">${first.period}<small>${esc(first.start)}</small></p><div>${body}</div></article>`;
            })
            .join("")}</div></section>`,
      )
      .join("");
    fit();
  }
  // Klasy z dużą liczbą lekcji: zmniejsz czcionkę karty, aż cały dzień się zmieści.
  function fit() {
    content.querySelectorAll<HTMLElement>(".tv-card").forEach((card) => {
      let scale = 1;
      card.style.setProperty("--tv-scale", "1");
      while (card.scrollHeight > card.clientHeight + 1 && scale > 0.6) {
        scale = Math.round((scale - 0.05) * 100) / 100;
        card.style.setProperty("--tv-scale", String(scale));
      }
    });
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
