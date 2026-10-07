import {
  timetableHTML,
  changesHTML,
  otherActivitiesHTML,
  type Linker,
} from "./plan-table";
import { validDate } from "./schema.mjs";
import { connect } from "./data";
import {
  daily,
  today,
  addDays,
  week,
  selected,
  esc,
  norm,
  dateLabel,
} from "./model.mjs";
export const labels: Record<string, string> = {
  base: "",
  substitution: "Zastępstwo",
  removed: "Zdjęte z planu",
  cancelled: "Lekcja odwołana / później",
  transfer: "Przeniesienie",
  "moved-out": "Przeniesiono",
  duty: "Dyżur",
  "duty-change": "Dyżur zastępczy",
};
export function lessonHTML(l: any) {
  return `<article class="lesson ${esc(l.status)}"><div class="time">${l.period ? `Lekcja ${l.period} · ` : ""}${esc(l.start)}–${esc(l.end)}</div>${labels[l.status] ? `<span class="badge">${labels[l.status]}</span>` : ""}${l.payment ? `<span class="badge warning">${esc(l.payment)}</span>` : ""}<h3>${esc(l.subject)}</h3><div class="details">${esc(l.classNames.join(", "))}${l.groupNames.length ? ` · ${esc(l.groupNames.join(", "))}` : ""}</div><div class="details">${esc(l.teacherNames.join(", "))}</div><div class="details">${l.place ? "Miejsce" : "Sala"}: ${esc(l.roomNames.join(" / ") || "—")}</div>${l.note ? `<p class="meta">${esc(l.note)}</p>` : ""}</article>`;
}
export async function init() {
  const get = (id: string) => document.getElementById(id) as HTMLInputElement;
  const disclosure =
    document.querySelector<HTMLDetailsElement>(".selector-details")!;
  disclosure.open = innerWidth >= 1200;
  const q = new URLSearchParams(location.search),
    page = document.getElementById("app")!.dataset.page;
  if (!q.has("mode") && page === "zastepstwa") q.set("mode", "changes");
  if (!q.has("mode") && page?.startsWith("plan-lekcji")) q.set("mode", "base");
  if (!q.has("type") && page?.startsWith("sale-")) q.set("type", "room");
  try {
    if (!q.has("type") && !location.hash) {
      const saved = new URLSearchParams(
        sessionStorage.getItem("plan-context") || "",
      );
      for (const [k, v] of saved) if (!q.has(k)) q.set(k, v);
    }
  } catch {}
  let type = q.get("type") || (page?.startsWith("sale-") ? "room" : "teacher"),
    id = q.get("id") || "",
    date = validDate(q.get("date")) ? q.get("date")! : today(),
    mode =
      q.get("mode") || (page?.startsWith("plan-lekcji") ? "base" : "changes"),
    view = q.get("view") || (innerWidth >= 1200 ? "week" : "day"),
    list = ["changes", "duties"].includes(q.get("list") || ""),
    dutiesOnly = q.get("list") === "duties";
  let plan: any, changes: any, pub: any;
  let lookup: Record<string, Map<string, string>> | null = null;
  // Nazwy z planu i arkuszy zmian → identyfikatory, żeby każdą osobę, oddział,
  // salę i miejsce dyżuru dało się otworzyć jednym kliknięciem.
  function targets() {
    const map = (pairs: [string, string][]) =>
      new Map(pairs.map(([name, value]) => [norm(name), value]));
    const kinds = {
      teacher: map(
        Object.values(plan.teachers).map((t: any) => [t.name, t.id]),
      ),
      class: map(Object.entries(plan.classes).map(([v, n]) => [String(n), v])),
      room: map(Object.entries(plan.rooms).map(([v, n]) => [String(n), v])),
      duty: map(plan.duties.map((d: any) => [d.place, d.place])),
    } as Record<string, Map<string, string>>;
    for (const [name, alias] of Object.entries(plan.aliases || {}) as [
      string,
      any,
    ][])
      if (kinds[alias.type] && !kinds[alias.type].has(norm(name)))
        kinds[alias.type].set(norm(name), alias.id);
    return kinds;
  }
  const link: Linker = (kind, name) => {
    const target = lookup?.[kind]?.get(norm(name));
    if (!target || (kind === type && target === id && !list)) return esc(name);
    const params = new URLSearchParams({ type: kind, id: target, date, mode });
    params.set("view", view);
    return `<a class="plan-link" href="?${params}">${esc(name)}</a>`;
  };
  const entityName = () =>
    type === "teacher"
      ? plan.teachers[id]?.name
      : type === "duty"
        ? id
        : (type === "class" ? plan.classes : plan.rooms)[id];
  function printHeading(dates: string[]) {
    const heading = document.getElementById("plan-print-heading");
    if (!heading) return;
    const name = entityName() || "";
    const title = list
      ? dutiesOnly
        ? "Zastępstwa dyżurów"
        : "Zmiany w szkole"
      : type === "teacher"
        ? `Plan nauczyciela: ${name}`
        : type === "class"
          ? `Plan oddziału ${name}`
          : type === "room"
            ? `Plan sali ${name}`
            : `Miejsce dyżurowania: ${name}`;
    const short = (d: string) => `${d.slice(8)}.${d.slice(5, 7)}`;
    const when =
      dates.length > 1
        ? `Tydzień ${short(dates[0])}–${short(dates.at(-1)!)}.${dates[0].slice(0, 4)}`
        : `${dateLabel(dates[0])} ${dates[0].slice(0, 4)}`;
    const version = list
      ? ""
      : mode === "base"
        ? " · plan bazowy"
        : " · plan ze zmianami";
    const now = today();
    heading.innerHTML = `<p class="print-title">${esc(title)}</p><p>${esc(when)}${version}</p><small>ZSZ5 Szkoła Mistrzów · wydruk z dnia ${short(now)}.${now.slice(0, 4)}</small>`;
  }
  get("entity-type").value = type;
  get("date").value = date;
  get("mode").value = mode;
  function options() {
    if (!plan) return;
    let items: [string, string][] =
      type === "teacher"
        ? Object.values(plan.teachers).map((t: any) => [t.id, t.name])
        : type === "duty"
          ? [...new Set(plan.duties.map((d: any) => d.place))].map((p) => [
              String(p),
              String(p),
            ])
          : Object.entries(type === "class" ? plan.classes : plan.rooms);
    items = items
      .filter(([, n]) => norm(n).includes(norm(get("search").value)))
      .sort((a, b) => a[1].localeCompare(b[1], "pl"));
    get("entity").innerHTML = items
      .map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`)
      .join("");
    if (!items.some(([v]) => v === id)) id = items[0]?.[0] || "";
    get("entity").value = id;
    get("favorite").hidden = type !== "teacher";
  }
  function render() {
    if (!plan) return;
    date = get("date").value || today();
    mode = get("mode").value;
    const params = new URLSearchParams({ type, id, date, mode, view });
    if (list) params.set("list", dutiesOnly ? "duties" : "changes");
    history.replaceState(null, "", `${location.pathname}?${params}`);
    try {
      const context = new URLSearchParams({ type, id, date, mode, view });
      sessionStorage.setItem("plan-context", context.toString());
    } catch {}
    get("selection-title").textContent = list
      ? dutiesOnly
        ? "Zastępstwa dyżurów"
        : "Zmiany w szkole"
      : type === "teacher"
        ? plan.teachers[id]?.name || "Brak wyników"
        : type === "duty"
          ? id
          : (type === "class" ? plan.classes : plan.rooms)[id] ||
            "Brak wyników";
    get("selector-summary").textContent =
      "Wybierz plan · " +
      (type === "teacher"
        ? plan.teachers[id]?.name || "brak wyników"
        : type === "duty"
          ? id
          : (type === "class" ? plan.classes : plan.rooms)[id] ||
            "brak wyników");
    for (const v of ["day", "week"])
      get(v).setAttribute("aria-pressed", String(view === v && !list));
    get("changes").setAttribute("aria-pressed", String(list && !dutiesOnly));
    get("duty-changes").setAttribute(
      "aria-pressed",
      String(list && dutiesOnly),
    );
    get("prev").setAttribute(
      "aria-label",
      view === "week" && !list ? "Poprzedni tydzień" : "Poprzedni dzień",
    );
    get("next").setAttribute(
      "aria-label",
      view === "week" && !list ? "Następny tydzień" : "Następny dzień",
    );
    get("validity").innerHTML =
      date < pub.validFrom || date > pub.validTo
        ? `<p class="notice">Wybrana data jest poza okresem obowiązywania planu (${esc(pub.validFrom)} – ${esc(pub.validTo)}). Nie wyświetlamy nieaktualnego rozkładu.</p>`
        : '<p class="meta" style="margin:16px 0">Plan obowiązuje od ' +
          esc(pub.validFrom) +
          " do " +
          esc(pub.validTo) +
          "</p>";
    const dates = list ? [date] : view === "week" ? week(date) : [date];
    printHeading(dates);
    const days = dates.map((d) => ({
      date: d,
      rows:
        d < pub.validFrom || d > pub.validTo
          ? []
          : daily(plan, changes, d, list ? "changes" : mode).filter((l: any) =>
              list
                ? !["base", "duty", "removed", "moved-out"].includes(l.status)
                : selected(l, type, id, plan),
            ),
    }));
    get("schedule").innerHTML = list
      ? changesHTML(
          days[0].rows,
          date < pub.validFrom || date > pub.validTo
            ? []
            : changes.dutyChanges.filter((d: any) => d.date === date),
          date,
          dutiesOnly,
          link,
        )
      : timetableHTML(
          days,
          plan.periods,
          get("selection-title").textContent || "Plan lekcji",
          link,
        );
    if (!dutiesOnly || !list) {
      const other = (changes.otherActivities || []).filter(
        (e: any) =>
          dates.includes(e.date) &&
          e.date >= pub.validFrom &&
          e.date <= pub.validTo &&
          (list || (type === "teacher" && e.absentTeacherId === id)),
      );
      get("schedule").innerHTML += otherActivitiesHTML(other, link);
    }
  }
  await connect(["plan", "changes"], (data, m) => {
    plan = data.plan;
    changes = data.changes;
    pub = m;
    lookup = targets();
    if (!id && page?.startsWith("sale-"))
      id =
        Object.entries(plan.rooms).find(([, name]) => name === "sg1")?.[0] ||
        "";
    if (!id) {
      const alias = plan.aliases[decodeURIComponent(location.hash.slice(1))];
      if (alias) {
        type = alias.type;
        id = alias.id;
        get("entity-type").value = type;
      } else if (type === "teacher") {
        try {
          id = localStorage.getItem("my-teacher") || "";
        } catch {}
      }
    }
    options();
    render();
  });
  get("entity-type").onchange = () => {
    type = get("entity-type").value;
    id = "";
    get("search").value = "";
    list = false;
    options();
    render();
  };
  get("entity").onchange = () => {
    id = get("entity").value;
    list = false;
    if (innerWidth < 1200) disclosure.open = false;
    render();
  };
  get("search").oninput = () => {
    options();
    render();
  };
  get("date").onchange = render;
  get("mode").onchange = () => {
    list = false;
    render();
  };
  get("prev").onclick = () => {
    get("date").value = addDays(date, view === "week" && !list ? -7 : -1);
    render();
  };
  get("next").onclick = () => {
    get("date").value = addDays(date, view === "week" && !list ? 7 : 1);
    render();
  };
  get("today").onclick = () => {
    get("date").value = today();
    render();
  };
  for (const v of ["day", "week"])
    get(v).onclick = () => {
      view = v;
      list = false;
      render();
    };
  get("changes").onclick = () => {
    list = !list || dutiesOnly;
    dutiesOnly = false;
    render();
  };
  get("duty-changes").onclick = () => {
    list = true;
    dutiesOnly = true;
    render();
  };
  get("print").onclick = () => window.print();
  // Odnośniki w planie przełączają widok bez przeładowania strony; wpis w
  // historii pozwala wrócić przyciskiem „Wstecz”.
  function open(search: string) {
    const next = new URLSearchParams(search);
    type = next.get("type") || type;
    id = next.get("id") || "";
    if (validDate(next.get("date"))) get("date").value = next.get("date")!;
    get("mode").value = next.get("mode") || mode;
    view = next.get("view") || view;
    list = ["changes", "duties"].includes(next.get("list") || "");
    dutiesOnly = next.get("list") === "duties";
    get("entity-type").value = type;
    get("search").value = "";
    options();
    render();
  }
  get("schedule").addEventListener("click", (event) => {
    const a = (event.target as Element).closest<HTMLAnchorElement>(
      "a.plan-link",
    );
    if (
      !a ||
      !plan ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    history.pushState(null, "", a.href);
    open(new URL(a.href).search);
    // Kliknięty odnośnik znika po przerysowaniu planu, więc fokus trafia na
    // tytuł nowego planu, a widok wraca do jego początku.
    const title = get("selection-title");
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
    if (title.getBoundingClientRect().top < 0)
      title.scrollIntoView({ block: "start" });
  });
  addEventListener("popstate", () => {
    if (plan) open(location.search);
  });
  get("favorite").onclick = () => {
    try {
      localStorage.setItem("my-teacher", id);
      get("favorite-status").textContent = "Zapisano na tym urządzeniu.";
    } catch {
      get("favorite-status").textContent =
        "Przeglądarka nie pozwala zapisać ustawienia.";
    }
  };
}
