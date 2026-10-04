// Kontrole paczki przed publikacją — to, co dotąd sprawdzał człowiek:
// struktura plików, okres, co znika i co się zmienia względem opublikowanej
// paczki, oraz reguły szkoły dla złączeń grup i zajęć bibliotecznych.
// Zbiorcze zestawienie zmian (opcjonalne) dokłada nieobecności oddziałów
// (wycieczki) i złączenia grup zapisane wprost w dzienniku. Zawiera powody
// nieobecności nauczycieli, więc służy tylko do kontroli i nie jest wysyłane.
import { isIndividual } from "./sanitize.mjs";

const SUBS = [
  "Dzień",
  "Lekcja",
  "Nauczyciel/wakat",
  "Oddział",
  "Przedmiot",
  "Sala",
  "Zastępca",
  "Uwagi",
  "Forma płatności",
];
const MOVES = [
  "Przeniesiono z",
  "Przeniesiono na",
  "Nauczyciel/wakat",
  "Oddział",
  "Przedmiot",
];
const clean = (v) => String(v ?? "").trim();
const lower = (v) => clean(v).toLocaleLowerCase("pl");

/** Wiersze arkusza jako obiekty {nagłówek: wartość}. */
export function table(sheets, name) {
  const [head = [], ...body] = sheets?.[name] ?? [];
  const keys = head.map(clean);
  return body
    .filter((r) => r.some((v) => clean(v)))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, clean(r[i])])));
}

/**
 * Pusty eksport: dziennik pomija wtedy arkusz „Oddziały” i pisze w „Opisie
 * parametrów” „Brak informacji o przeniesieniach” (albo „…o zastępstwach”).
 * Zwraca rodzaj pliku albo null.
 */
export function emptyExport(sheets) {
  if (sheets["Oddziały"]) return null;
  const all = lower((sheets["Opis parametrów"] ?? []).flat().join(" "));
  if (all.includes("brak informacji o przeniesieniach")) return "transfers";
  if (all.includes("brak informacji o zastępstwach")) return "substitutions";
  return null;
}

/** Który to plik: po zawartości, nie po nazwie. */
export function identify(sheets) {
  const head = (sheets["Oddziały"]?.[0] ?? []).map(clean);
  if (head.includes("Przeniesiono z")) return "transfers";
  if (head.includes("Zastępca")) return "substitutions";
  const empty = emptyExport(sheets);
  if (empty) return empty;
  if (sheets[ABSENT] || sheets["Dane zastępstwa"]) return "overview";
  return null;
}

const iso = (d) => d.split(".").reverse().join("-");
/** Okres z arkusza „Opis parametrów”: {from, to} w ISO albo null. */
export function periodOf(sheets) {
  const all = (sheets["Opis parametrów"] ?? []).flat().map(clean).join(" ");
  const dates = all.match(/\d{2}\.\d{2}\.\d{4}/g);
  return dates?.length === 2
    ? { from: iso(dates[0]), to: iso(dates[1]) }
    : null;
}

const ABSENT = "Dane nieobecności oddziałów";
const ABSENT_COLS = [
  "Data",
  "Numer lekcji",
  "Oddział/dziennik/grupa z podziałem",
  "Nazwa zajęć",
];
const plDate = (isoDate) => isoDate.split("-").reverse().join(".");
const period = (lekcja) => Number(/^\d+/.exec(clean(lekcja))?.[0]);
const rowDate = (dzien) =>
  /^\d{2}\.\d{2}\.\d{4}$/.test(clean(dzien)) ? iso(clean(dzien)) : "";
/** Data z komórki zestawienia: liczba seryjna Excela albo dd.mm.rrrr. */
const cellDate = (v) => {
  const t = clean(v);
  if (/^\d+(\.\d+)?$/.test(t))
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 864e5)
      .toISOString()
      .slice(0, 10);
  return (
    rowDate(t.slice(0, 10)) ||
    (/^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : "")
  );
};
const moveDate = (v) =>
  /^(\d{2}\.\d{2}\.\d{4}),\s*(\d+).*?sala:\s*(\S+)/.exec(clean(v));

