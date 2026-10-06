import { connect } from "./data";
import {
  today,
  addDays,
  week,
  esc,
  dateLabel,
  dayOf,
  norm,
  eventEndsAfter,
} from "./model.mjs";
import { eventHTML } from "./pages";
export async function init() {
  const get = (id: string) => document.getElementById(id) as HTMLInputElement;
  let events: any[] = [];
  let publication: any;
  let onlyConfirmation = false;
  let limit = 12,
    initial = true;
  get("calendar-date").value = today();
  get("cal-view").value = innerWidth >= 768 ? "month" : "list";
  const between = (e: any, start: string, end: string) =>
    e.start.slice(0, 10) <= end && eventEndsAfter(e, start);
  // Ostatni dzień wydarzenia (włącznie); koniec całodniowy w danych jest wyłączny.
  const lastDay = (e: any) => {
    const startDay = e.start.slice(0, 10);
    if (!e.end) return startDay;
    const endDay = e.end.includes("T")
      ? e.end.slice(0, 10)
      : addDays(e.end.slice(0, 10), -1);
    return endDay < startDay ? startDay : endDay;
  };
  // Kolor wydarzenia: preferowany kolor kategorii, a gdy tego samego dnia
  // jest już wydarzenie w tym kolorze, kolejny wolny z palety.
  const PALETTE_SIZE = 12;
  const CATEGORY_COLOR: Record<string, number> = {
    classification: 0,
    council: 1,
    meeting: 2,
    exam: 3,
    practice: 4,
    holiday: 5,
    general: 6,
  };
  let colors = new Map<string, number>();
  function assignColors(list: any[]) {
    const placed: { start: string; end: string; color: number }[] = [];
    const result = new Map<string, number>();
    [...list]
      .sort(
        (a, b) =>
          a.start.localeCompare(b.start) ||
          lastDay(b).localeCompare(lastDay(a)),
      )
      .forEach((e) => {
        const start = e.start.slice(0, 10),
          end = lastDay(e);
        const preferred = CATEGORY_COLOR[e.category] ?? CATEGORY_COLOR.general;
        const taken = new Set(
          placed
            .filter((o) => o.start <= end && start <= o.end)
            .map((o) => o.color),
        );
        let color = preferred;
        for (let step = 0; step < PALETTE_SIZE; step++) {
          const candidate = (preferred + step) % PALETTE_SIZE;
          if (!taken.has(candidate)) {
            color = candidate;
            break;
          }
        }
        placed.push({ start, end, color });
        result.set(e.id, color);
      });
    return result;
  }
  const colorClass = (e: any) =>
    `ev-c${colors.get(e.id) ?? CATEGORY_COLOR[e.category] ?? 6}`;
  const timeLabel = (e: any) =>
    e.start.includes("T") ? esc(e.start.slice(11, 16)) + " " : "";
  function monthHTML(date: string, filtered: any[]) {
    const first = date.slice(0, 7) + "-01",
      last = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7), 0))
        .toISOString()
        .slice(0, 10);
    const start = addDays(first, -((dayOf(first) + 6) % 7));
    const count =
      Math.ceil((((dayOf(first) + 6) % 7) + Number(last.slice(8))) / 7) * 7;
    const todayDate = today();
    const weeks: string[] = [];
    for (let w = 0; w < count / 7; w++) {
      const weekStart = addDays(start, w * 7),
        weekEnd = addDays(weekStart, 6);
      const inWeek = filtered.filter((e) => between(e, weekStart, weekEnd));
      const multi = inWeek
        .filter((e) => lastDay(e) > e.start.slice(0, 10))
        .sort(
          (a, b) =>
            a.start.localeCompare(b.start) ||
            lastDay(b).localeCompare(lastDay(a)),
        );
      const single = inWeek.filter((e) => !multi.includes(e));
      // Pasy wielodniowe układamy w kolejnych wierszach bez nakładania.
      const lanes: number[] = [];
      const bars = multi.map((e) => {
        const from =
            e.start.slice(0, 10) < weekStart ? weekStart : e.start.slice(0, 10),
          to = lastDay(e) > weekEnd ? weekEnd : lastDay(e);
        const col = (dayOf(from) + 6) % 7,
          span = ((dayOf(to) + 6) % 7) - col + 1;
        let lane = lanes.findIndex((end) => end < col);
        if (lane < 0) lane = lanes.push(-1) - 1;
        lanes[lane] = col + span - 1;
        const cont = `${e.start.slice(0, 10) < weekStart ? " continues-before" : ""}${lastDay(e) > weekEnd ? " continues-after" : ""}`;
        return `<a class="calendar-bar ${colorClass(e)}${cont}" style="grid-column:${col + 1} / span ${span};grid-row:${lane + 2}" href="#event-${esc(e.id)}" title="${esc(e.title)}">${esc(e.title)}</a>`;
      });
      const rows = lanes.length + 2;
      const cells = Array.from({ length: 7 }, (_, i) => {
        const d = addDays(weekStart, i);
        const classes = `calendar-day${d.slice(0, 7) !== first.slice(0, 7) ? " other-month" : ""}${d === todayDate ? " today" : ""}`;
        const events = single
          .filter((e) => between(e, d, d))
          .sort((a, b) => a.start.localeCompare(b.start))
          .map(
            (e) =>
              `<a class="calendar-chip ${colorClass(e)}" href="#event-${esc(e.id)}" title="${esc(e.title)}">${timeLabel(e)}${esc(e.title)}</a>`,
          )
          .join("");
        return `<div class="${classes}" style="grid-column:${i + 1};grid-row:1 / span ${rows}"></div><strong class="calendar-date" style="grid-column:${i + 1};grid-row:1">${esc(d.slice(8))}.${esc(d.slice(5, 7))}</strong><div class="calendar-chips" style="grid-column:${i + 1};grid-row:${rows}">${events}</div>`;
      }).join("");
      weeks.push(`<div class="calendar-week">${cells}${bars.join("")}</div>`);
    }
    return `<div class="table-wrap" tabindex="0" aria-label="Siatka miesiąca, przewijana poziomo"><div class="calendar-month"><div class="calendar-month-head">${["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz"].map((d) => `<strong>${d}</strong>`).join("")}</div>${weeks.join("")}</div></div><p class="meta calendar-legend">Każde wydarzenie danego dnia ma inny kolor. Wydarzenia wielodniowe (np. praktyki, ferie) są pokazane jako jeden pasek.</p>`;
  }
  function render() {
    if (!publication) return;
    const date = get("calendar-date").value || today(),
      view = get("cal-view").value,
      category = get("category").value;
    const filtered = events.filter(
      (e) =>
        (category === "all" || e.category === category) &&
        (!onlyConfirmation || e.extendedProps?.needsConfirmation) &&
        norm(e.title + " " + (e.extendedProps?.description || "")).includes(
          norm(get("event-search").value),
        ),
    );
    let start = date,
      end = publication.calendarTo;
    if (view === "day") end = date;
    if (view === "week") {
      start = week(date)[0];
      end = addDays(start, 6);
    }
    if (view === "month") {
      start = date.slice(0, 7) + "-01";
      end = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7), 0))
        .toISOString()
        .slice(0, 10);
    }
    if (view === "year") {
      start = publication.calendarFrom;
      end = publication.calendarTo;
    }
    const list = filtered.filter((e) => between(e, start, end));
    const visible = view === "list" ? list.slice(0, limit) : list;
    let html = `<h2 style="margin:24px 0 16px">${view === "year" ? "Rok szkolny " + publication.schoolYear : esc(dateLabel(start))}</h2>`;
    if (view === "month") html += monthHTML(date, filtered);
    if (view === "year")
      html += `<div class="calendar-year">${Array.from(
        { length: 12 },
        (_, i) => {
          const d = new Date(
            Date.UTC(
              +publication.calendarFrom.slice(0, 4),
              +publication.calendarFrom.slice(5, 7) - 1 + i,
              1,
            ),
          )
            .toISOString()
            .slice(0, 10);
          const month = filtered.filter(
            (e) => e.start.slice(0, 7) === d.slice(0, 7),
          );
          return `<section class="panel"><h3>${new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(new Date(d))}</h3>${month.map((e) => `<p><a class="calendar-year-item ${colorClass(e)}" href="#event-${esc(e.id)}">${esc(e.start.slice(8, 10))} · ${esc(e.title)}</a></p>`).join("") || '<p class="meta">Brak wydarzeń</p>'}</section>`;
        },
      ).join("")}</div>`;
    html += `<section class="panel" style="margin-top:20px">${visible.map((e) => `<div id="event-${esc(e.id)}" class="calendar-entry ${colorClass(e)}">${eventHTML(e)}</div>`).join("") || '<p class="empty">Brak wydarzeń w wybranym okresie.</p>'}</section>`;
    if (view === "list" && list.length > limit)
      html += `<button id="more-events" style="margin-top:16px">Pokaż kolejne wydarzenia (${list.length - limit})</button>`;
    get("calendar").innerHTML = html;
    get("more-events")?.addEventListener("click", () => {
      limit += 12;
      render();
    });
  }
  await connect(["calendar"], (d, m) => {
    publication = m;
    events = d.calendar;
    colors = assignColors(events);
    if (initial && location.hash.startsWith("#event-")) {
      const e = events.find((e) => "#event-" + e.id === location.hash);
      if (e) {
        get("calendar-date").value = e.start.slice(0, 10);
        get("cal-view").value = "list";
      }
    }
    render();
    if (initial && location.hash) {
      document
        .getElementById(decodeURIComponent(location.hash.slice(1)))
        ?.scrollIntoView();
    }
    initial = false;
  });
  get("event-search").oninput = () => {
    limit = 12;
    render();
  };
  get("confirmation-only").onclick = () => {
    onlyConfirmation = !onlyConfirmation;
    get("confirmation-only").setAttribute(
      "aria-pressed",
      String(onlyConfirmation),
    );
    limit = 12;
    render();
  };
  for (const id of ["calendar-date", "category", "cal-view"])
    get(id).onchange = () => {
      limit = 12;
      render();
    };
  get("cal-today").onclick = () => {
    get("calendar-date").value = today();
    render();
  };
  for (const [id, dir] of [
    ["cal-prev", -1],
    ["cal-next", 1],
  ] as const)
    get(id).onclick = () => {
      let date = get("calendar-date").value,
        view = get("cal-view").value;
      if (["month", "year"].includes(view)) {
        const d = new Date(date + "T12:00:00Z");
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() + dir * (view === "year" ? 12 : 1));
        date = d.toISOString().slice(0, 10);
      } else date = addDays(date, dir * (view === "week" ? 7 : 1));
      get("calendar-date").value = date;
      render();
    };
}
