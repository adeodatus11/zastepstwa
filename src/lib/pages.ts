import { connect } from "./data";
import { ics } from "./ics.mjs";
import {
  today,
  dayOf,
  addDays,
  dateLabel,
  esc,
  norm,
  upcoming,
  week,
  DAYS,
} from "./model.mjs";
const get = (id: string) => document.getElementById(id)!;
function contact(e: any) {
  return `<article class="row"><p class="event-date">${esc(e.start)}–${esc(e.end)}</p><h3 class="contact-name">${esc(e.name)}</h3>${e.role ? `<p class="muted">${esc(e.role)}</p>` : ""}<div class="contact-actions"><a class="button" href="tel:${esc((e.phone.startsWith("+") ? e.phone : "+48" + e.phone).replace(/[^+\d]/g, ""))}${e.extension ? "," + esc(e.extension) : ""}">Zadzwoń</a>${e.extension ? `<span>wew. <strong>${esc(e.extension)}</strong></span>` : ""}</div></article>`;
}
function specialists(data: any) {
  return data.specjalisci.flatMap((p: any) =>
    Object.entries(p.godziny).map(([day, hours]) => {
      const [start, end] = String(hours).split("-");
      return {
        day: +day,
        start: start.padStart(5, "0"),
        end: end.padStart(5, "0"),
        name: p.imieNazwisko,
        role: p.rola,
        phone: data.telefon,
        extension: p.wewnetrzny,
      };
    }),
  );
}
// Wpisy nadzoru mają konkretną datę; grafik specjalistów powtarza się co tydzień.
const onDate = (e: any, date: string) =>
  e.date ? e.date === date : e.day === dayOf(date);