/** Klucz osoby jak w generatorach: bez kolejności słów, znaków diakrytycznych i tytułów. */
const TITLES = new Set(["ks", "ksiadz", "dr", "mgr", "inz", "prof", "hab"]);
export function personKey(v) {
  const t = clean(v)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ł/g, "l");
  return (t.match(/[a-z0-9]+/g) ?? [])
    .filter((x) => !TITLES.has(x))
    .sort()
    .join(" ");
}

/**
 * Dopasowanie przybliżone nazwiska z eksportu do osoby z planu — ta sama reguła
 * co guessPerson w schedule-changes.js: podwójne nazwisko (wystarczy jeden
 * człon) albo literówka. Plan podaje „Imię Nazwisko”, samo imię nie wystarcza.
 */
const tokens = (v) =>
  personKey(clean(v).replace(/\[[^\]]*\]/g, ""))
    ? clean(v)
        .replace(/\[[^\]]*\]/g, "")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/ł/g, "l")
        .match(/[a-z0-9]+/g)
        .filter((x) => !TITLES.has(x))
    : [];
function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] !== b[j - 1]),
      );
      prev = cur;
    }
  }
  return row[b.length];
}
const close = (a, b) => {
  const n = Math.min(a.length, b.length),
    d = editDistance(a, b);
  return a === b || (n >= 4 && d <= 1) || (n >= 7 && d <= 2);
};
const NOT_A_PERSON = /^(uczniowie|zastępstwo|okienko|bez |zajęcia|-)/i;
export function guessPerson(raw, names) {
  if (!clean(raw) || NOT_A_PERSON.test(clean(raw))) return null;
  const query = tokens(raw);
  let best = null,
    bestScore = 0;
  for (const name of names) {
    const [first = "", ...rest] = tokens(name);
    const last = rest.length ? rest : [first];
    let score = 0;
    for (const t of query)
      score += last.includes(t)
        ? 1
        : last.some((p) => close(t, p))
          ? 0.7
          : rest.length && close(t, first)
            ? 0.5
            : -0.5;
    if (score >= 1 && score > bestScore) [best, bestScore] = [name, score];
  }
  return best;
}

const isMessage = (v) => {
  const s = lower(v);
  return (
    !s ||
    s === "-" ||
    s === "zastępstwo" ||
    s.startsWith("uczniowie ") ||
    s.includes("złączenie grup")
  );
};
/** Zastępca jeszcze nieprzypisany: „Zastępstwo” bez nazwiska albo pusto. Nie publikujemy. */
export const unassigned = (r) =>
  !clean(r["Zastępca"]) || lower(r["Zastępca"]) === "zastępstwo";
const isPE = (v) => lower(v).includes("wychowanie fizyczne");
/** Zawsze zajęcia biblioteczne i zawsze „Bezpłatne” (jak w planie: „Imię Nazwisko”). */
const LIBRARIANS = ["Barbara Wrzeszcz", "Ewa Zając"];
const where = (r) =>
  `${r["Dzień"]}, lekcja ${period(r["Lekcja"])}, ${r["Oddział"]} (${r["Przedmiot"]})`;

function structure(kind, sheets) {
  const out = [];
  const need = kind === "substitutions" ? SUBS : MOVES;
  const head = (sheets["Oddziały"]?.[0] ?? []).map(clean);
  const missing =
    emptyExport(sheets) === kind ? [] : need.filter((c) => !head.includes(c));
  if (missing.length)
    out.push({
      level: "error",
      group: "Plik",
      text: `Brak kolumn w arkuszu „Oddziały”: ${missing.join(", ")}.`,
    });
  if (!periodOf(sheets))
    out.push({
      level: "error",
      group: "Plik",
      text: "Nie da się odczytać okresu z arkusza „Opis parametrów”.",
    });
  if (missing.length) return out;
  table(sheets, "Oddziały").forEach((r, i) => {
    const line = `wiersz ${i + 2}`;
    if (kind === "substitutions") {
      if (!rowDate(r["Dzień"]) || !period(r["Lekcja"]) || !r["Oddział"])
        out.push({
          level: "error",
          group: "Plik",
          text: `Niekompletne zastępstwo (${line}): brak daty, lekcji albo oddziału.`,
        });
    } else if (
      !moveDate(r["Przeniesiono z"]) ||
      !moveDate(r["Przeniesiono na"]) ||
      !r["Oddział"]
    )
      out.push({
        level: "error",
        group: "Plik",
        text: `Nieczytelne przeniesienie (${line}).`,
      });
  });
  return out;
}

