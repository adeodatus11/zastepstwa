import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { readZip, writeZip } from "../src/lib/update/zip.mjs";
import { readWorkbook } from "../src/lib/update/xlsx.mjs";
import {
  sanitize,
  sensitiveValues,
  INDIVIDUAL_MARKER,
} from "../src/lib/update/sanitize.mjs";
import {
  identify,
  periodOf,
  review,
  reduceOverview,
  schoolRules,
} from "../src/lib/update/checks.mjs";

const dom = { DOMParser, XMLSerializer };
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
// Stała, oczyszczona paczka z arkuszem zajęć innych i zgodnymi okresami —
// bieżące pliki zmieniają się co tydzień i nie muszą mieć ani jednego, ani drugiego.
const published = fs.readFileSync(
  "tests/fixtures/InformacjeOZastepstwach.xlsx",
);

// Syntetyczny identyfikator w kopii opublikowanego pliku — w repozytorium
// nie ma i nie może być prawdziwych nazw dzienników.
async function withDiary(text) {
  const files = await readZip(published);
  const out = files.map((f) => {
    if (f.name !== "xl/worksheets/sheet3.xml") return f;
    const doc = new DOMParser().parseFromString(
      new TextDecoder().decode(f.bytes),
      "application/xml",
    );
    const cell = Array.from(doc.getElementsByTagName("c")).find(
      (c) => c.getAttribute("r") === "D2",
    );
    while (cell.firstChild) cell.removeChild(cell.firstChild);
    cell.setAttribute("t", "inlineStr");
    const is = doc.createElementNS(NS, "is");
    const t = doc.createElementNS(NS, "t");
    t.appendChild(doc.createTextNode(text));
    is.appendChild(t);
    cell.appendChild(is);
    return {
      ...f,
      bytes: new TextEncoder().encode(
        new XMLSerializer().serializeToString(doc),
      ),
    };
  });
  return writeZip(out);
}

const diary = (sheets) => {
  const [head, ...rows] = sheets["Dzienniki zajeć innych"];
  const i = head.indexOf("Dziennik zajęć innych");
  return rows.map((r) => r[i] ?? "");
};

function pythonLeaks(bytes) {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "upd-")),
    "x.xlsx",
  );
  fs.writeFileSync(file, bytes);
  return execFileSync(process.env.PYTHON || "python3", [
    "-c",
    "import sys;sys.path.insert(0,'scripts');from privacy_xlsx import sensitive_values;from pathlib import Path;print(len(sensitive_values(Path(sys.argv[1]).read_bytes())))",
    file,
  ])
    .toString()
    .trim();
}

test("Zip roundtrip keeps every part byte for byte", async () => {
  const files = await readZip(published);
  const again = await readZip(await writeZip(files));
  assert.deepEqual(
    again.map((f) => f.name),
    files.map((f) => f.name),
  );
  files.forEach((f, i) => assert.deepEqual(again[i].bytes, f.bytes, f.name));
});

test("Browser sanitizer removes diary names like privacy_xlsx.py and keeps every other cell", async () => {
  const tainted = await withDiary("TEST STUDENT DIARY");
  const before = (await readWorkbook(tainted, DOMParser)).sheets;
  assert.deepEqual([...sensitiveValues(before)], ["TEST STUDENT DIARY"]);
  assert.equal(pythonLeaks(tainted), "1");
  const clean = await sanitize(tainted, dom);
  assert.equal(clean.removed, 1);
  assert.equal(sensitiveValues(clean.sheets).size, 0);
  assert.equal(pythonLeaks(clean.bytes), "0");
  assert.equal(diary(clean.sheets)[0], "");
  for (const [name, rows] of Object.entries(before))
    rows.forEach((row, y) =>
      row.forEach((v, x) => {
        if (name === "Dzienniki zajeć innych" && y === 1 && x === 3) return;
        assert.equal(clean.sheets[name][y][x], v, `${name} ${y}:${x}`);
      }),
    );
});

