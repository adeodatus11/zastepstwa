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
          l.teacherIds.includes(e.substituteTeacherId) &&
          l.place === e.place,
      ),
    );
});
test("Names of extra teachers have stable IDs", () => {
  for (const e of changes.substitutions)
    if (e.substituteTeacherName)
      assert.ok(plan.teachers[e.substituteTeacherId]);
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