/** Liczby do podsumowania. */
export function summarize(subs, moves, overview) {
  const rows = table(subs, "Oddziały");
  const other = table(subs, "Dzienniki zajeć innych");
  const ind = (r) => r["Oddział"].split("|").some(isIndividual);
  return {
    period: periodOf(subs),
    substitutions: rows.filter((r) => !ind(r) && !unassigned(r)).length,
    unassigned: rows.filter((r) => !ind(r) && unassigned(r)).length,
    transfers: moves
      ? table(moves, "Oddziały").filter((r) => !ind(r)).length
      : null,
    classAbsences: overview ? table(overview, ABSENT).length : null,
    duties: table(subs, "Dyżury").length,
    other: other.filter((r) => !isIndividual(r["Dziennik zajęć innych"]))
      .length,
    individual:
      rows.filter(ind).length +
      other.filter((r) => isIndividual(r["Dziennik zajęć innych"])).length,
  };
}

const lessonKey = (r) =>
  [
    r["Dzień"],
    period(r["Lekcja"]),
    personKey(r["Nauczyciel/wakat"]),
    r["Oddział"],
  ].join("|");
const moveKey = (r) =>
  [r["Przeniesiono z"], personKey(r["Nauczyciel/wakat"]), r["Oddział"]].join(
    "|",
  );

/** Różnice względem opublikowanej paczki. */
function compare(subs, moves, published) {
  const out = [];
  const now = periodOf(subs),
    before = periodOf(published.subs);
  if (now && before && now.to < before.to)
    out.push({
      level: "warn",
      group: "Okres",
      text: `Nowa paczka kończy się ${plDate(now.to)}, a opublikowana ${plDate(before.to)}. Zastępstwa z dni po ${plDate(now.to)} znikną ze stron.`,
    });
  const inWindow = (r) =>
    now && rowDate(r["Dzień"]) >= now.from && rowDate(r["Dzień"]) <= now.to;
  // Nieprzypisane zastępstwa nie są publikowane, więc nie biorą udziału w porównaniu.
  const fresh = new Map(
    table(subs, "Oddziały")
      .filter((r) => !unassigned(r))
      .map((r) => [lessonKey(r), r]),
  );
  for (const r of table(published.subs, "Oddziały").filter(
    (r) => !unassigned(r),
  )) {
    const n = fresh.get(lessonKey(r));
    if (!n) {
      if (inWindow(r))
        out.push({
          level: "warn",
          group: "Zmiany",
          text: `Znika zastępstwo: ${where(r)}, było: ${r["Zastępca"]}.`,
        });
      continue;
    }
    const changed = ["Przedmiot", "Sala", "Zastępca", "Uwagi"].filter(
      (k) => r[k] !== n[k],
    );
    if (changed.length && lower(r["Uwagi"]).includes("złączenie grup"))
      out.push({
        level: "warn",
        group: "Ręczne poprawki",
        text: `${where(r)} — dziennik zapisał tę lekcję inaczej niż opublikowana poprawka: ${changed.map((k) => `${k.toLowerCase()} „${r[k]}” → „${n[k]}”`).join(", ")}.`,
      });
  }
  if (!moves) return out;
  const freshMoves = new Set(table(moves, "Oddziały").map(moveKey));
  for (const r of table(published.moves, "Oddziały")) {
    const target = moveDate(r["Przeniesiono na"]);
    if (
      !freshMoves.has(moveKey(r)) &&
      target &&
      iso(target[1]) >= (now?.from ?? "")
    )
      out.push({
        level: "warn",
        group: "Zmiany",
        text: `Znika przeniesienie ${r["Oddział"]} (${r["Przedmiot"]}): ${target[1]}, lekcja ${target[2]}. Sprawdź, czy zostało odwołane, czy wypadło z okresu eksportu.`,
      });
  }
  return out;
}

