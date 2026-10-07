import { esc, dateLabel } from "./model.mjs";

const statuses: Record<string, string> = {
  substitution: "Zastępstwo",
  removed: "Zdjęte z planu",
  cancelled: "Lekcja odwołana / później",
  transfer: "Przeniesienie",
  "moved-out": "Przeniesiono",
  "duty-change": "Dyżur zastępczy",
};
// Zamienia nazwę nauczyciela, oddziału, sali lub miejsca dyżuru na odnośnik
// do jej planu. Domyślnie zwraca sam tekst.
export type Linker = (
  kind: "teacher" | "class" | "room" | "duty",
  name: string,
) => string;
const plain: Linker = (_kind, name) => esc(name);
const names = (values: string[]) => esc(values.join(", "));
const links = (
  link: Linker,
  kind: Parameters<Linker>[0],
  values: string[],
  separator = ", ",
) => values.map((v) => link(kind, v)).join(separator);
const details = (l: any) =>
  `${statuses[l.status] ? `<strong class="table-status">${statuses[l.status]}</strong>` : ""}${l.payment ? `<span class="table-payment">${esc(l.payment)}</span>` : ""}${l.note ? `<div class="table-note">${esc(l.note)}</div>` : ""}`;
const wrap = (table: string) =>
  `<div class="table-wrap schedule-table-wrap" tabindex="0" role="region" aria-label="Tabela planu, przewijana poziomo">${table}</div>`;

