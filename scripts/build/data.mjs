import { assertPayload, validDate } from "../../src/lib/schema.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { DOMParser } from "@xmldom/xmldom";
import XLSX from "xlsx";
const config = JSON.parse(await fs.readFile("publication.json", "utf8"));
if (
  !validDate(config.validFrom) ||
  !validDate(config.validTo) ||
  config.validFrom > config.validTo
)
  throw Error("Nieprawidłowy okres planu");
const buffers = Object.fromEntries(
  await Promise.all(
    Object.entries(config.sources).map(async ([k, f]) => [
      k,
      await fs.readFile(f),
    ]),
  ),
);
const xml = new DOMParser().parseFromString(
  new TextDecoder("windows-1250").decode(buffers.xml),
  "text/xml",
);
const nodes = (tag) => Array.from(xml.getElementsByTagName(tag));
const a = (n, k) => n.getAttribute(k) || "";
const csv = (s) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const pad = (t) =>
  t
    .split(":")
    .map((x) => x.padStart(2, "0"))
    .join(":");
const map = (tag, fn) =>
  Object.fromEntries(nodes(tag).map((n) => [a(n, "id"), fn(n)]));
const teachers = map("teacher", (n) => ({
  id: a(n, "id"),
  name: `${a(n, "firstname")} ${a(n, "lastname") || a(n, "name")}`.trim(),
  short: a(n, "short"),
}));
const classes = map("class", (n) => a(n, "name")),
  rooms = map("classroom", (n) => a(n, "name")),
  groups = map("group", (n) => a(n, "name")),
  subjects = map("subject", (n) => a(n, "name"));
const periods = nodes("period")
  .map((n) => ({
    number: +a(n, "period"),
    start: pad(a(n, "starttime")),
    end: pad(a(n, "endtime")),
  }))
  .sort((a, b) => a.number - b.number);
const defs = map("lesson", (n) => ({
  id: a(n, "id"),
  subject: subjects[a(n, "subjectid")],
  classIds: csv(a(n, "classids")),
  teacherIds: csv(a(n, "teacherids")),
  roomIds: csv(a(n, "classroomids")),
  groupIds: csv(a(n, "groupids")),
}));
const lessons = [];
for (const [cardIndex, n] of nodes("card").entries()) {
  const def = defs[a(n, "lessonid")];
  if (!def) throw Error("Nieznana lekcja w XML");
  const roomIds = csv(a(n, "classroomids")).length
    ? csv(a(n, "classroomids"))
    : def.roomIds;
  for (const [index, bit] of [...a(n, "days")].entries())
    if (bit === "1" && index < 5) {
      const p = periods.find((p) => p.number === +a(n, "period"));
      if (!p) throw Error("Nieznany numer lekcji");
      lessons.push({
        ...def,
        id: `${def.id}-${index + 1}-${p.number}-${cardIndex}`,
        day: index + 1,
        period: p.number,
        start: p.start,
        end: p.end,
        roomIds,
        roomNames: roomIds.map((id) => rooms[id]),
        classNames: def.classIds.map((id) => classes[id]),
        teacherNames: def.teacherIds.map((id) => teachers[id]?.name || id),
        groupNames: def.groupIds.map((id) => groups[id]).filter(Boolean),
      });
    }
}
const minute = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const time = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const duties = nodes("classroomsupervision").map((n, i) => {
  const p = periods.find((p) => p.number === +a(n, "break")),
    prev = periods.find((p) => p.number === +a(n, "break") - 1);
  if (!p || !teachers[a(n, "teacherid")] || !rooms[a(n, "classroomid")])
    throw Error("Niekompletny dyżur XML");
  return {
    id: `duty-${i}`,
    day: +a(n, "day") + 1,
    start: prev?.end || time(minute(p.start) - 10),
    end: p.start,
    teacherId: a(n, "teacherid"),
    teacherName: teachers[a(n, "teacherid")].name,
    place: rooms[a(n, "classroomid")],
    roomId: a(n, "classroomid"),
  };
});
const book = (key) => XLSX.read(buffers[key], { type: "buffer" });
function validateSheet(key, columns) {
  const w = book(key),
    s = w.Sheets["Oddziały"] || w.Sheets[w.SheetNames[0]];
  if (!s) throw Error(`Brak arkusza ${key}`);
  const rows = XLSX.utils.sheet_to_json(s, { header: 1, defval: "" });
  if (!columns.every((c) => (rows[0] || []).includes(c)))
    throw Error(`Nieprawidłowe kolumny ${key}`);
  for (const [i, row] of XLSX.utils
    .sheet_to_json(s, { defval: "" })
    .entries()) {
    if (!columns.every((c) => String(row[c] ?? "").trim()))
      throw Error(`Niekompletny wiersz ${i + 2} w ${key}`);
    if (key === "substitutions" && !/^\d+,/.test(String(row["Lekcja"])))
      throw Error(`Niepoprawna lekcja: wiersz ${i + 2}`);
    if (
      key === "transfers" &&
      (!/\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}/.test(row["Przeniesiono z"]) ||
        !/\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}/.test(row["Przeniesiono na"]))
    )
      throw Error(`Niepoprawne przeniesienie: wiersz ${i + 2}`);
  }
  return rows.length - 1;
}
validateSheet("substitutions", ["Dzień", "Oddział", "Lekcja", "Zastępca"]);
validateSheet("transfers", ["Oddział", "Przeniesiono z", "Przeniesiono na"]);
const context = {
  window: {},
  XLSX,
  Date,
  Map,
  fetch: async (url) => {
    const f = decodeURI(url.split("?")[0]);
    const b = await fs.readFile(f);
    return {
      ok: true,
      arrayBuffer: async () =>
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    };
  },
};
vm.createContext(context);
vm.runInContext(await fs.readFile("schedule-changes.js", "utf8"), context);
const changes = JSON.parse(
  JSON.stringify(
    await context.window.ScheduleChanges.loadChangeSets(
      {
        substitutionsInfo: [config.sources.substitutions],
        transfersInfo: [config.sources.transfers],
      },
      teachers,
    ),
  ),
);
for (const s of changes.substitutions)
  if (!s.date || !s.period || !s.branch.className)
    throw Error("Niekompletny wpis zastępstwa");