test("Individual tuition keeps only the IND marker and no pupil anywhere in the archive", async () => {
  const clean = await sanitize(
    await withDiary("IND - Nazwisko Imie [1A]"),
    dom,
  );
  assert.equal(diary(clean.sheets)[0], INDIVIDUAL_MARKER);
  assert.equal(pythonLeaks(clean.bytes), "0");
  const text = (await readZip(clean.bytes))
    .map((f) => new TextDecoder().decode(f.bytes))
    .join("");
  assert.ok(!text.includes("Nazwisko"));
});

test("Package files are recognised by content and pass the review", async () => {
  const subs = (await readWorkbook(published, DOMParser)).sheets;
  const moves = (
    await readWorkbook(
      fs.readFileSync("tests/fixtures/InformacjeOPrzeniesieniach.xlsx"),
      DOMParser,
    )
  ).sheets;
  assert.equal(identify(subs), "substitutions");
  assert.equal(identify(moves), "transfers");
  assert.match(periodOf(subs).from, /^\d{4}-\d{2}-\d{2}$/);
  const manifest = JSON.parse(fs.readFileSync("public/data/manifest.json"));
  const plan = JSON.parse(fs.readFileSync("public" + manifest.files.plan));
  const { summary, messages } = review({
    subs,
    moves,
    published: { subs, moves },
    plan,
  });
  assert.ok(summary.substitutions > 0);
  assert.deepEqual(
    messages.filter((m) => m.level === "error"),
    [],
  );
  // Ta sama paczka co opublikowana: nic nie znika i nic się nie zmienia.
  assert.deepEqual(
    messages.filter((m) =>
      ["Zmiany", "Ręczne poprawki", "Okres"].includes(m.group),
    ),
    [],
  );
});

