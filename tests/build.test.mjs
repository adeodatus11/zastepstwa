import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import XLSX from "xlsx";
const root = process.cwd();
async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zsz5-validation-"));
  const config = JSON.parse(await fs.readFile("publication.json", "utf8"));
  for (const file of [
    "publication.json",
    "schedule-changes.js",
    ...Object.values(config.sources),
  ])
    await fs.copyFile(file, path.join(dir, file));
  await fs.cp("scripts", path.join(dir, "scripts"), { recursive: true });
  await fs.mkdir(path.join(dir, "src/content"), { recursive: true });
  await fs.mkdir(path.join(dir, "src/lib"), { recursive: true });
  await fs.copyFile("src/lib/schema.mjs", path.join(dir, "src/lib/schema.mjs"));
  await fs.copyFile(
    "src/content/specialists.json",
    path.join(dir, "src/content/specialists.json"),
  );
  await fs.symlink(
    path.join(root, "node_modules"),
    path.join(dir, "node_modules"),
  );
  return { dir, config };
}
const run = (dir) =>
  spawnSync(process.execPath, ["scripts/build/data.mjs"], {
    cwd: dir,
    encoding: "utf8",
  });
test("Missing required source stops publication and preserves previous manifest", async () => {
  const { dir, config } = await fixture();
  try {
    await fs.mkdir(path.join(dir, "public/data"), { recursive: true });
    await fs.writeFile(path.join(dir, "public/data/manifest.json"), "previous");
    await fs.unlink(path.join(dir, config.sources.substitutions));
    assert.notEqual(run(dir).status, 0);
    assert.equal(
      await fs.readFile(path.join(dir, "public/data/manifest.json"), "utf8"),
      "previous",
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("Incorrect spreadsheet headers stop publication instead of pretending no changes", async () => {
  const { dir, config } = await fixture();
  try {
    const w = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      w,
      XLSX.utils.aoa_to_sheet([["Błędna kolumna"], ["wartość"]]),
      "Oddziały",
    );
    await fs.writeFile(
      path.join(dir, config.sources.substitutions),
      XLSX.write(w, { type: "buffer", bookType: "xlsx" }),
    );
    assert.notEqual(run(dir).status, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("A valid header-only substitution sheet publishes zero changes", async () => {
  const { dir, config } = await fixture();
  try {
    const w = XLSX.read(await fs.readFile(config.sources.substitutions), {
      type: "buffer",
    });
    const rows = XLSX.utils.sheet_to_json(w.Sheets["Oddziały"], { header: 1 });
    const empty = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      empty,
      XLSX.utils.aoa_to_sheet([rows[0]]),
      "Oddziały",
    );
    await fs.writeFile(
      path.join(dir, config.sources.substitutions),
      XLSX.write(empty, { type: "buffer", bookType: "xlsx" }),
    );
    const result = run(dir);
    assert.equal(result.status, 0, result.stderr);
    const m = JSON.parse(
      await fs.readFile(path.join(dir, "public/data/manifest.json")),
    );
    assert.equal(m.counts.substitutions, 0);
    assert.equal(m.counts.dutyChanges, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