export function timetableHTML(
  days: { date: string; rows: any[] }[],
  periods: any[],
  title: string,
  link: Linker = plain,
) {
  const entries = days.flatMap((d) => d.rows);
  if (!entries.length) return '<p class="empty">Brak zajęć w tym okresie.</p>';
  // Include empty lessons between the first and last event, so gaps align across days.
  const orderedPeriods = [...periods].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  const dutyPeriod = (d: any) =>
    orderedPeriods.filter((p) => p.end <= d.start).at(-1) || orderedPeriods[0];
  const first = entries
    .map((l) => (l.period ? l.start : dutyPeriod(l)?.start || l.start))
    .sort()[0];
  const last = entries
    .map((l) => l.end)
    .sort()
    .at(-1)!;
  const slots = new Map<string, any>();
  const key = (l: any) => `${l.period || 0}|${l.start}|${l.end}`;
  for (const p of periods)
    if (p.start >= first && p.start < last)
      slots.set(key({ ...p, period: p.number }), { ...p, period: p.number });
  for (const l of entries) if (l.period) slots.set(key(l), l);
  for (const l of entries.filter((l) => !l.period)) {
    const p = dutyPeriod(l);
    if (p)
      slots.set(key({ ...p, period: p.number }), { ...p, period: p.number });
  }
  // Pomija nazwę oddziału, nauczyciela lub sali, której plan właśnie oglądamy.
  const entry = (l: any) => {
    const groups = l.groupNames.filter((g: string) => g !== "Cała klasa");
    const classes = [
      l.classNames.join(", ") === title
        ? ""
        : links(link, "class", l.classNames),
      names(groups),
    ].filter(Boolean);
    const rooms = l.roomNames.join(" / ");
    return `<article class="lesson table-entry ${esc(l.status)}"><strong class="table-subject">${esc(l.subject)}</strong>${classes.length ? `<div>${classes.join(" · ")}</div>` : ""}${l.teacherNames.join(", ") === title ? "" : `<div>${links(link, "teacher", l.teacherNames)}</div>`}${rooms === title ? "" : `<div>${l.place ? "Miejsce" : "Sala"}: ${links(link, l.place ? "duty" : "room", l.roomNames, " / ")}</div>`}${details(l)}</article>`;
  };
  const sorted = [...slots.values()].sort(
    (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
  );
  return wrap(
    `<table class="timetable"><caption class="visually-hidden">${esc(title)}</caption><thead><tr><th scope="col" class="period-col">Lekcja</th><th scope="col" class="clock-col">Godziny</th>${days.map((d) => `<th scope="col" class="day-heading">${esc(dateLabel(d.date).split(",")[0])}<br><span class="table-date">${esc(d.date.slice(8))}.${esc(d.date.slice(5, 7))}</span></th>`).join("")}</tr></thead><tbody>${sorted
      .map(
        (slot) =>
          `<tr class="lesson-row"><th scope="row">${slot.period}</th><td class="clock-col">${esc(slot.start)}–${esc(slot.end)}</td>${days
            .map((d) => {
              const rows = d.rows.filter((l) => key(l) === key(slot));
              const duties = d.rows.filter((l) => {
                const p = dutyPeriod(l);
                return (
                  !l.period &&
                  p &&
                  key({ ...p, period: p.number }) === key(slot)
                );
              });
              const chips = (before: boolean) =>
                duties
                  .filter((l) => l.start < slot.start === before)
                  .map(
                    (l) =>
                      `<aside class="break-chip ${esc(l.status)}"><strong>${esc(l.start)}–${esc(l.end)} · ${l.status === "duty-change" ? "Zastępstwo dyżuru" : l.status === "removed" ? "Dyżur zdjęty" : "Dyżur"}</strong><span>${l.place ? link("duty", l.place) : links(link, "room", l.roomNames, " / ")}${l.teacherNames.join(", ") === title ? "" : ` · ${links(link, "teacher", l.teacherNames)}`}</span>${l.note ? `<span>${esc(l.note)}</span>` : ""}</aside>`,
                  )
                  .join("");
              return `<td>${chips(true)}${rows.length ? rows.map(entry).join("") : '<span class="table-empty" aria-label="Brak zajęć">—</span>'}${chips(false)}</td>`;
            })
            .join("")}</tr>`,
      )
      .join("")}</tbody></table>`,
  );
}

export function changesHTML(
  rows: any[],
  duties: any[],
  date: string,
  dutiesOnly = false,
  link: Linker = plain,
) {
  const lessons = rows.filter((l) => !l.place);
  const dutyTable = duties.length
    ? wrap(
        `<table class="changes-table duty-changes-table"><caption>Zastępstwa dyżurów · ${esc(dateLabel(date))}</caption><thead><tr>${["Godzina", "Miejsce dyżuru", "Nauczyciel nieobecny", "Zastępca", "Uwagi"].map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${duties.map((d) => `<tr><th scope="row">${esc(d.time)}</th><td>${link("duty", d.place)}</td><td>${link("teacher", d.absentTeacherName)}</td><td><strong>${link("teacher", d.substituteTeacherName || d.rawSubstituteLabel)}</strong></td><td>${esc(d.note || "—")}</td></tr>`).join("")}</tbody></table>`,
      )
    : '<p class="empty">Brak zastępstw dyżurów na ten dzień.</p>';
  if (dutiesOnly) return dutyTable;
  const lessonsTable = lessons.length
    ? wrap(
        `<table class="changes-table"><caption>Zastępstwa i przeniesienia · ${esc(dateLabel(date))}</caption><thead><tr>${["Lekcja / godziny", "Oddział", "Przedmiot", "Nauczyciel", "Sala", "Zmiana / uwagi"].map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${lessons.map((l) => `<tr class="change-row ${esc(l.status)}"><th scope="row">${esc(l.period)}<br>${esc(l.start)}–${esc(l.end)}</th><td>${links(link, "class", l.classNames)}${l.groupNames.length ? `<br>${names(l.groupNames)}` : ""}</td><td>${esc(l.subject)}</td><td>${links(link, "teacher", l.teacherNames)}</td><td>${links(link, "room", l.roomNames)}</td><td>${details(l)}</td></tr>`).join("")}</tbody></table>`,
      )
    : '<p class="empty">Brak zmian w lekcjach na ten dzień.</p>';
  return lessonsTable + dutyTable;
}

export function otherActivitiesHTML(entries: any[], link: Linker = plain) {
  if (!entries.length) return "";
  return wrap(
    `<table class="changes-table"><caption>Zmiany zajęć innych</caption><thead><tr>${["Data / godziny", "Nauczyciel", "Zajęcia", "Sala", "Informacja"].map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${entries.map((e) => `<tr><th scope="row">${esc(dateLabel(e.date))}<br>${esc(e.time)}</th><td>${link("teacher", e.absentTeacherName)}</td><td>${esc(e.subject)}</td><td>${link("room", e.room)}</td><td>${esc(e.message === "-" ? "Nie wskazano zastępcy" : e.message)}${e.note ? `<br>${esc(e.note)}` : ""}</td></tr>`).join("")}</tbody></table>`,
  );
}
