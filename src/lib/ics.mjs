import { addDays } from "./model.mjs";
const text = (value) =>
  String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
function fold(line) {
  let bytes = 0,
    result = "",
    encoder = new TextEncoder();
  for (const c of line) {
    const length = encoder.encode(c).length;
    if (bytes + length > 74) {
      result += "\r\n ";
      bytes = 1;
    }
    result += c;
    bytes += length;
  }
  return result;
}
export function ics(event) {
  const allDay = event.allDay || !event.start.includes("T");
  const end =
    event.end ||
    (allDay
      ? addDays(event.start, 1)
      : new Date(new Date(event.start + "Z").getTime() + 90 * 60000)
          .toISOString()
          .slice(0, 19));
  const date = (s) => s.replace(/[-:]/g, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZSZ5//Kalendarz szkolny//PL",
    "CALSCALE:GREGORIAN",
  ];
  if (!allDay)
    lines.push(
      "BEGIN:VTIMEZONE",
      "TZID:Europe/Warsaw",
      "BEGIN:DAYLIGHT",
      "DTSTART:19700329T020000",
      "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
      "TZOFFSETFROM:+0100",
      "TZOFFSETTO:+0200",
      "END:DAYLIGHT",
      "BEGIN:STANDARD",
      "DTSTART:19701025T030000",
      "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
      "TZOFFSETFROM:+0200",
      "TZOFFSETTO:+0100",
      "END:STANDARD",
      "END:VTIMEZONE",
    );
  lines.push(
    "BEGIN:VEVENT",
    `UID:${event.id}@nauczyciel.szkolamistrzow.info`,
    `DTSTAMP:${new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "")}`,
    `SUMMARY:${text(event.title)}`,
    `DESCRIPTION:${text(event.extendedProps?.description || event.title)}`,
    `DTSTART${allDay ? ";VALUE=DATE" : ";TZID=Europe/Warsaw"}:${date(event.start)}`,
    `DTEND${allDay ? ";VALUE=DATE" : ";TZID=Europe/Warsaw"}:${date(end)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  );
  return lines.map(fold).join("\r\n") + "\r\n";
}
