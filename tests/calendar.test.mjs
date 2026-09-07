import { test } from "node:test";
import assert from "node:assert/strict";
import { eventEndsAfter, upcoming } from "../src/lib/model.mjs";
import { ics } from "../src/lib/ics.mjs";
import { validDate, assertPayload } from "../src/lib/schema.mjs";
test("Timed events remain visible on their own day", () => {
  const e = {
    id: "meeting",
    title: "Rada",
    start: "2026-09-09T15:45:00",
    end: "2026-09-09T17:15:00",
  };
  assert.equal(eventEndsAfter(e, "2026-09-09"), true);
  assert.equal(upcoming([e], "2026-09-09").length, 1);
  assert.equal(upcoming([e], "2026-09-10").length, 0);
});
test("All-day and midnight end are exclusive", () => {
  assert.equal(
    eventEndsAfter({ start: "2026-09-09", end: "2026-09-10" }, "2026-09-10"),
    false,
  );
  assert.equal(
    eventEndsAfter(
      { start: "2026-09-09T15:00:00", end: "2026-09-10T00:00:00" },
      "2026-09-10",
    ),
    false,
  );
});
test("ICS exports Polish timezone, text escapes and UTF-8 folding", () => {
  const output = ics({
    id: "rada",
    title: "Rada, nauczyciele; " + "ąćęłńóśźż".repeat(15),
    start: "2026-09-09T15:45:00",
    end: "2026-09-09T17:15:00",
  });
  assert.ok(output.includes("DTSTART;TZID=Europe/Warsaw:20260909T154500"));
  assert.ok(output.includes("BEGIN:VTIMEZONE"));
  assert.ok(output.includes("Rada\\, nauczyciele\\;"));
  for (const line of output.split("\r\n"))
    assert.ok(Buffer.byteLength(line) <= 75);
});
test("All day ICS gets an exclusive next-day end", () => {
  const output = ics({
    id: "holiday",
    title: "Dzień wolny",
    start: "2026-10-14",
    allDay: true,
  });
  assert.ok(output.includes("DTEND;VALUE=DATE:20261015"));
  assert.ok(!output.includes("BEGIN:VTIMEZONE"));
});
test("Malformed date and data cannot replace a valid client snapshot", () => {
  assert.equal(validDate("2026-99-99"), false);
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2028-02-29"), true);
  assert.throws(() => assertPayload("plan", {}));
  assert.throws(() =>
    assertPayload("calendar", [{ id: "broken", title: "X", start: "no-date" }]),
  );
});
