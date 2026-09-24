import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { DOMParser } from "@xmldom/xmldom";
import XLSX from "xlsx";
import { gzipSync } from "node:zlib";
import {
  daily,
  week,
  today,
  upcoming,
  substitutionMatches,
  transferMatches,
  tvPages,
  tvDayPages,
  excerpt,
} from "../src/lib/model.mjs";
const manifest = JSON.parse(fs.readFileSync("public/data/manifest.json"));
const plan = JSON.parse(fs.readFileSync("public" + manifest.files.plan));
const changes = JSON.parse(fs.readFileSync("public" + manifest.files.changes));
const old = { window: {} };
vm.createContext(old);
vm.runInContext(fs.readFileSync("schedule-changes.js", "utf8"), old);
const ref = old.window.ScheduleChanges;
test("Complete source migration: every XML card/day and duty retained", () => {
  const config = JSON.parse(fs.readFileSync("publication.json"));
  const xml = new DOMParser().parseFromString(
    new TextDecoder("windows-1250").decode(fs.readFileSync(config.sources.xml)),
    "text/xml",
  );
  const count = Array.from(xml.getElementsByTagName("card")).reduce(
    (n, c) =>
      n +
      [...(c.getAttribute("days") || "").slice(0, 5)].filter((b) => b === "1")
        .length,
    0,
  );
  assert.equal(plan.lessons.length, count);
  assert.equal(
    plan.duties.length,
    xml.getElementsByTagName("classroomsupervision").length,
  );
  for (const key of ["substitutions", "transfers", "dutyChanges"])
    assert.equal(changes[key].length, manifest.counts[key]);
});

test("Substitution matching agrees with original engine for every source lesson/event pair", () => {
  for (const l of plan.lessons)
    for (const e of changes.substitutions)
      assert.equal(
        substitutionMatches(l, e),
        ref.lessonMatchesSubstitution(l, e),
        `${l.id}/${e.date}/${e.period}`,
      );
});
test("Transfer matching agrees with original engine for every source lesson/event pair", () => {
  for (const l of plan.lessons)
    for (const e of changes.transfers)
      assert.equal(transferMatches(l, e), ref.lessonMatchesTransfer(l, e));
});
test("All base lessons retained without additions in base mode", () => {
  for (const date of week("2026-09-07"))
    assert.equal(
      daily(plan, changes, date, "base").filter((l) => l.status === "base")
        .length,
      plan.lessons.filter((l) => l.day === new Date(date).getUTCDay()).length,
    );
});
test("Every substitution produces a visible result with payment and note", () => {
  for (const e of changes.substitutions) {
    const rows = daily(plan, changes, e.date);
    assert.ok(
      rows.some(
        (l) =>
          l.change === e && ["substitution", "cancelled"].includes(l.status),
      ),
    );
    const result = rows.find(
      (l) => l.change === e && ["substitution", "cancelled"].includes(l.status),
    );
    assert.equal(result.payment, e.paymentForm);
    assert.ok(result.note.includes(e.absentTeacherName));
  }
});
test("Every transfer produces a target event in its destination day/room", () => {
  for (const e of changes.transfers) {
    assert.ok(
      daily(plan, changes, e.to.date).some(
        (l) =>
          l.change === e &&
          l.status === "transfer" &&
          l.period === e.to.period &&
          (!e.to.room || l.roomNames.includes(e.to.room)),
      ),
    );
  }
});
test("Every deputy duty retained, including person not present in base timetable", () => {
  for (const e of changes.dutyChanges)
    assert.ok(
      daily(plan, changes, e.date).some(
        (l) =>
          l.status === "duty-change" &&
          (e.substituteTeacherId
            ? l.teacherIds.includes(e.substituteTeacherId)
            : l.teacherNames.includes(e.rawSubstituteLabel)) &&
          l.place === e.place,
      ),
    );
});
test("Names of extra teachers have stable IDs", () => {
  for (const e of changes.substitutions)
    if (e.substituteTeacherName)
      assert.ok(plan.teachers[e.substituteTeacherId]);
});
test("Titles do not split one teacher into two", () => {
  // Plan pisze "ks. Paweł Stypa", eksport "Stypa Paweł" — to ta sama osoba.
  const key = ref.normalizePersonKey;
  assert.equal(key("ks. Paweł Stypa"), key("Stypa Paweł"));
  assert.equal(key("dr inż. Jan Kowalski"), key("Kowalski Jan"));
  assert.notEqual(key("Paweł Stypa"), key("Paweł Stypka"));
  // Nieobecność nauczyciela z planu nie może tworzyć osoby "extra" o tym samym nazwisku.
  const planKeys = new Set(
    Object.values(plan.teachers)
      .filter((t) => !String(t.id).startsWith("extra-"))
      .map((t) => key(t.name)),
  );
  for (const t of Object.values(plan.teachers))
    if (String(t.id).startsWith("extra-"))
      assert.ok(!planKeys.has(key(t.name)), `Zdublowany nauczyciel: ${t.name}`);
});
test("Week and timezone work through Sunday, year boundary and Warsaw DST", () => {
  assert.equal(week("2026-09-13")[0], "2026-09-07");
  assert.equal(week("2027-01-01")[0], "2026-12-28");
  assert.equal(today(new Date("2026-09-07T22:30:00Z")), "2026-09-08");
  assert.equal(today(new Date("2026-12-01T22:30:00Z")), "2026-12-01");
});
test("Weekends do not reuse a weekday timetable", () =>
  assert.equal(daily(plan, changes, "2026-09-12", "base").length, 0));