// Preserve people supplied only in operational workbooks, including reversed names.
for (const e of [...changes.substitutions, ...changes.dutyChanges])
  for (const prefix of ["absentTeacher", "substituteTeacher"])
    if (!e[prefix + "Id"] && e[prefix + "Name"]) {
      const name = e[prefix + "Name"],
        key = context.window.ScheduleChanges.normalizePersonKey(name),
        existing = Object.values(teachers).find(
          (t) =>
            context.window.ScheduleChanges.normalizePersonKey(t.name) === key,
        );
      const id =
        existing?.id ||
        `extra-${crypto.createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
      teachers[id] ??= { id, name, short: "" };
      e[prefix + "Id"] = id;
    }
const w = book("supervision"),
  sheet = w.Sheets["grafik"] || w.Sheets["grafik dyżurów"];
if (!sheet) throw Error("Brak grafiku nadzoru");
const rows = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  defval: "",
  raw: false,
});
const phones = w.Sheets["numery telefonów"]
  ? XLSX.utils.sheet_to_json(w.Sheets["numery telefonów"], {
      header: 1,
      defval: "",
      raw: false,
    })
  : [];
const supervision = [];
for (const row of rows.slice(1)) {
  const i = row.findIndex((c) => /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(c));
  if (i < 0) continue;
  const [start, end] = row[i].match(/\d{1,2}:\d{2}/g).map(pad);
  rows[0].forEach((h, j) => {
    const day =
      ["poniedziałek", "wtorek", "środa", "czwartek", "piątek"].findIndex((d) =>
        h.toLowerCase().includes(d),
      ) + 1;
    if (day && j > i && row[j]) {
      const phone = phones.find((p) => p[0] === row[j]);
      supervision.push({
        day,
        start,
        end,
        name: row[j],
        phone: phone?.[1] || "71 798 69 34",
        extension: String(phone?.[2] || "").replace(/\D/g, ""),
      });
    }
  });
}
const calendar = JSON.parse(
  execFileSync(
    process.env.PYTHON || "python3",
    ["scripts/build/calendar.py", config.sources.calendar],
    { encoding: "utf8" },
  ),
);
const specialists = JSON.parse(
  await fs.readFile("src/content/specialists.json", "utf8"),
);
const aliases = {};
const legacy = buffers.legacyPlan.toString("utf8");
for (const match of legacy.matchAll(
  /<a[^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
)) {
  const name = match[2].replace(/<[^>]+>/g, "").trim();
  const teacher = Object.values(teachers).find((t) => t.name === name),
    cl = Object.entries(classes).find(([, n]) => n === name),
    room = Object.entries(rooms).find(([, n]) => n === name);
  if (teacher) aliases[match[1]] = { type: "teacher", id: teacher.id };
  else if (cl) aliases[match[1]] = { type: "class", id: cl[0] };
  else if (room) aliases[match[1]] = { type: "room", id: room[0] };
}
if (!lessons.length || !calendar.length || !supervision.length)
  throw Error("Puste wymagane dane");
const payloads = {
  plan: { teachers, classes, rooms, groups, periods, lessons, duties, aliases },
  changes,
  calendar,
  contacts: {
    supervision,
    specialists,
    validFrom: config.supervisionValidFrom,
    validTo: config.supervisionValidTo,
    notes: config.supervisionNotes,
  },
};
for (const [key, value] of Object.entries(payloads)) assertPayload(key, value);
const hash = crypto
  .createHash("sha256")
  .update(JSON.stringify({ config, payloads }))
  .digest("hex")
  .slice(0, 16);
const appHash = crypto.createHash("sha256");
for (const file of (await fs.readdir("src", { recursive: true })).sort()) {
  const source = path.join("src", file);
  if ((await fs.stat(source)).isFile())
    appHash.update(file).update(await fs.readFile(source));
}
const manifest = {
  appVersion: appHash.digest("hex").slice(0, 16),
  schemaVersion: 1,
  version: hash,
  validFrom: config.validFrom,
  validTo: config.validTo,
  timezone: config.timezone,
  schoolYear: config.schoolYear,
  calendarFrom: config.calendarFrom,
  calendarTo: config.calendarTo,
  generatedAt: new Date().toISOString(),
  files: {},
  counts: {
    lessons: lessons.length,
    duties: duties.length,
    substitutions: changes.substitutions.length,
    transfers: changes.transfers.length,
    dutyChanges: changes.dutyChanges.length,
  },
};
await fs.rm("public/data", { recursive: true, force: true });
await fs.mkdir("public/data", { recursive: true });
for (const [key, value] of Object.entries(payloads)) {
  const filename = `${key}.${hash}.json`;
  await fs.writeFile(path.join("public/data", filename), JSON.stringify(value));
  manifest.files[key] = `/data/${filename}`;
}
await fs.writeFile("public/data/manifest.json", JSON.stringify(manifest));
console.log("Dane zweryfikowane:", manifest.counts, hash);
