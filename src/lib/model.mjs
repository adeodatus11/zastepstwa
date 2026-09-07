export const DAYS = [
  "niedziela",
  "poniedziałek",
  "wtorek",
  "środa",
  "czwartek",
  "piątek",
  "sobota",
];
export const norm = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .toLowerCase()
    .trim();
export const today = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
export const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dayOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
export const week = (date) => {
  const monday = addDays(date, 1 - (dayOf(date) || 7));
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i));
};
export const dateLabel = (date) =>
  new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const person = (s) =>
  norm(s)
    .replace(/[()\[\]-]/g, " ")
    .split(/\s+/)
    .sort()
    .join(" ");
export function branchMatches(l, b) {
  return (
    l.classNames.some((c) => norm(c) === b.classKey) &&
    (!b.groupKey || l.groupNames.some((g) => norm(g) === b.groupKey))
  );
}
export function substitutionMatches(l, e) {
  return (
    l.period === e.period &&
    branchMatches(l, e.branch) &&
    (e.absentTeacherId
      ? l.teacherIds.includes(e.absentTeacherId)
      : l.teacherNames.some((n) => person(n) === person(e.absentTeacherName)))
  );
}
export function transferMatches(l, e) {
  return (
    l.period === e.from.period &&
    branchMatches(l, e.branch) &&
    (e.teacherId
      ? l.teacherIds.includes(e.teacherId)
      : l.teacherNames.some((n) => person(n) === person(e.teacherName)))
  );
}
export const selected = (l, type, id, plan) =>
  type === "teacher"
    ? l.teacherIds.includes(id)
    : type === "class"
      ? l.classNames.includes(plan.classes[id])
      : type === "duty"
        ? l.place === id
        : l.roomNames.includes(plan.rooms[id]);
export function daily(plan, changes, date, mode = "changes") {
  let result = plan.lessons
    .filter((l) => l.day === dayOf(date))
    .map((l) => ({ ...l, status: "base" }));
  if (mode === "changes") {
    for (const e of changes.transfers || []) {
      const originals = plan.lessons.filter(
        (l) => l.day === dayOf(e.from.date) && transferMatches(l, e),
      );
      if (e.from.date === date)
        result = result.map((l) =>
          transferMatches(l, e)
            ? {
                ...l,
                status: "moved-out",
                note: `Przeniesiono na ${e.to.date}, lekcja ${e.to.period}, sala ${e.to.room}`,
                change: e,
              }
            : l,
        );
      if (e.to.date === date) {
        const base = originals[0] || {
          id: "transfer",
          subject: e.subject,
          classNames: [e.branch.className],
          groupNames: [e.branch.groupName].filter(Boolean),
          teacherIds: [e.teacherId].filter(Boolean),
          teacherNames: [e.teacherName],
        };
        const p = plan.periods.find((p) => p.number === e.to.period);
        result.push({
          ...base,
          id: `${base.id}-in-${e.to.date}-${e.to.period}`,
          period: e.to.period,
          start: e.to.timeFrom || p?.start || "",
          end: e.to.timeTo || p?.end || "",
          roomNames: [e.to.room || originals[0]?.roomNames?.join(" / ") || ""],
          status: "transfer",
          note: e.note,
          change: e,
        });
      }
    }
    for (const e of changes.substitutions || []) {
      if (e.date !== date) continue;
      const originals = result.filter(
        (l) => l.status !== "moved-out" && substitutionMatches(l, e),
      );
      result = result.map((l) =>
        originals.includes(l)
          ? {
              ...l,
              status: "removed",
              note: e.effectLabel || "Zastępstwo",
              change: e,
            }
          : l,
      );
      const base = originals[0] || {
        id: "sub",
        classNames: [e.branch.className],
        groupNames: [e.branch.groupName].filter(Boolean),
        roomNames: [],
      };
      const p = plan.periods.find((p) => p.number === e.period);
      result.push({
        ...base,
        id: `${base.id}-sub-${e.absentTeacherId}-${result.length}`,
        subject: e.replacementSubject || e.subject,
        period: e.period,
        start: e.timeFrom || p?.start || "",
        end: e.timeTo || p?.end || "",
        teacherIds: [e.substituteTeacherId].filter(Boolean),
        teacherNames: [e.substituteTeacherName].filter(Boolean),
        roomNames: e.room ? [e.room] : base.roomNames,
        status: ["cancelled", "late"].includes(e.kind)
          ? "cancelled"
          : "substitution",
        note: [e.effectLabel, `Za: ${e.absentTeacherName}`, e.note]
          .filter(Boolean)
          .join(" · "),
        payment: e.paymentForm,
        change: e,
      });
    }
  }
  const duties = plan.duties
    .filter((d) => d.day === dayOf(date))
    .map((d) => ({
      ...d,
      status: "duty",
      subject: "Dyżur",
      teacherIds: [d.teacherId],
      teacherNames: [d.teacherName],
      roomNames: [d.place],
      classNames: [],
      groupNames: [],
      period: 0,
    }));
  if (mode === "changes")
    for (const e of changes.dutyChanges || []) {
      if (e.date !== date) continue;
      const parts = e.time.match(/\d{1,2}:\d{2}/g) || [];
      const start = (parts[0] || "").padStart(5, "0");
      for (const d of duties)
        if (
          d.teacherId === e.absentTeacherId &&
          d.start === start &&
          norm(d.place) === norm(e.place)
        ) {
          d.status = "removed";
          d.note = "Dyżur zastępczy";
        }
      duties.push({
        id: `dc-${duties.length}`,
        subject: "Dyżur zastępczy",
        period: 0,
        start,
        end: parts[1] || "",
        status: "duty-change",
        teacherIds: [e.substituteTeacherId].filter(Boolean),
        teacherNames: [e.substituteTeacherName || e.rawSubstituteLabel],
        roomNames: [e.place],
        classNames: [],
        groupNames: [],
        place: e.place,
        note: `Za: ${e.absentTeacherName}. ${e.note || ""}`,
      });
    }
  return [...result, ...duties].sort(
    (a, b) =>
      a.start.localeCompare(b.start) ||
      a.subject.localeCompare(b.subject, "pl"),
  );
}
export const eventEndsAfter = (event, date) =>
  event.end
    ? event.end.includes("T")
      ? event.end > date + "T00:00:00"
      : event.end > date
    : event.start.slice(0, 10) >= date;
export function upcoming(events, date, limit = 4) {
  return events
    .filter((e) => eventEndsAfter(e, date))
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, limit);
}
export function tvPages(rows, size = 2) {
  const slides = [];
  for (let first = 0; first < rows.length; first += 4) {
    const batch = rows.slice(first, first + 4),
      max = Math.max(...batch.map(([, entries]) => entries.length));
    for (let offset = 0; offset < max; offset += size) {
      const slide = batch
        .filter(([, entries]) => entries.length > offset)
        .map(([name, entries]) => ({
          name,
          continued: offset > 0,
          entries: entries.slice(offset, offset + size),
        }));
      if (slide.length) slides.push(slide);
    }
  }
  return slides;
}
