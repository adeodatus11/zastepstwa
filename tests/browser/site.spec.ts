import { test, expect } from "@playwright/test";
import fs from "node:fs";
const manifest = JSON.parse(
  fs.readFileSync("public/data/manifest.json", "utf8"),
);
const changes = JSON.parse(
  fs.readFileSync("public" + manifest.files.changes, "utf8"),
);
const pages = [
  "index",
  "aktualnosci",
  "plan",
  "zastepstwa",
  "plan-lekcji-2026-09-07",
  "dyzury-nadzoru",
  "pomoc-psychologiczno-pedagogiczna",
  "calendar-2026-2027",
  "wykaz-podzialow-grup",
  "sale-sg-obiekty-zewnetrzne-2026-2027",
  "materialy",
  "przewodnik",
  "aktualizuj",
];
for (const width of [320, 390, 768, 834, 1024, 1440])
  test(`All routes at ${width}px: loading, errors, overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
    });
    for (const name of pages) {
      await page.goto(`/${name}.html`);
      if (
        ![
          "aktualnosci",
          "materialy",
          "sale-sg-obiekty-zewnetrzne-2026-2027",
          "przewodnik",
          "aktualizuj",
        ].includes(name)
      )
        await expect(page.locator("#data-status[data-loaded]")).toContainText(
          "Dane opublikowane",
        );
      await expect(page.locator("h1")).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        name,
      ).toBe(true);
      await expect(page.locator("img").first()).toBeVisible();
      if (
        [390, 834, 1440].includes(width) &&
        test.info().project.name === "chromium"
      )
        await page.screenshot({
          path: `reports/screens/${name}-${width}.png`,
          fullPage: true,
        });
    }
    expect(errors).toEqual([]);
  });
test("Mobile selection, day/week, changes, saved teacher, preserved URL and reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/plan.html?date=2026-09-07");
  await expect(page.locator("#data-status[data-loaded]")).toContainText(
    "Dane opublikowane",
  );
  await page.locator("#selector-summary").click();
  await page.locator("#search").fill("Najwer");
  await page.locator("#favorite").click();
  await expect(page.locator("#favorite-status")).toContainText("Zapisano");
  await page.locator("#selector-summary").click();
  await expect(page.locator("#selection-title")).toContainText("Najwer");
  await page.locator("#week").click();
  await expect(page.locator(".day-heading")).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#date").fill(changes.substitutions[0].date);
  await page.locator("#changes").click();
  await expect(page.locator(".change-row")).not.toHaveCount(0);
  await page.reload();
  await expect(page.locator("#changes")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
test("Future invalid period, weekend, empty search and keyboard menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/plan.html?date=2027-01-01");
  await expect(page.locator("#validity")).toContainText("poza okresem");
  await expect(page.locator(".lesson")).toHaveCount(0);
  await page.locator("#date").fill("2026-09-12");
  await page.locator("#date").press("Tab");
  await expect(page.locator(".lesson")).toHaveCount(0);
  await page.locator("#selector-summary").click();
  await page.locator("#search").fill("zzzzzzzzzzzz");
  await expect(page.locator("#selection-title")).toContainText("Brak wyników");
  await page.getByRole("button", { name: "Menu", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation")).toBeVisible();
});
test("Calendar filters and all views; groups and school contacts", async ({
  page,
}) => {
  await page.goto("/calendar-2026-2027.html");
  await expect(page.locator("#data-status[data-loaded]")).toContainText(
    "Dane opublikowane",
  );
  for (const v of ["day", "week", "month", "year", "list"]) {
    await page.locator("#cal-view").selectOption(v);
    await expect(page.locator("#calendar")).not.toBeEmpty();
  }
  await page.locator("#category").selectOption("exam");
  await page.goto("/wykaz-podzialow-grup.html");
  await page.locator("#group-search").fill("1TFA");
  await expect(page.locator("#groups")).toContainText("1TFA");
  await page
    .getByRole("button", { name: "Nauczyciele oddziału", exact: true })
    .click();
  await expect(page.locator("#copy-teachers")).toBeVisible();
  // Tydzień z grafikiem w repozytorium — test nie może zależeć od tego,
  // czy grafik na bieżący tydzień został już wgrany.
  await page.clock.install({ time: new Date("2026-10-07T10:00:00+02:00") });
  await page.goto("/dyzury-nadzoru.html");
  await page.locator("#contact-day").selectOption("all");
  await expect(page.locator(".contacts-week th")).toHaveCount(5);
  const thisWeek = await page.locator("#contact-week").innerText();
  await page.locator("#contact-next").click();
  await expect(page.locator("#contact-week")).not.toHaveText(thisWeek);
  await page.locator("#contact-this-week").click();
  await expect(page.locator("#contact-week")).toHaveText(thisWeek);
  await expect(page.locator("#contact-this-week")).toBeHidden();
  expect(
    await page.locator("#contacts a").first().getAttribute("href"),
  ).toMatch(/^tel:\+48\d+,\d+$/);
});
test("Read failure retains last snapshot and recovery works", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/plan.html?date=2026-09-07");
  await expect(page.locator("#data-status[data-loaded]")).toContainText(
    "Dane opublikowane",
  );
  const before = await page.locator("#schedule").innerText();
  await page.route("**/data/manifest.json", (route) => route.abort());
  await page.clock.fastForward(120001);
  await expect(page.locator("#data-status")).toContainText(
    "ostatnio odczytaną",
  );
  expect(await page.locator("#schedule").innerText()).toBe(before);
  await page.unroute("**/data/manifest.json");
  await page.getByRole("button", { name: "Spróbuj ponownie" }).click();
  await expect(page.locator("#data-status[data-loaded]")).toContainText(
    "Dane opublikowane",
  );
});
// TV pokazuje same zastępstwa według nieobecnych nauczycieli. Dane podstawione
// w teście, żeby nie zależały od opublikowanej paczki.
const tvPeriods = [
  ["08:00", "08:45"],
  ["08:50", "09:35"],
  ["09:40", "10:25"],
  ["10:35", "11:20"],
  ["11:25", "12:10"],
  ["12:25", "13:10"],
  ["13:15", "14:00"],
  ["14:05", "14:50"],
  ["14:55", "15:40"],
  ["15:45", "16:30"],
  ["16:35", "17:20"],
];
const tvSub = (
  date: string,
  absent: string,
  period: number,
  className: string,
  substitute: string,
  kind = "teacher_substitution",
) => ({
  date,
  period,
  timeFrom: tvPeriods[period - 1][0],
  timeTo: tvPeriods[period - 1][1],
  branch: { raw: className, className, groupName: "" },
  subject: "Zajęcia praktyczne - projektowanie i wykonywanie fryzur",
  replacementSubject: "Zajęcia praktyczne - projektowanie i wykonywanie fryzur",
  absentTeacherName: absent,
  substituteTeacherName: substitute,
  rawSubstituteLabel: substitute,
  kind,
  room: "31",
});
async function tvWith(page: any, substitutions: any[], time: string) {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.route(/\/data\/changes\..*\.json/, async (route: any) => {
    const response = await route.fetch();
    const json = await response.json();
    route.fulfill({ response, json: { ...json, substitutions } });
  });
  await page.clock.install({ time: new Date(time) });
  await page.goto("/tv.html");
}
const fitsOnScreen = (page: any) =>
  page
    .locator(".tvz-list")
    .evaluate(
      (l: HTMLElement) =>
        l.scrollHeight <= l.clientHeight && l.scrollWidth <= l.clientWidth,
    );
test("TV shows only substitutions, grouped by absent teacher", async ({
  page,
}) => {
  await tvWith(
    page,
    [
      tvSub("2026-10-12", "Anna Nowak", 1, "1A", "Jan Kowalski"),
      tvSub("2026-10-12", "Anna Nowak", 4, "2B", "Ewa Zielińska"),
      tvSub("2026-10-12", "Anna Nowak", 5, "2B", "Ewa Zielińska"),
      tvSub("2026-10-12", "Anna Nowak", 6, "2B", "Ewa Zielińska"),
      tvSub("2026-10-12", "Piotr Wiśniewski", 3, "3C", "", "late"),
      tvSub("2026-10-13", "Inna Osoba", 2, "4D", "Jan Kowalski"),
    ],
    "2026-10-12T09:00:00+02:00",
  );
  await expect(page.locator(".tvz-teacher")).toHaveCount(2);
  await expect(page.locator(".tv-card")).toHaveCount(0);
  if (test.info().project.name === "chromium")
    await page.screenshot({ path: "reports/screens/tv-1080.png" });
  const anna = page.locator(".tvz-teacher", { hasText: "Anna Nowak" });
  // Lekcja 1 już się skończyła; 4–6 z tym samym zastępcą to jeden wiersz.
  await expect(anna.locator(".tvz-row")).toHaveCount(1);
  await expect(anna).toContainText("4–6");
  await expect(anna).toContainText("→ Ewa Zielińska");
  // Kolejność kart: według pierwszej pozostałej lekcji.
  await expect(page.locator(".tvz-teacher").first()).toContainText(
    "Piotr Wiśniewski",
  );
  await expect(page.locator(".tvz-teacher").first()).toContainText(
    "Przychodzą później",
  );
  await expect(page.locator(".tvz-row.now")).toHaveCount(0);
  await page.clock.fastForward("01:00:00");
  await expect(page.locator(".tvz-row.now")).toHaveCount(1);
  // Inny dzień nie trafia na dzisiejszy ekran.
  await expect(page.locator("#tv-content")).not.toContainText("Inna Osoba");
  expect(await fitsOnScreen(page)).toBe(true);
  // Nagłówek: adres pełnego planu, sale WF i kod QR; stopki nie ma.
  const header = page.locator(".site-header");
  await expect(header).toContainText("www.plan.szkolamistrzow.info");
  await expect(header.locator(".tv-info")).toContainText("Wychowanie fizyczne");
  await expect(header.locator(".tv-info")).toContainText(
    "sala 8 · sala 39 · siłownia · obiekty zewnętrzne według grafiku",
  );
  await expect(header.locator(".tv-qr")).toBeVisible();
  await expect(header.locator("#tv-clock")).toContainText(
    "poniedziałek12 października",
  );
  await expect(page.locator(".tv-footer")).toHaveCount(0);
});
test("TV after the last substitution shows the next day with a title", async ({
  page,
}) => {
  await tvWith(
    page,
    [
      tvSub("2026-10-12", "Anna Nowak", 1, "1A", "Jan Kowalski"),
      tvSub("2026-10-13", "Inna Osoba", 2, "4D", "Jan Kowalski"),
    ],
    "2026-10-12T12:00:00+02:00",
  );
  await expect(page.locator(".tvz-title")).toContainText(
    "Zastępstwa na wtorek, 13 października",
  );
  await expect(page.locator(".tvz-teacher")).toHaveCount(1);
  await expect(page.locator(".tvz-teacher")).toContainText("Inna Osoba");
});
test("Text zoom 200% remains inside viewport, print retains schedule", async ({
  page,
}) => {
  await page.goto("/plan.html?date=2026-09-07");
  await expect(page.locator("#data-status[data-loaded]")).toContainText(
    "Dane opublikowane",
  );
  await page.addStyleTag({ content: ":root{font-size:32px!important}" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".lesson").first()).toBeVisible();
  await expect(page.locator(".site-header")).toBeHidden();
});
test("Calendar search, confirmation filter, paginated list and same-day meeting", async ({
  page,
}) => {
  await page.goto("/calendar-2026-2027.html");
  await expect(page.locator("#data-status[data-loaded]")).toContainText(
    "Dane opublikowane",
  );
  await page.locator("#calendar-date").fill("2026-09-09");
  await page.locator("#cal-view").selectOption("day");
  await expect(page.locator("#calendar")).toContainText("15:45");
  await page.locator("#cal-view").selectOption("list");
  await page.locator("#event-search").fill("RADA");
  await expect(page.locator("#calendar article")).not.toHaveCount(0);
  await page.locator("#event-search").fill("zzzzzzz");
  await expect(page.locator("#calendar")).toContainText("Brak wydarzeń");
  await page.locator("#event-search").fill("");
  await page.locator("#confirmation-only").click();
  await expect(page.locator("#calendar")).toContainText(
    "Termin do potwierdzenia",
  );
});
test("Old plan entrypoints retain their semantics after another selection", async ({
  page,
}) => {
  await page.goto("/plan.html?type=teacher&date=2026-09-07&mode=base");
  await expect(page.locator("#data-status[data-loaded]")).toContainText(
    "Dane opublikowane",
  );
  await page.goto("/zastepstwa.html");
  await expect(page.locator("#mode")).toHaveValue("changes");
  await page.goto("/sale-sg-obiekty-zewnetrzne-2026-2027.html");
  await expect(page.locator("h1")).toContainText("Basen i Lodowisko - grafik");
  await expect(page.locator(".external-schedule")).toContainText(
    "rolki / lodowisko",
  );
  await expect(page.locator("#entity-type")).toHaveCount(0);
  await page.goto("/plan-lekcji-2026-09-07.html");
  await expect(page.locator("#mode")).toHaveValue("base");
});
test("Malformed first load can be retried without losing page controls", async ({
  page,
}) => {
  await page.route("**/data/manifest.json", (route) =>
    route.fulfill({ json: { schemaVersion: 99 } }),
  );
  await page.goto("/plan.html");
  await expect(page.locator("#data-status")).toContainText("Nie można wczytać");
  await page.unroute("**/data/manifest.json");
  await page.getByRole("button", { name: "Spróbuj ponownie" }).click();
  await expect(page.locator("#data-status[data-loaded]")).toContainText(
    "Dane opublikowane",
  );
  await expect(page.locator("#entity option")).not.toHaveCount(0);
});
test("TV fits a heavy day on one screen without scrolling", async ({
  page,
}) => {
  const heavy = Array.from({ length: 15 }, (_, t) =>
    Array.from({ length: 7 }, (_, k) =>
      tvSub(
        "2026-10-15",
        `Nauczycielka Nieobecna ${t + 1}`,
        1 + ((t + k * 2) % 11),
        `${1 + (k % 4)}TF${"ABCDE"[t % 5]}`,
        `Zastępczyni Długiego Nazwiska-Dwuczłonowa ${k}`,
      ),
    ),
  ).flat();
  await tvWith(page, heavy, "2026-10-15T07:30:00+02:00");
  await expect(page.locator(".tvz-teacher")).toHaveCount(15);
  await expect(page.locator(".tvz-row")).toHaveCount(105);
  expect(await fitsOnScreen(page)).toBe(true);
  // Nic nie wychodzi poza ekran 1080×1920.
  const box = await page.locator("main").boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(1920);
});

test("Timetable aligns lesson slots and duty replacements retain source details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    "/plan.html?type=teacher&date=2026-09-07&view=week&mode=changes",
  );
  await expect(page.locator(".day-heading")).toHaveCount(5);
  await expect(page.locator(".break-chip")).not.toHaveCount(0);
  await expect(
    page.locator(".timetable tbody th").filter({ hasText: "Przerwa" }),
  ).toHaveCount(0);
  await expect(page.locator(".break-chip").first()).toContainText(
    "10:25–10:35",
  );
  const rows = page.locator(".timetable tbody tr");
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all())
    await expect(row.locator("th, td")).toHaveCount(7);
  const duty = changes.dutyChanges.find((d: any) => d.substituteTeacherName);
  await page.locator("#date").fill(duty.date);
  await page.locator("#duty-changes").click();
  for (const value of [
    duty.absentTeacherName,
    duty.substituteTeacherName,
    duty.time,
  ])
    await expect(page.locator(".duty-changes-table")).toContainText(value);
  await page.locator("#next").click();
  const next = new Date(duty.date + "T12:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  await expect(page.locator("#date")).toHaveValue(
    next.toISOString().slice(0, 10),
  );
  await page.reload();
  await expect(page.locator("#duty-changes")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#date").fill("2026-09-12");
  await page.locator("#date").press("Tab");
  await expect(page.locator("#schedule")).toContainText(
    "Brak zastępstw dyżurów",
  );
});

test("TV hides the site menu on wide screens", async ({ page }) => {
  for (const width of [1080, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1920 });
    await page.goto("/tv.html");
    await expect(page.locator("#navigation")).toBeHidden();
    await expect(page.locator(".site-header .header-guide")).toBeHidden();
    await expect(page.locator(".site-header .tv-qr")).toBeVisible();
  }
});
test("Update page: checks the package and commits only the provided files", async ({
  page,
}) => {
  const trees: string[][] = [];
  await page.route("https://api.github.com/**", async (route) => {
    const request = route.request();
    const p = new URL(request.url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (p.includes("/contents/"))
      return route.fulfill({
        status: 200,
        body: fs.readFileSync(decodeURIComponent(p.split("/contents/")[1])),
      });
    if (p === "/user") return json({ login: "test" });
    if (p.endsWith("/git/ref/heads/przebudowa"))
      return json({ object: { sha: "p1" } });
    if (p.endsWith("/git/commits/p1")) return json({ tree: { sha: "t0" } });
    if (p.endsWith("/git/blobs")) return json({ sha: "b1" });
    if (p.endsWith("/git/trees")) {
      trees.push(
        JSON.parse(request.postData()!).tree.map(
          (t: { path: string }) => t.path,
        ),
      );
      return json({ sha: "t1" });
    }
    if (p.endsWith("/git/commits"))
      return json({ sha: "c1c1c1c", html_url: "https://github.com/" });
    if (p.endsWith("/git/refs/heads/przebudowa")) return json({});
    if (p.endsWith("/actions/runs")) return json({ workflow_runs: [] });
    return route.fulfill({ status: 500 });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/aktualizuj.html");
  await expect(page.locator("#publish")).toBeDisabled();
  await page.locator("#files").setInputFiles(["InformacjeOZastepstwach.xlsx"]);
  await expect(page.locator("#review-status")).toHaveClass(/ok|warning/);
  await expect(page.locator("#summary")).toContainText("bez pliku");
  await expect(page.locator("#messages")).toContainText(
    "Bez pliku przeniesień",
  );
  await page.locator("#token").fill("test-token");
  if (await page.locator("#confirm-row").isVisible())
    await page.locator("#confirm").check();
  await page.locator("#publish").click();
  await expect(page.locator("#publish-status")).toContainText("Wysłano");
  expect(trees).toEqual([["InformacjeOZastepstwach.xlsx"]]);
  expect(
    await page.evaluate(() => sessionStorage.getItem("zastepstwa-token")),
  ).toBe("test-token");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Plan links open class, room and teacher plans; print heading names the plan", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    "/plan.html?type=teacher&date=2026-09-07&view=week&mode=base",
  );
  await expect(page.locator(".timetable")).toBeVisible();
  const teacher = (await page.locator("#selection-title").textContent())!;
  const classLink = page.locator(".timetable a.plan-link[href*='type=class']");
  const className = (await classLink.first().textContent())!;
  await classLink.first().click();
  await expect(page.locator("#selection-title")).toHaveText(className);
  await expect(page.locator("#entity-type")).toHaveValue("class");
  expect(page.url()).toContain("type=class");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#plan-print-heading")).toBeVisible();
  await expect(page.locator("#plan-print-heading")).toContainText(
    `Plan oddziału ${className}`,
  );
  await expect(page.locator(".page-heading")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator("#plan-print-heading")).toBeHidden();
  const roomLink = page.locator(".timetable a.plan-link[href*='type=room']");
  const roomName = (await roomLink.first().textContent())!;
  await roomLink.first().click();
  await expect(page.locator("#selection-title")).toHaveText(roomName);
  await expect(page.locator("#entity-type")).toHaveValue("room");
  await page.goBack();
  await expect(page.locator("#selection-title")).toHaveText(className);
  await page.goBack();
  await expect(page.locator("#selection-title")).toHaveText(teacher);
  await expect(page.locator("#entity-type")).toHaveValue("teacher");
});
