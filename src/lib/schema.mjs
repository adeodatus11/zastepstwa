export function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + "T12:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function assertManifest(m) {
  if (
    m?.schemaVersion !== 1 ||
    !validDate(m.validFrom) ||
    !validDate(m.validTo) ||
    m.validFrom > m.validTo ||
    typeof m.version !== "string" ||
    !m.files ||
    !Number.isFinite(Date.parse(m.generatedAt))
  )
    throw Error("Nieprawidłowy manifest publikacji");
  for (const k of ["plan", "changes", "calendar", "contacts"])
    if (!/^\/data\/[a-z]+\.[a-f0-9]+\.json$/.test(m.files[k] || ""))
      throw Error("Nieprawidłowe źródło danych");
}
export function assertPayload(key, value) {
  let ok = false;
  if (key === "plan")
    ok =
      value &&
      value.teachers &&
      value.classes &&
      value.rooms &&
      value.aliases &&
      Array.isArray(value.periods) &&
      Array.isArray(value.duties) &&
      Array.isArray(value.lessons) &&
      value.lessons.length > 0 &&
      value.lessons.every(
        (l) =>
          typeof l.subject === "string" &&
          Array.isArray(l.teacherIds) &&
          Array.isArray(l.teacherNames) &&
          Array.isArray(l.classNames) &&
          Array.isArray(l.roomNames) &&
          Array.isArray(l.groupNames) &&
          typeof l.start === "string" &&
          typeof l.end === "string",
      );
  if (key === "changes")
    ok =
      value &&
      ["substitutions", "transfers", "dutyChanges"].every((k) =>
        Array.isArray(value[k]),
      );
  if (key === "calendar")
    ok =
      Array.isArray(value) &&
      value.every(
        (e) =>
          typeof e.title === "string" &&
          typeof e.id === "string" &&
          validDate(e.start?.slice(0, 10)),
      );
  if (key === "contacts")
    ok =
      value &&
      Array.isArray(value.supervision) &&
      value.specialists &&
      Array.isArray(value.specialists.specjalisci);
  if (!ok) throw Error("Nieprawidłowe dane: " + key);
}