const shortDate = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;
function current(entries: any[], validity?: any) {
  if (validity && today() > validity.validTo)
    return `<p class="notice">Grafik obowiązywał do ${esc(validity.validTo)}. Oczekujemy na aktualizację.</p>`;
  const date = today(),
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  const active = entries.filter(
    (e) =>
      onDate(e, date) &&
      e.start <= parts &&
      e.end > parts &&
      (!validity || date >= validity.validFrom),
  );
  if (active.length) return active.map(contact).join("");
  for (let i = 0; i < 8; i++) {
    const next = addDays(date, i),
      item = entries
        .filter((e) => onDate(e, next) && (i > 0 || e.start > parts))
        .sort((a, b) => a.start.localeCompare(b.start))[0];
    if (
      item &&
      (!validity || (next >= validity.validFrom && next <= validity.validTo))
    )
      return `<p class="meta">Najbliższy dyżur · ${esc(dateLabel(next))}</p>${contact(item)}`;
  }
  return '<p class="empty">Brak zaplanowanych dyżurów.</p>';
}
export function eventHTML(e: any) {
  const confirm = e.extendedProps?.needsConfirmation;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates:
      e.start.replace(/[-:]/g, "") +
      "/" +
      (e.end || addDays(e.start.slice(0, 10), 1)).replace(/[-:]/g, ""),
    ctz: "Europe/Warsaw",
  });
  return `<article class="row" id="${esc(e.id)}"><p class="event-date">${esc(dateLabel(e.start.slice(0, 10)))}${e.start.includes("T") ? " · " + esc(e.start.slice(11, 16)) : ""}</p><h3>${esc(e.title)}</h3>${confirm ? '<p><span class="badge warning">Termin do potwierdzenia</span></p>' : ""}<details class="event-details"><summary>Szczegóły wydarzenia</summary><p class="meta">${esc(e.extendedProps?.description || "")}</p><a class="button" style="margin-top:12px" href="https://calendar.google.com/calendar/render?${esc(params.toString())}" target="_blank" rel="noopener">Dodaj do kalendarza ↗</a> <a class="button" style="margin-top:12px" href="data:text/calendar;charset=utf-8,${encodeURIComponent(ics(e))}" download="${esc(e.id)}.ics">Apple / Outlook (.ics)</a></details></article>`;
}
export async function init(page: string) {
  if (page === "index") {
    await connect(["calendar", "contacts"], (d) => {
      get("home-calendar").innerHTML =
        upcoming(d.calendar, today())
          .map(
            (e: any) =>
              `<a class="row link-row" href="/calendar-2026-2027.html#event-${esc(e.id)}"><p class="event-date">${esc(dateLabel(e.start.slice(0, 10)))}${e.start.includes("T") ? " · " + esc(e.start.slice(11, 16)) : ""}</p><h3>${esc(e.title)}</h3></a>`,
          )
          .join("") || '<p class="empty">Brak nadchodzących wydarzeń.</p>';
      get("home-duty").innerHTML =
        "<h3>Kadra kierownicza</h3>" +
        current(d.contacts.supervision, d.contacts) +
        '<h3 style="margin-top:20px">Pomoc psychologiczno-pedagogiczna</h3>' +
        current(specialists(d.contacts.specialists));
    });
    return;
  }
  if (page === "wykaz-podzialow-grup") {
    let plan: any;
    let teacherView = false;
    const sel = get("group-class") as HTMLSelectElement,
      search = get("group-search") as HTMLInputElement;
    function options() {
      if (!plan) return;
      const old = sel.value;
      sel.innerHTML = Object.entries(plan.classes)
        .filter(([, n]) => norm(n).includes(norm(search.value)))
        .sort((a, b) => String(a[1]).localeCompare(String(b[1]), "pl"))
        .map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`)
        .join("");
      if (plan.classes[old] && [...sel.options].some((o) => o.value === old))
        sel.value = old;
    }
    function render() {
      if (!plan) return;
      const name = plan.classes[sel.value];
      if (!name) {
        get("groups").innerHTML =
          '<p class="empty">Nie znaleziono oddziału.</p>';
        return;
      }
      const lessons = plan.lessons.filter((l: any) =>
        l.classNames.includes(name),
      );
      const entries = new Map<string, Set<string>>();
      for (const l of lessons) {
        const key = l.groupNames.join(", ") || "Cały oddział";
        if (!entries.has(key)) entries.set(key, new Set());
        entries.get(key)!.add(`${l.subject} — ${l.teacherNames.join(", ")}`);
      }
      const teacherRows = new Map<string, Set<string>>();
      for (const l of lessons)
        for (const t of l.teacherNames) {
          if (!teacherRows.has(t)) teacherRows.set(t, new Set());
          teacherRows.get(t)!.add(l.subject);
        }
      const copyText = [...teacherRows]
        .sort((a, b) => a[0].localeCompare(b[0], "pl"))
        .map(([name, subjects]) => name + " — " + [...subjects].join("; "))
        .join("\n");
      let groupsHTML = `<div class="panel-heading"><h2>${esc(name)}</h2><a class="button" href="/plan.html?type=class&id=${encodeURIComponent(sel.value)}">Otwórz plan oddziału →</a></div><div class="grid two">${[
        ...entries,
      ]
        .map(
          ([group, rows]) =>
            `<section class="panel"><h3>${esc(group)}</h3>${[...rows]
              .sort((a, b) => a.localeCompare(b, "pl"))
              .map((row) => `<p class="row">${esc(row)}</p>`)
              .join("")}</section>`,
        )
        .join("")}</div>`;
      const head = `<div class="actions" style="margin-bottom:20px"><button id="groups-view" aria-pressed="${!teacherView}">Podziały na grupy</button><button id="teachers-view" aria-pressed="${teacherView}">Nauczyciele oddziału</button></div>`;
      if (teacherView)
        groupsHTML = `<section class="panel"><div class="panel-heading"><h2>Nauczyciele oddziału ${esc(name)}</h2><button id="copy-teachers">Kopiuj listę</button></div><p id="copy-status" role="status"></p>${[
          ...teacherRows,
        ]
          .sort((a, b) => a[0].localeCompare(b[0], "pl"))
          .map(
            ([name, subjects]) =>
              `<article class="row"><h3>${esc(name)}</h3><p>${esc([...subjects].join("; "))}</p></article>`,
          )
          .join(
            "",
          )}<details class="event-details"><summary>Instrukcje VULCAN</summary><a class="button" href="https://www.bazawiedzy.vulcan.edu.pl/bazawiedzy.php/show/23" target="_blank" rel="noopener">Dziennik oddziału ↗</a> <a class="button" href="https://www.bazawiedzy.vulcan.edu.pl/bazawiedzy.php/show/6" target="_blank" rel="noopener">Przedmioty w dzienniku ↗</a></details></section>`;
      get("groups").innerHTML = head + groupsHTML;
      get("groups-view").onclick = () => {
        teacherView = false;
        render();
      };
      get("teachers-view").onclick = () => {
        teacherView = true;
        render();
      };
      get("copy-teachers")?.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(copyText);
          get("copy-status").textContent = "Skopiowano listę.";
        } catch {
          get("copy-status").textContent =
            "Nie udało się skopiować. Zaznacz tekst listy i skopiuj ręcznie.";
        }
      });
    }
    await connect(["plan"], (d) => {
      plan = d.plan;
      options();
      render();
    });
    search.oninput = () => {
      options();
      render();
    };
    sel.onchange = render;
    return;
  }
  let data: any;
  const supervision = page === "dyzury-nadzoru";
  const sel = get("contact-day") as HTMLSelectElement;
  // W weekend pokazujemy nadchodzący tydzień.
  const thisMonday = () => {
    const d = today();
    return week(dayOf(d) === 6 || dayOf(d) === 0 ? addDays(d, 2) : d)[0];
  };
  let monday = thisMonday();
  const todayDay = dayOf(today());
  sel.value =
    innerWidth >= 768 || todayDay < 1 || todayDay > 5
      ? "all"
      : String(todayDay);
  function render() {
    if (!data) return;
    const dates = week(monday);
    get("contact-week").textContent =
      `${shortDate(dates[0])} – ${shortDate(dates[4])}.${dates[4].slice(0, 4)}`;
    get("contact-this-week").hidden = monday === thisMonday();
    const printHeading = document.getElementById("print-heading");
    if (printHeading)
      printHeading.innerHTML = `<h1>Dyżury kadry kierowniczej – ZSZ5</h1><p>Tydzień ${esc(get("contact-week").textContent)}</p><small>Wydruk z dnia ${shortDate(today())}.${today().slice(0, 4)}</small>`;
    const all = supervision ? data.supervision : specialists(data.specialists);
    const entries = all.filter((e: any) => !e.date || dates.includes(e.date));
    get("contacts-current").innerHTML =
      "<h2>Aktualny lub najbliższy dyżur</h2>" +
      current(all, supervision ? data : undefined);
    const days = sel.value === "all" ? [1, 2, 3, 4, 5] : [+sel.value];
    const weekly = sel.value === "all";
    get("contacts").className = weekly ? "contacts-week-wrap" : "grid two";
    if (supervision && !entries.length) {
      get("contacts").innerHTML =
        `<section class="panel"><p class="notice">Brak grafiku dyżurów kadry kierowniczej na tydzień ${esc(get("contact-week").textContent)}.</p></section>`;
      return;
    }
    const notice = (day: number) =>
      supervision && data.notes?.[dates[day - 1]]
        ? `<p class="notice">${esc(data.notes[dates[day - 1]])}</p>`
        : "";
    const list = (day: number) =>
      entries
        .filter((e: any) => e.day === day)
        .sort(
          (a: any, b: any) =>
            a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
        )
        .map(contact)
        .join("") || '<p class="empty">Brak dyżuru.</p>';
    const heading = (day: number) =>
      `${DAYS[day]} <span class="muted">${shortDate(dates[day - 1])}</span>`;
    if (weekly) {
      get("contacts").innerHTML =
        `<table class="contacts-week"><caption>${supervision ? "Dyżury kadry kierowniczej" : "Pomoc psychologiczno-pedagogiczna"} · ${esc(get("contact-week").textContent)}</caption><thead><tr>${days.map((day) => `<th scope="col"${dates[day - 1] === today() ? ' class="today"' : ""}>${heading(day)}</th>`).join("")}</tr></thead><tbody><tr>${days.map((day) => `<td>${notice(day)}${list(day)}</td>`).join("")}</tr></tbody></table>`;
      return;
    }
    get("contacts").innerHTML = days
      .map(
        (day) =>
          `<section class="panel"><h2 style="text-transform:capitalize;margin-bottom:16px">${heading(day)}</h2>${notice(day)}${list(day)}</section>`,
      )
      .join("");
  }
  const move = (weeks: number) => {
    monday = addDays(monday, weeks * 7);
    render();
  };
  get("contact-prev").onclick = () => move(-1);
  get("contact-next").onclick = () => move(1);
  get("contact-this-week").onclick = () => {
    monday = thisMonday();
    render();
  };
  await connect(["contacts"], (d) => {
    data = d.contacts;
    render();
  });
  sel.onchange = render;
  // Druk: zawsze cały tydzień (A4 poziomo); po wydruku wracamy do wybranego dnia.
  let dayBeforePrint: string | null = null;
  const beforePrint = () => {
    if (!supervision || sel.value === "all") return;
    dayBeforePrint = sel.value;
    sel.value = "all";
    render();
  };
  addEventListener("beforeprint", beforePrint);
  addEventListener("afterprint", () => {
    if (dayBeforePrint === null) return;
    sel.value = dayBeforePrint;
    dayBeforePrint = null;
    render();
  });
  const printButton = document.getElementById("contact-print");
  if (printButton)
    printButton.onclick = () => {
      beforePrint();
      print();
    };
}
