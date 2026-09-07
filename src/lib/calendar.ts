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
  function monthHTML(date: string, filtered: any[]) {
    const first = date.slice(0, 7) + "-01",
      last = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7), 0))
        .toISOString()
        .slice(0, 10);
    const start = addDays(first, -((dayOf(first) + 6) % 7));
    const count =
      Math.ceil((((dayOf(first) + 6) % 7) + Number(last.slice(8))) / 7) * 7;
    return `<div class="table-wrap" tabindex="0" aria-label="Siatka miesiąca, przewijana poziomo"><div class="calendar-month">${["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz"].map((d) => `<strong>${d}</strong>`).join("")}${Array.from(
      { length: count },
      (_, i) => {
        const d = addDays(start, i);
        return `<div class="calendar-day"><strong>${esc(d.slice(8))}.${esc(d.slice(5, 7))}</strong>${filtered
          .filter((e) => between(e, d, d))
          .map((e) => `<a href="#event-${esc(e.id)}">${esc(e.title)}</a>`)
          .join("")}</div>`;
      },
    ).join("")}</div></div>`;
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
          return `<section class="panel"><h3>${new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(new Date(d))}</h3>${month.map((e) => `<p><a href="#event-${esc(e.id)}">${esc(e.start.slice(8, 10))} · ${esc(e.title)}</a></p>`).join("") || '<p class="meta">Brak wydarzeń</p>'}</section>`;
        },
      ).join("")}</div>`;
    html += `<section class="panel" style="margin-top:20px">${visible.map((e) => `<div id="event-${esc(e.id)}">${eventHTML(e)}</div>`).join("") || '<p class="empty">Brak wydarzeń w wybranym okresie.</p>'}</section>`;
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