const MIXED = "Różne powody nieobecności";
const teacherName = (v) => clean(v).replace(/\s*\[[^\]]*\]\s*$/, "");

/**
 * Dni, w których nauczyciel ma nieobecności z różnymi powodami (lekcje i dyżury
 * z „Dane nieobecności” i „Dane zastępstwa”). Zwraca tylko datę i osobę —
 * same powody są porównywane tutaj i nigdzie nie zostają.
 */
function mixedReasons(sheets) {
  const seen = new Map();
  for (const name of ["Dane nieobecności", "Dane zastępstwa"]) {
    const [head = [], ...body] = sheets[name] ?? [];
    const col = (c) => head.map(clean).indexOf(c);
    const [d, t, why] = ["Data", "Prowadzący", "Powód nieobecności"].map(col);
    if (d < 0 || t < 0 || why < 0) continue;
    for (const r of body) {
      const date = cellDate(r[d]),
        who = teacherName(r[t]);
      if (!date || !who) continue;
      const k = `${date}|${who}`;
      seen.set(k, (seen.get(k) ?? new Set()).add(lower(r[why])));
    }
  }
  return [
    ["Data", "Nauczyciel"],
    ...[...seen]
      .filter(([, reasons]) => reasons.size > 1)
      .map(([k]) => k.split("|")),
  ];
}

/** Kolumny zestawienia, których potrzebuje kontrola; reszta jest odrzucana. */
const OVERVIEW_KEEP = {
  "Opis parametrów": null,
  [ABSENT]: ABSENT_COLS,
  "Dane zastępstwa": [
    "Data",
    "Numer lekcji",
    "Oddział/dziennik/grupa/miejsce dyżuru z podziałem",
    "Zastępstwo",
    "Skutek nieobecności",
  ],
};

/**
 * Zestawienie okrojone zaraz po odczycie: bez powodów nieobecności nauczycieli,
 * bez arkusza „Dane nieobecności” (tam bywają też nazwy dzienników uczniów)
 * i bez raportów. Z powodów zostaje jedynie informacja, że danego dnia
 * nauczyciel ma ich kilka różnych. Nic poza tym wynikiem nie jest przechowywane.
 */
export function reduceOverview(sheets) {
  const out = {};
  for (const [name, cols] of Object.entries(OVERVIEW_KEEP)) {
    const rows = sheets[name];
    if (!rows) continue;
    if (!cols) {
      out[name] = rows.map((r) =>
        r.map((v) => (/\d{2}\.\d{2}\.\d{4}/.test(v) ? v : "")),
      );
      continue;
    }
    const head = (rows[0] ?? []).map(clean);
    const idx = cols.map((c) => head.indexOf(c));
    out[name] = rows.map((r, y) =>
      idx.map((i, x) => (y === 0 ? cols[x] : i < 0 ? "" : clean(r[i]))),
    );
  }
  out[MIXED] = mixedReasons(sheets);
  return out;
}

/** Z zestawienia: lekcje nieobecnych oddziałów i złączenia grup z dziennika. */
export function overviewFacts(overview, who = personKey) {
  const absent = new Map();
  for (const r of table(overview, ABSENT)) {
    const [code, group = ""] =
      r["Oddział/dziennik/grupa z podziałem"].split("|");
    const k = [cellDate(r["Data"]), period(r["Numer lekcji"]), code].join("|");
    absent.set(k, [
      ...(absent.get(k) ?? []),
      { group: lower(group), subject: lower(r["Nazwa zajęć"]) },
    ]);
  }
  const merges = new Set(
    table(overview, "Dane zastępstwa")
      .filter((r) => lower(r["Skutek nieobecności"]) === "złączenie grup")
      .map((r) =>
        [
          cellDate(r["Data"]),
          period(r["Numer lekcji"]),
          r["Oddział/dziennik/grupa/miejsce dyżuru z podziałem"],
          who(r["Zastępstwo"].replace(/\[[^\]]*\]/g, "")),
        ].join("|"),
      ),
  );
  return { absent, merges };
}