test("Empty changes is valid and produces the base schedule", () =>
  assert.equal(
    daily(
      plan,
      { substitutions: [], transfers: [], dutyChanges: [] },
      "2026-09-07",
    ).length,
    daily(plan, changes, "2026-09-07", "base").length,
  ));
test("Calendar homepage uses same first future event as full calendar", () => {
  const events = JSON.parse(
    fs.readFileSync("public" + manifest.files.calendar),
  );
  assert.deepEqual(
    upcoming(events, manifest.validFrom),
    events
      .filter((e) =>
        e.end
          ? e.end > manifest.validFrom
          : e.start.slice(0, 10) >= manifest.validFrom,
      )
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 4),
  );
});
test("Legacy links are mapped to existing entities", () => {
  assert.ok(Object.keys(plan.aliases).length > 100);
  for (const a of Object.values(plan.aliases))
    assert.ok(
      (a.type === "teacher"
        ? plan.teachers
        : a.type === "class"
          ? plan.classes
          : plan.rooms)[a.id],
    );
});
test("TV pagination retains all lessons, no more than four class panels per slide", () => {
  const entries = Array.from({ length: 27 }, (_, id) => ({ id }));
  const slides = tvPages(
    [
      ["1A", entries],
      ["2B", entries],
    ],
    2,
  );
  assert.ok(slides.every((s) => s.length <= 4));
  assert.equal(slides.flat().flatMap((c) => c.entries).length, 54);
});
test("TV day pages keep each class's whole day on one slide", () => {
  const entries = Array.from({ length: 17 }, (_, id) => ({ id }));
  const slides = tvDayPages(
    [
      ["1A", entries],
      ["2B", entries],
      ["3C", entries],
    ],
    2,
  );
  assert.equal(slides.length, 2);
  assert.ok(slides.flat().every((c) => c.entries.length === 17));
});
test("TV day pages give a long day a full column, four cells per slide", () => {
  const short = [{ id: 1 }],
    long = Array.from({ length: 16 }, (_, id) => ({ id }));
  const slides = tvDayPages(
    [
      ["1A", short],
      ["1B", long],
      ["1C", short],
      ["1D", short],
      ["1E", long],
      ["1F", long],
    ],
    4,
    (entries) => entries.length > 10,
  );
  assert.deepEqual(
    slides.map((s) => s.map((c) => c.name + (c.tall ? "*" : ""))),
    [["1A", "1B*", "1C"], ["1D", "1E*"], ["1F*"]],
  );
});
test("Built assets stay within shared and plan budgets and do not ship XLSX parser", () => {
  const assets = fs.readdirSync("dist/_astro").filter((f) => f.endsWith(".js"));
  let total = 0;
  for (const f of assets) {
    const b = fs.readFileSync("dist/_astro/" + f);
    total += gzipSync(b).length;
    assert.ok(!b.includes("sheet_to_json"));
  }
  assert.ok(total < 50 * 1024, `All chunks together: ${total}`);
});
test("Only generated public assets enter deployment, not spreadsheets or raw XML", () => {
  const files = fs.readdirSync("dist");
  assert.ok(!files.some((f) => /\.(xlsx|xml|py)$/.test(f)));
});

