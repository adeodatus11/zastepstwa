import { test, expect } from "@playwright/test";
const pages = [
  "index",
  "plan",
  "zastepstwa",
  "plan-lekcji-2026-09-07",
  "dyzury-nadzoru",
  "pomoc-psychologiczno-pedagogiczna",
  "calendar-2026-2027",
  "wykaz-podzialow-grup",
  "sale-sg-obiekty-zewnetrzne-2026-2027",
  "materialy",
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
      if (name !== "materialy")
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
  await page.goto("/dyzury-nadzoru.html");
  await page.locator("#contact-day").selectOption("all");
  await expect(page.locator("#contacts section")).toHaveCount(5);
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
test("TV completes two accelerated rotations without clipping any panel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.clock.install({ time: new Date("2026-09-07T08:00:00+02:00") });
  await page.goto("/tv.html");
  await expect(page.locator(".tv-card")).not.toHaveCount(0);
  if (test.info().project.name === "chromium")
    await page.screenshot({ path: "reports/screens/tv-1080.png" });
  const sequence = new Set<string>();
  let rotations = 0,
    first = await page.locator("#tv-content").innerText();
  for (let i = 0; i < 350; i++) {
    const content = await page.locator("#tv-content").innerText();
    if (i > 0 && content === first) {
      rotations++;
      if (rotations === 2) break;
    }
    sequence.add(content);
    const overflow = await page
      .locator(".tv-card")
      .evaluateAll((nodes) =>
        nodes.some((n) => n.scrollHeight > n.clientHeight + 1),
      );
    expect(overflow, `TV slide ${i}`).toBe(false);
    await page.clock.fastForward(10000);
  }
  expect(rotations).toBe(2);
  expect(sequence.size).toBeGreaterThan(1);
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
  await expect(page.locator("#data-status[data-loaded]")).toContainText(
    "Dane opublikowane",
  );
  await expect(page.locator("#entity-type")).toHaveValue("room");
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
for (const date of ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"])
  test(`TV all panels fit on ${date}`, async ({ page }) => {
    await page.setViewportSize({ width: 1080, height: 1920 });
    await page.clock.install({ time: new Date(`${date}T08:00:00+02:00`) });
    await page.goto("/tv.html");
    await expect(page.locator(".tv-card")).not.toHaveCount(0);
    const first = await page.locator("#tv-content").innerText();
    let complete = false;
    for (let i = 0; i < 180; i++) {
      if (i > 0 && (await page.locator("#tv-content").innerText()) === first) {
        complete = true;
        break;
      }
      const clipped = await page
        .locator(".tv-card")
        .evaluateAll((nodes) =>
          nodes.some((n) => n.scrollHeight > n.clientHeight + 1),
        );
      expect(clipped, `${date} slide ${i}`).toBe(false);
      await page.clock.fastForward(10000);
    }
    expect(complete).toBe(true);
  });

test("Timetable aligns lesson slots and duty replacements retain source details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    "/plan.html?type=teacher&date=2026-09-07&view=week&mode=changes",
  );
  await expect(page.locator(".day-heading")).toHaveCount(5);
  const rows = page.locator(".timetable tbody tr");
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all())
    await expect(row.locator("th, td")).toHaveCount(7);
  await page.locator("#duty-changes").click();
  await expect(page.locator(".duty-changes-table")).toContainText(
    "Krystyna Stępień",
  );
  await expect(page.locator(".duty-changes-table")).toContainText(
    "Magdalena Nowak",
  );
  await expect(page.locator(".duty-changes-table")).toContainText(
    "10:25-10:35",
  );
  await page.locator("#next").click();
  await expect(page.locator("#date")).toHaveValue("2026-09-08");
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
