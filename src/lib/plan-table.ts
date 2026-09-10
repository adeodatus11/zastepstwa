import { esc, dateLabel } from "./model.mjs";

const statuses: Record<string, string> = {
  substitution: "Zastępstwo",
  removed: "Zdjęte z planu",
  cancelled: "Lekcja odwołana / później",
  transfer: "Przeniesienie",
  "moved-out": "Przeniesiono",
  "duty-change": "Dyżur zastępczy",
};
const names = (values: string[]) => esc(values.join(", "));
const details = (l: any) =>
  `${statuses[l.status] ? `<strong class="table-status">${statuses[l.status]}</strong>` : ""}${l.payment ? `<span class="table-payment">${esc(l.payment)}</span>` : ""}${l.note ? `<div class="table-note">${esc(l.note)}</div>` : ""}`;
const wrap = (table: string) =>
  `<div class="table-wrap schedule-table-wrap" tabindex="0" role="region" aria-label="Tabela planu, przewijana poziomo">${table}</div>`;

export function timetableHTML(
  days: { date: string; rows: any[] }[],
  periods: any[],
  title: string,
) {
  const entries = days.flatMap((d) => d.rows);
  if (!entries.length) return '<p class="empty">Brak zajęć w tym okresie.</p>';
  // Include empty lessons between the first and last event, so gaps align across days.
  const first = entries.map((l) => l.start).sort()[0];
  const last = entries
    .map((l) => l.end)
    .sort()
    .at(-1)!;
  const slots = new Map<string, any>();
  const key = (l: any) => `${l.period || 0}|${l.start}|${l.end}`;
  for (const p of periods)
    if (p.start >= first && p.start < last)
      slots.set(key({ ...p, period: p.number }), { ...p, period: p.number });
  for (const l of entries) slots.set(key(l), l);
  const sorted = [...slots.values()].sort(
    (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
  );
  return wrap(
    `<table class="timetable"><caption class="visually-hidden">${esc(title)}</caption><thead><tr><th scope="col" class="period-col">Lekcja</th><th scope="col" class="clock-col">Godziny</th>${days.map((d) => `<th scope="col" class="day-heading">${esc(dateLabel(d.date).split(",")[0])}<br><span class="table-date">${esc(d.date.slice(8))}.${esc(d.date.slice(5, 7))}</span></th>`).join("")}</tr></thead><tbody>${sorted
      .map(
        (slot) =>
          `<tr class="${slot.period ? "lesson-row" : "break-row"}"><th scope="row">${slot.period || "Przerwa"}</th><td class="clock-col">${esc(slot.start)}–${esc(slot.end)}</td>${days
            .map((d) => {
              const rows = d.rows.filter((l) => key(l) === key(slot));
              return `<td>${rows.length ? rows.map((l) => `<article class="lesson table-entry ${esc(l.status)}"><strong class="table-subject">${esc(l.subject)}</strong>${l.classNames.length ? `<div>${names(l.classNames)}${l.groupNames.filter((g: string) => g !== "Cała klasa").length ? ` · ${names(l.groupNames.filter((g: string) => g !== "Cała klasa"))}` : ""}</div>` : ""}${l.teacherNames.join(", ") === title ? "" : `<div>${names(l.teacherNames)}</div>`}<div>${l.place ? "Miejsce" : "Sala"}: ${esc(l.roomNames.join(" / "))}</div>${details(l)}</article>`).join("") : '<span class="table-empty" aria-label="Brak zajęć">—</span>'}</td>`;
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
) {
  const lessons = rows.filter((l) => !l.place);
  const dutyTable = duties.length
    ? wrap(
        `<table class="changes-table duty-changes-table"><caption>Zastępstwa dyżurów · ${esc(dateLabel(date))}</caption><thead><tr>${["Godzina", "Miejsce dyżuru", "Nauczyciel nieobecny", "Zastępca", "Uwagi"].map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${duties.map((d) => `<tr><th scope="row">${esc(d.time)}</th><td>${esc(d.place)}</td><td>${esc(d.absentTeacherName)}</td><td><strong>${esc(d.substituteTeacherName || d.rawSubstituteLabel)}</strong></td><td>${esc(d.note || "—")}</td></tr>`).join("")}</tbody></table>`,
      )
    : '<p class="empty">Brak zastępstw dyżurów na ten dzień.</p>';
  if (dutiesOnly) return dutyTable;
  const lessonsTable = lessons.length
    ? wrap(
        `<table class="changes-table"><caption>Zastępstwa i przeniesienia · ${esc(dateLabel(date))}</caption><thead><tr>${["Lekcja / godziny", "Oddział", "Przedmiot", "Nauczyciel", "Sala", "Zmiana / uwagi"].map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${lessons.map((l) => `<tr class="change-row ${esc(l.status)}"><th scope="row">${esc(l.period)}<br>${esc(l.start)}–${esc(l.end)}</th><td>${names(l.classNames)}${l.groupNames.length ? `<br>${names(l.groupNames)}` : ""}</td><td>${esc(l.subject)}</td><td>${names(l.teacherNames)}</td><td>${names(l.roomNames)}</td><td>${details(l)}</td></tr>`).join("")}</tbody></table>`,
      )
    : '<p class="empty">Brak zmian w lekcjach na ten dzień.</p>';
  return lessonsTable + dutyTable;
}