test("Other activity changes retain every scheduling entry without diary titles", () => {
  const config = JSON.parse(fs.readFileSync("publication.json"));
  const book = XLSX.read(fs.readFileSync(config.sources.substitutions));
  const sheet = book.Sheets["Dzienniki zajeć innych"];
  const source = sheet ? XLSX.utils.sheet_to_json(sheet, { defval: "" }) : [];
  const individual = (row) => /^\s*IND?\b/i.test(row["Dziennik zajęć innych"]);
  const published = source.filter((row) => !individual(row));
  assert.equal(changes.otherActivities.length, published.length);
  for (const [i, row] of published.entries()) {
    assert.equal(changes.otherActivities[i].subject, row["Opis zajęć"]);
    assert.equal(changes.otherActivities[i].time, row["Godzina"]);
    assert.ok(changes.otherActivities[i].absentTeacherId);
    if (row["Dziennik zajęć innych"])
      assert.ok(
        !JSON.stringify(changes).includes(row["Dziennik zajęć innych"]),
      );
  }
  // Individual tuition belongs to one named pupil and is never published.
  for (const row of source.filter(individual))
    assert.ok(
      !changes.otherActivities.some(
        (e) => e.time === row["Godzina"] && e.subject === row["Opis zajęć"],
      ),
    );
  for (const event of [...changes.substitutions, ...changes.transfers])
    assert.ok(
      !/^\s*IND?\b/i.test(event.branch.className) &&
        !/^\s*IND?\b/i.test(event.branch.groupName),
    );
});
test("Announcement excerpt skips salutations, headings and lists", () => {
  const body = [
    "Szanowni Państwo,",
    "## Nagłówek",
    "- punkt listy o wystarczającej długości, żeby nie odpadł przez limit",
    "Pierwszy **akapit** z [linkiem](https://example.com) i resztą zdania.",
  ].join("\n\n");
  assert.equal(
    excerpt(body),
    "Pierwszy akapit z linkiem i resztą zdania.",
    "zajawka bierze pierwszy prawdziwy akapit bez znaczników",
  );
  const long = "Zdanie o wyjściu edukacyjnym do Ossolineum. ".repeat(20);
  const cut = excerpt(long, 80);
  assert.ok(
    cut.length <= 81 && cut.endsWith("…"),
    "długi akapit jest skracany",
  );
  assert.ok(!cut.slice(0, -1).endsWith(" "), "skrót nie kończy się spacją");
  assert.equal(excerpt("Krótko."), "", "sam krótki akapit nie daje zajawki");
  for (const file of fs.readdirSync("src/content/aktualnosci")) {
    const raw = fs
      .readFileSync("src/content/aktualnosci/" + file, "utf8")
      .replace(/^---[\s\S]*?\n---\n/, "");
    assert.ok(
      excerpt(raw).length >= 40,
      `komunikat ${file} musi dać zajawkę na pulpit`,
    );
  }
});