/** Reguły szkoły: złączenie grup (sala i płatność) i zajęcia biblioteczne. */
export function schoolRules(subs, moves, plan, overview) {
  const out = [];
  // Klucz osoby: dokładny, a gdy nikogo takiego nie ma w planie — zgadnięty.
  const planNames = [...new Set(plan.lessons.flatMap((l) => l.teacherNames))];
  const planKeys = new Set(planNames.map(personKey));
  const known = new Map();
  const who = (name) => {
    const k = personKey(name);
    if (planKeys.has(k)) return k;
    if (!known.has(k)) {
      const guess = guessPerson(name, planNames);
      known.set(k, guess ? personKey(guess) : k);
    }
    return known.get(k);
  };
  const facts = overview
    ? overviewFacts(overview, who)
    : { absent: new Map(), merges: new Set() };
  const rows = table(subs, "Oddziały");
  const shortOf = (dict, id) => clean(plan.shorts?.[dict]?.[id]);
  const roomCodes = (l) =>
    new Set(
      l.roomIds
        .flatMap((id, i) => [
          lower(shortOf("rooms", id)),
          lower(l.roomNames[i]),
          lower(l.roomNames[i]).split(/[\s(]/)[0],
        ])
        .filter(Boolean),
    );
  // Kody oddziału w eksporcie dla klasy z planu: nazwa i skrót.
  const codesOf = new Map(
    Object.entries(plan.classes).map(([id, name]) => [
      name,
      [name, shortOf("classes", id)].filter(Boolean),
    ]),
  );
  // Lekcja z planu odwołana, bo oddział jest nieobecny (np. wycieczka).
  const classAway = (l, date, p) =>
    l.classNames.length > 0 &&
    l.classNames.every((c) =>
      (codesOf.get(c) ?? [c]).some((code) =>
        (facts.absent.get([date, p, code].join("|")) ?? []).some(
          (a) => !a.group || a.subject === lower(l.subject),
        ),
      ),
    );
  const classNames = (code) =>
    new Set(
      Object.entries(plan.classes)
        .filter(
          ([id, name]) => name === code || shortOf("classes", id) === code,
        )
        .map(([, name]) => name),
    );
  const slots = new Map();
  for (const l of plan.lessons)
    for (const name of l.teacherNames) {
      const k = [personKey(name), l.day, l.period].join("|");
      slots.set(k, [...(slots.get(k) ?? []), l]);
    }
  // Zastępca jest wolny, jeśli jego własna lekcja tego dnia też jest w eksporcie.
  const freed = new Set(
    rows.map((r) =>
      [who(r["Nauczyciel/wakat"]), r["Dzień"], period(r["Lekcja"])].join("|"),
    ),
  );
  const moved = new Map();
  for (const r of table(moves, "Oddziały")) {
    const a = moveDate(r["Przeniesiono z"]),
      b = moveDate(r["Przeniesiono na"]);
    if (a && b && a[1] === b[1] && a[2] === b[2])
      moved.set(
        [who(r["Nauczyciel/wakat"]), a[1], Number(a[2])].join("|"),
        lower(b[3]),
      );
  }
  // Zastępstwa jednej osoby na tej samej lekcji oceniamy razem (kilka grup naraz).
  const groups = new Map();
  for (const r of rows) {
    if (r["Oddział"].split("|").some(isIndividual)) continue;
    const pay = r["Forma płatności"],
      sub = r["Zastępca"],
      library = lower(r["Przedmiot"]).includes("biblioteczn");
    if (guessPerson(sub, LIBRARIANS)) {
      // Bibliotekarki zawsze prowadzą zajęcia biblioteczne, zawsze bezpłatnie.
      if (!library)
        out.push({
          level: "warn",
          group: "Zajęcia biblioteczne",
          text: `${where(r)}: ${sub} powinna mieć zajęcia biblioteczne, w eksporcie jest „${r["Przedmiot"]}”.`,
        });
      if (pay !== "Bezpłatne")
        out.push({
          level: "warn",
          group: "Zajęcia biblioteczne",
          text: `${where(r)}, zastępca ${sub}: forma płatności „${pay}”, powinno być „Bezpłatne”.`,
        });
      continue;
    }
    if (library && pay !== "Bezpłatne")
      out.push({
        level: "warn",
        group: "Zajęcia biblioteczne",
        text: `${where(r)}, zastępca ${sub}: forma płatności „${pay}”, powinno być „Bezpłatne”.`,
      });
    if (isMessage(sub) && !lower(r["Uwagi"]).includes("złączenie grup"))
      continue;
    if (!rowDate(r["Dzień"])) continue;
    const k = [who(sub), r["Dzień"], period(r["Lekcja"])].join("|");
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const [slot, same] of groups) {
    const [r0] = same,
      sub = r0["Zastępca"],
      date = rowDate(r0["Dzień"]),
      p = period(r0["Lekcja"]);
    const day = new Date(date + "T12:00:00Z").getUTCDay();
    const planned = freed.has(slot)
      ? []
      : (slots.get([who(sub), day, p].join("|")) ?? []);
    const busy = planned.filter((l) => !classAway(l, date, p));
    const away = planned.filter((l) => classAway(l, date, p));
    const isMarked = (r) =>
      lower(r["Uwagi"]).includes("złączenie grup") ||
      facts.merges.has([date, p, r["Oddział"], who(sub)].join("|"));
    const at = `${r0["Dzień"]}, lekcja ${p}`;
    const list = same.map((r) => `${r["Oddział"]} „${r["Forma płatności"]}”`);
    if (!busy.length && same.length > 1) {
      // Kilka grup naraz bez własnej lekcji: jedna płatna, reszta „Bezpłatne”.
      const charged = same.filter((r) => r["Forma płatności"] !== "Bezpłatne");
      if (charged.length !== 1)
        out.push({
          level: "warn",
          group: "Złączenie grup",
          text: `${at}: ${sub} ma jednocześnie ${same.length} zastępstwa (${list.join(", ")}). ${charged.length ? "Płatna może być tylko jedna grupa" : "Żadna grupa nie jest płatna — jedna powinna być płatna"}, pozostałe „Bezpłatne”.`,
        });
      const want = away.length ? "Godzina do zliczenia" : null;
      if (
        want &&
        charged.length === 1 &&
        charged[0]["Forma płatności"] !== want
      )
        out.push({
          level: "warn",
          group: "Oddział nieobecny",
          text: `${where(charged[0])}: ${sub} ma wtedy lekcję z ${away.flatMap((l) => l.classNames).join("/")}, ale ten oddział jest nieobecny — zastępstwo powinno być „${want}”, jest „${charged[0]["Forma płatności"]}”.`,
        });
      continue;
    }
    for (const r of same) {
      const pay = r["Forma płatności"];
      const marked = isMarked(r);
      if (!busy.length && !marked) {
        // Zastępca wolny, bo jego oddział jest nieobecny (np. wycieczka).
        if (away.length && pay !== "Godzina do zliczenia")
          out.push({
            level: "warn",
            group: "Oddział nieobecny",
            text: `${where(r)}: ${sub} ma wtedy według planu lekcję z ${away.flatMap((l) => l.classNames).join("/")} (${away.map((l) => l.subject).join("/")}), ale ten oddział jest nieobecny. Zastępstwo powinno być „Godzina do zliczenia”, jest „${pay}”.`,
          });
        continue;
      }
      const mine = classNames(r["Oddział"].split("|")[0]);
      const host =
        busy.find((l) => l.classNames.some((c) => mine.has(c))) ?? busy[0];
      const other = host && !host.classNames.some((c) => mine.has(c));
      const label = host
        ? `${sub} prowadzi wtedy ${host.groupNames.join("/") === "Cała klasa" ? "" : `grupę ${host.groupNames.join("/")} `}${other ? `klasy ${host.classNames.join("/")}` : "tej samej klasy"} (${host.subject})`
        : `${sub} ma złączenie grup${marked && !lower(r["Uwagi"]).includes("złączenie grup") ? " (według dziennika)" : ""}`;
      if (pay !== "Bezpłatne")
        out.push({
          level: "warn",
          group: "Złączenie grup",
          text: `${where(r)}: ${label} — złączenie powinno być „Bezpłatne”, jest „${pay}”.`,
        });
      if (host && !isPE(r["Przedmiot"]) && !isPE(host.subject)) {
        const expected = moved.has(slot)
          ? new Set([moved.get(slot)])
          : roomCodes(host);
        if (expected.size && !expected.has(lower(r["Sala"])))
          out.push({
            level: "warn",
            group: "Złączenie grup",
            text: `${where(r)}: sala ${r["Sala"] || "(brak)"}, a ${label} w sali ${host.roomNames.join("/")}. Przy złączeniu sala powinna być ta, w której zastępca prowadzi swoją grupę.`,
          });
      }
    }
  }
  // Ten sam nauczyciel tego samego dnia nieobecny z różnych powodów.
  for (const r of table(overview, MIXED))
    out.push({
      level: "warn",
      group: "Powody nieobecności",
      text: `${plDate(r["Data"])} — ${r["Nauczyciel"]}: różne powody nieobecności tego dnia.`,
    });
  return out;
}

/** Pełny przegląd paczki. Tylko plik zastępstw jest wymagany. */
export function review({ subs, moves, overview, published, plan }) {
  const messages = [
    ...structure("substitutions", subs),
    ...(moves ? structure("transfers", moves) : []),
  ];
  const a = periodOf(subs),
    b = moves && periodOf(moves),
    c = overview && periodOf(overview);
  if (!moves)
    messages.push({
      level: "info",
      group: "Pliki",
      text: "Bez pliku przeniesień — na stronach zostają obecnie opublikowane przeniesienia.",
    });
  if (!overview)
    messages.push({
      level: "info",
      group: "Pliki",
      text: "Bez zbiorczego zestawienia zmian — kontrola nie wie o nieobecnościach oddziałów (np. wycieczkach) ani o złączeniach zapisanych w dzienniku.",
    });
  else if (
    !ABSENT_COLS.every((k) =>
      (overview[ABSENT]?.[0] ?? []).map(clean).includes(k),
    )
  )
    messages.push({
      level: "warn",
      group: "Pliki",
      text: `W zbiorczym zestawieniu brak arkusza „${ABSENT}” albo jego kolumn — nieobecności oddziałów nie zostały uwzględnione.`,
    });
  if (a && c && (a.from !== c.from || a.to !== c.to))
    messages.push({
      level: "warn",
      group: "Okres",
      text: `Zbiorcze zestawienie obejmuje ${plDate(c.from)}–${plDate(c.to)}, a zastępstwa ${plDate(a.from)}–${plDate(a.to)}. Nieobecności oddziałów spoza tego okresu nie są znane.`,
    });
  if (a && b && (a.from !== b.from || a.to !== b.to))
    messages.push({
      level: "warn",
      group: "Okres",
      text: `Pliki mają różne okresy: zastępstwa ${plDate(a.from)}–${plDate(a.to)}, przeniesienia ${plDate(b.from)}–${plDate(b.to)}. Plan uczniowski pokaże zastępstwa tylko w okresie pliku zastępstw.`,
    });
  if (!messages.some((m) => m.level === "error")) {
    if (published) messages.push(...compare(subs, moves, published));
    if (plan) messages.push(...schoolRules(subs, moves, plan, overview));
  }
  const summary = summarize(subs, moves, overview);
  if (summary.unassigned)
    messages.push({
      level: "info",
      group: "Pliki",
      text: `Pominięto ${summary.unassigned} ${summary.unassigned === 1 ? "zastępstwo" : "zastępstw(a)"} bez przypisanego zastępcy („Zastępstwo” bez nazwiska) — nie będą opublikowane, dopóki dziennik nie poda zastępcy.`,
    });
  return { summary, messages };
}