// Mały plan: w poniedziałek na lekcji 2 Skarupa uczy grupę sprzedawców 3K w sali 41,
// a Nowak ma WF z 2A w sali gimnastycznej.
const plan = {
  classes: { k: "3KS", a: "2A" },
  shorts: { classes: { k: "3K", a: "2A" }, rooms: { r41: "41", sg: "SG" } },
  lessons: [
    {
      teacherNames: ["Agnieszka Skarupa"],
      day: 1,
      period: 2,
      classNames: ["3KS"],
      groupNames: ["sprzedawca"],
      roomIds: ["r41"],
      roomNames: ["41"],
      subject: "Obsługa klienta",
    },
    {
      teacherNames: ["Jan Nowak"],
      day: 1,
      period: 2,
      classNames: ["2A"],
      groupNames: ["Cała klasa"],
      roomIds: ["sg"],
      roomNames: ["sala gimnastyczna"],
      subject: "Wychowanie fizyczne",
    },
  ],
};
const HEAD = [
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
const rules = (...rows) =>
  schoolRules(
    { Oddziały: [HEAD, ...rows] },
    {
      Oddziały: [
        [
          "Przeniesiono z",
          "Przeniesiono na",
          "Nauczyciel/wakat",
          "Oddział",
          "Przedmiot",
        ],
      ],
    },
    plan,
  ).map((m) => m.text);

test("Group merge: room of the host group and free of charge", () => {
  const ok = [
    "28.09.2026",
    "2",
    "Kowalska Anna",
    "3K|kucharz",
    "Technologia",
    "41",
    "Skarupa Agnieszka",
    "złączenie grup",
    "Bezpłatne",
  ];
  assert.deepEqual(rules(ok), []);
  const room = rules(ok.with(5, "40"));
  assert.equal(room.length, 1);
  assert.match(
    room[0],
    /sala 40, a Skarupa Agnieszka prowadzi wtedy grupę sprzedawca tej samej klasy .* w sali 41/,
  );
  const paid = rules(ok.with(8, "Dodatkowo płatne"));
  assert.equal(paid.length, 1);
  assert.match(paid[0], /powinno być „Bezpłatne”, jest „Dodatkowo płatne”/);
  // Złączenie rozpoznane z planu, bez słowa w uwagach — też z innej klasy.
  const other = rules([
    "28.09.2026",
    "2",
    "Kowalska Anna",
    "1TFH",
    "Biologia",
    "12",
    "Skarupa Agnieszka",
    "",
    "Dodatkowo płatne",
  ]);
  assert.equal(other.length, 2);
  assert.match(other[0], /klasy 3KS/);
  // Zastępca z własną lekcją odwołaną tego dnia nie łączy grup.
  assert.deepEqual(
    rules(
      [
        "28.09.2026",
        "2",
        "Kowalska Anna",
        "1TFH",
        "Biologia",
        "12",
        "Skarupa Agnieszka",
        "",
        "Dodatkowo płatne",
      ],
      [
        "28.09.2026",
        "2",
        "Skarupa Agnieszka",
        "3K|sprzedawca",
        "Obsługa klienta",
        "41",
        "Uczniowie zwolnieni do domu",
        "",
        "",
      ],
    ),
    [],
  );
});

test("Physical education merges may use another room, but stay free", () => {
  const pe = [
    "28.09.2026",
    "2",
    "Kowalska Anna",
    "2A|dz",
    "Wychowanie fizyczne",
    "8",
    "Nowak Jan",
    "złączenie grup",
    "Bezpłatne",
  ];
  assert.deepEqual(rules(pe), []);
  assert.equal(rules(pe.with(8, "Płatne")).length, 1);
});

test("Library lessons must be free of charge", () => {
  const lib = [
    "29.09.2026",
    "5",
    "Kowalska Anna",
    "2A",
    "Zajęcia biblioteczne",
    "bib",
    "Wrzeszcz Barbara",
    "",
    "Płatne",
  ];
  assert.match(
    rules(lib)[0],
    /Zajęcia biblioteczne|zastępca Wrzeszcz Barbara: forma płatności „Płatne”/,
  );
  assert.deepEqual(rules(lib.with(8, "Bezpłatne")), []);
});

// Zbiorcze zestawienie (syntetyczne): 28.09.2026 to liczba seryjna 46293.
const ABSENT_HEAD = [
  "Data",
  "Godzina od",
  "Godzina do",
  "Numer lekcji",
  "Liczba godzin",
  "Typ danych",
  "Oddział/dziennik/grupa",
  "Oddział/dziennik/grupa z podziałem",
  "Nazwa zajęć",
];
const overview = (absent = [], merges = []) => ({
  "Opis parametrów": [["Okres: 28.09.2026 (pon.) - 04.10.2026 (niedz.)"]],
  "Dane nieobecności oddziałów": [ABSENT_HEAD, ...absent],
  "Dane zastępstwa": [
    [
      "Data",
      "Numer lekcji",
      "Oddział/dziennik/grupa/miejsce dyżuru z podziałem",
      "Zastępstwo",
      "Skutek nieobecności",
    ],
    ...merges,
  ],
});
const paidSub = [
  "28.09.2026",
  "2",
  "Kowalska Anna",
  "1TFH",
  "Biologia",
  "12",
  "Skarupa Agnieszka",
  "",
  "Dodatkowo płatne",
];
const withOverview = (ov, ...rows) =>
  schoolRules({ Oddziały: [HEAD, ...rows] }, undefined, plan, ov).map(
    (m) => m.text,
  );

test("Class away on a trip: no merge, paid substitution stays as a warning", () => {
  assert.equal(identify(overview()), "overview");
  const trip = overview([
    [
      "46293",
      "08:50",
      "09:35",
      "2",
      "1",
      "Oddział",
      "3K",
      "3K|sprzedawca",
      "Obsługa klienta",
    ],
  ]);
  const out = withOverview(trip, paidSub);
  assert.equal(out.length, 1);
  assert.match(
    out[0],
    /lekcję z 3KS \(Obsługa klienta\), ale ten oddział jest nieobecny\. Zastępstwo jest „Dodatkowo płatne”/,
  );
  assert.deepEqual(withOverview(trip, paidSub.with(8, "Bezpłatne")), []);
  // Nieobecna inna grupa tej klasy nie zwalnia zastępcy.
  const other = overview([
    [
      "46293",
      "08:50",
      "09:35",
      "2",
      "1",
      "Oddział",
      "3K",
      "3K|kucharz",
      "Technologia",
    ],
  ]);
  assert.match(
    withOverview(other, paidSub)[0],
    /złączenie powinno być „Bezpłatne”/,
  );
});

test("Merge recorded only in the diary is still checked", () => {
  const sub = [
    "28.09.2026",
    "2",
    "Kowalska Anna",
    "2A",
    "Matematyka",
    "12",
    "Wrzeszcz Barbara",
    "",
    "Dodatkowo płatne",
  ];
  assert.deepEqual(withOverview(overview(), sub), []);
  const out = withOverview(
    overview(
      [],
      [["46293", "2", "2A", "Wrzeszcz Barbara [WB]", "Złączenie grup"]],
    ),
    sub,
  );
  assert.equal(out.length, 1);
  assert.match(
    out[0],
    /ma złączenie grup \(według dziennika\) — złączenie powinno być „Bezpłatne”/,
  );
});

test("Only the substitutions file is required", async () => {
  const subs = (await readWorkbook(published, DOMParser)).sheets;
  const { summary, messages } = review({ subs });
  assert.equal(summary.transfers, null);
  assert.equal(summary.classAbsences, null);
  assert.deepEqual(
    messages.filter((m) => m.level !== "info"),
    [],
  );
  assert.ok(messages.some((m) => m.text.startsWith("Bez pliku przeniesień")));
  assert.ok(
    messages.some((m) => m.text.startsWith("Bez zbiorczego zestawienia")),
  );
  const withOv = review({ subs, overview: overview() });
  assert.equal(withOv.summary.classAbsences, 0);
});

test("Combined overview keeps no absence reasons and no diary names", () => {
  const raw = {
    ...overview([
      [
        "46293",
        "08:50",
        "09:35",
        "2",
        "1",
        "Oddział",
        "3K",
        "3K|sprzedawca",
        "Obsługa klienta",
      ],
    ]),
    "Dane nieobecności": [
      [
        "Data",
        "Oddział/dziennik/grupa/miejsce dyżuru",
        "Prowadzący",
        "Powód nieobecności",
      ],
      [
        "46293",
        "IN - Nazwisko Imie [1A]",
        "Kowalska Anna",
        "Zwolnienie lekarskie",
      ],
    ],
    "Dane zastępstwa": [
      [
        "Data",
        "Numer lekcji",
        "Oddział/dziennik/grupa/miejsce dyżuru z podziałem",
        "Prowadzący",
        "Zastępstwo",
        "Powód nieobecności",
        "Skutek nieobecności",
      ],
      [
        "46293",
        "2",
        "2A",
        "Kowalska Anna",
        "Wrzeszcz Barbara [WB]",
        "Zwolnienie lekarskie",
        "Złączenie grup",
      ],
    ],
    "Raport nieobecności": [["Powód nieobecności", "Zwolnienie lekarskie"]],
  };
  const reduced = reduceOverview(raw);
  const text = JSON.stringify(reduced);
  for (const secret of ["Zwolnienie", "Powód", "Nazwisko", "Kowalska"])
    assert.ok(!text.includes(secret), secret);
  assert.deepEqual(Object.keys(reduced).sort(), [
    "Dane nieobecności oddziałów",
    "Dane zastępstwa",
    "Opis parametrów",
  ]);
  const sub = [
    "28.09.2026",
    "2",
    "Kowalska Anna",
    "2A",
    "Matematyka",
    "12",
    "Wrzeszcz Barbara",
    "",
    "Dodatkowo płatne",
  ];
  assert.match(withOverview(reduced, sub)[0], /według dziennika/);
  assert.equal(periodOf(reduced).from, "2026-09-28");
});
