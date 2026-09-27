// Strona aktualizacji zastępstw: surowe eksporty z dziennika są czytane
// i czyszczone w tej przeglądarce; na GitHuba trafiają tylko pliki oczyszczone.
import { sanitize } from "./sanitize.mjs";
import { readWorkbook } from "./xlsx.mjs";
import { identify, reduceOverview, review } from "./checks.mjs";
import {
  REPO,
  commitFiles,
  fetchPublished,
  publishState,
  whoami,
} from "./github.mjs";

const PATHS = {
  substitutions: "InformacjeOZastepstwach.xlsx",
  transfers: "InformacjeOPrzeniesieniach.xlsx",
};
const LABELS = {
  substitutions: "Zastępstwa",
  transfers: "Przeniesienia",
  overview: "Zbiorcze zestawienie zmian",
};
// Na GitHuba idą tylko te pliki, które użytkownik wrzucił.
const uploads = () => Object.keys(PATHS).filter((k) => state.files[k]);
const JOBS = {
  build: "Sprawdzenie i budowa serwisu nauczyciela",
  deploy: "Publikacja nauczyciel.szkolamistrzow.info",
  "plan-uczniowski": "Aktualizacja plan.szkolamistrzow.info",
};
const TOKEN_KEY = "zastepstwa-token";
const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const plDate = (iso) => iso.split("-").reverse().join(".");

const state = { files: {}, result: null, plan: null, published: undefined };

function storage(kind) {
  try {
    return kind === "local" ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}
function loadToken() {
  for (const kind of ["local", "session"]) {
    try {
      const t = storage(kind)?.getItem(TOKEN_KEY);
      if (t) {
        $("token").value = t;
        $("remember").checked = kind === "local";
        return;
      }
    } catch {
      /* brak dostępu do pamięci przeglądarki */
    }
  }
}
function saveToken() {
  const token = $("token").value.trim();
  for (const kind of ["local", "session"])
    try {
      storage(kind)?.removeItem(TOKEN_KEY);
    } catch {
      /* j.w. */
    }
  if (!token) return;
  try {
    storage($("remember").checked ? "local" : "session")?.setItem(
      TOKEN_KEY,
      token,
    );
  } catch {
    /* j.w. */
  }
}

function say(id, html, kind = "") {
  const el = $(id);
  el.className = "status" + (kind ? " " + kind : "");
  el.innerHTML = html;
}

async function loadPlan() {
  if (state.plan) return state.plan;
  const manifest = await (
    await fetch("/data/manifest.json", { cache: "no-store" })
  ).json();
  state.plan = await (await fetch(manifest.files.plan)).json();
  return state.plan;
}

async function loadPublished() {
  if (state.published !== undefined) return state.published;
  const token = $("token").value.trim();
  try {
    const [s, m] = await Promise.all([
      fetchPublished(token, PATHS.substitutions),
      fetchPublished(token, PATHS.transfers),
    ]);
    const [subs, moves] = await Promise.all([
      readWorkbook(s, DOMParser),
      readWorkbook(m, DOMParser),
    ]);
    state.published = { subs: subs.sheets, moves: moves.sheets };
  } catch (e) {
    state.published = null;
    state.publishedError = e.message;
  }
  return state.published;
}

async function addFiles(list) {
  say("files-status", "Czytam i czyszczę pliki…");
  const notes = [];
  for (const file of list) {
    try {
      const raw = new Uint8Array(await file.arrayBuffer());
      const { sheets } = await readWorkbook(raw, DOMParser);
      const kind = identify(sheets);
      if (!kind) {
        notes.push(
          `<b>${esc(file.name)}</b>: to nie jest eksport zastępstw, przeniesień ani zbiorcze zestawienie zmian z dziennika.`,
        );
        continue;
      }
      // Zestawienie: od razu tylko potrzebne kolumny, bez powodów nieobecności.
      // Nie jest ani czyszczone do wysyłki, ani wysyłane.
      state.files[kind] =
        kind === "overview"
          ? { name: file.name, sheets: reduceOverview(sheets) }
          : {
              name: file.name,
              ...(await sanitize(raw, { DOMParser, XMLSerializer })),
            };
    } catch (e) {
      notes.push(
        `<b>${esc(file.name)}</b>: ${esc(e.message || "nie da się odczytać pliku.")}`,
      );
    }
  }
  renderFiles(notes);
  await check();
}

function renderFiles(notes) {
  const missing = {
    substitutions: "brak pliku — wymagany",
    transfers: "brak — opcjonalny; na stronach zostają obecne przeniesienia",
    overview:
      "brak — opcjonalny; pozwala uwzględnić nieobecności oddziałów (np. wycieczki)",
  };
  $("file-list").innerHTML = Object.keys(LABELS)
    .map((kind) => {
      const f = state.files[kind];
      const done =
        kind === "overview"
          ? "tylko do kontroli; powody nieobecności odrzucone, plik nie jest wysyłany"
          : `oczyszczony${f?.removed ? ` (usunięto ${f.removed} ${f.removed === 1 ? "nazwę dziennika" : "nazw dzienników"})` : ""}`;
      return `<li class="${f ? "ready" : "missing"}"><b>${LABELS[kind]}:</b> ${f ? `${esc(f.name)} — ${done}` : missing[kind]}</li>`;
    })
    .join("");
  say("files-status", notes.join("<br>"), notes.length ? "error" : "");
}

async function check() {
  const { substitutions: s, transfers: m, overview: o } = state.files;
  state.result = null;
  $("review").hidden = !s;
  if (!s) return updateButtons();
  say("review-status", "Sprawdzam paczkę…");
  const [plan, published] = await Promise.all([
    loadPlan().catch(() => null),
    loadPublished(),
  ]);
  state.result = review({
    subs: s.sheets,
    moves: m?.sheets,
    overview: o?.sheets,
    published,
    plan,
  });
  if (!plan)
    state.result.messages.push({
      level: "info",
      group: "Kontrole",
      text: "Nie udało się pobrać planu lekcji — reguły złączeń grup nie zostały sprawdzone.",
    });
  if (!published)
    state.result.messages.push({
      level: "info",
      group: "Kontrole",
      text: `Brak porównania z opublikowaną paczką${state.publishedError ? ` (${state.publishedError})` : ""}.`,
    });
  renderReview();
  updateButtons();
}

function renderReview() {
  const { summary: x, messages } = state.result;
  $("summary").innerHTML = [
    [
      "Okres",
      x.period
        ? `${plDate(x.period.from)} – ${plDate(x.period.to)}`
        : "nieczytelny",
    ],
    ["Zastępstwa", x.substitutions],
    ["Przeniesienia", x.transfers ?? "bez pliku"],
    ...(x.classAbsences === null
      ? []
      : [["Nieobecności oddziałów (lekcje)", x.classAbsences]]),
    ["Dyżury", x.duties],
    ["Zajęcia inne", x.other],
    ["Pominięte (IND)", x.individual],
  ]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join("");
  const errors = messages.filter((m) => m.level === "error").length;
  const warnings = messages.filter((m) => m.level === "warn").length;
  say(
    "review-status",
    errors
      ? `Błędy: ${errors}. Popraw pliki w dzienniku i wgraj je ponownie.`
      : warnings
        ? `Uwagi do sprawdzenia: ${warnings}. Przejrzyj je przed publikacją.`
        : "Kontrole bez uwag.",
    errors ? "error" : warnings ? "warning" : "ok",
  );
  const groups = new Map();
  for (const m of messages)
    groups.set(m.group, [...(groups.get(m.group) ?? []), m]);
  const icon = { error: "Błąd", warn: "Uwaga", info: "Info" };
  $("messages").innerHTML = [...groups]
    .map(
      ([group, list]) =>
        `<section class="check-group"><h3>${esc(group)} <span>(${list.length})</span></h3><ul>${list.map((m) => `<li class="check-${m.level}"><span class="check-level">${icon[m.level]}</span> ${esc(m.text)}</li>`).join("")}</ul></section>`,
    )
    .join("");
  $("confirm-row").hidden = !warnings || !!errors;
  // Potwierdzenie obowiązuje tylko dla tej samej listy uwag.
  const seen = messages.map((m) => m.level + m.text).join("\n");
  if (seen !== state.seen) $("confirm").checked = false;
  state.seen = seen;
}

function updateButtons() {
  const r = state.result;
  const errors = r?.messages.some((m) => m.level === "error");
  const warnings = r?.messages.some((m) => m.level === "warn");
  $("download").disabled = !r || errors;
  $("publish").disabled =
    !r ||
    errors ||
    (warnings && !$("confirm").checked) ||
    !$("token").value.trim();
}

function download() {
  for (const kind of uploads()) {
    const url = URL.createObjectURL(
      new Blob([state.files[kind].bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: PATHS[kind],
    });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

async function publish() {
  const token = $("token").value.trim();
  saveToken();
  $("publish").disabled = true;
  say("publish-status", "Wysyłam oczyszczone pliki…");
  try {
    const who = await whoami(token);
    const p = state.result.summary.period;
    const what = state.files.transfers
      ? "zastępstw i przeniesień"
      : "zastępstw";
    const message = `Aktualizacja ${what} ${plDate(p.from)}–${plDate(p.to)}\n\nOczyszczone eksporty z dziennika wgrane przez stronę aktualizacji (${who}).`;
    const res = await commitFiles(
      token,
      uploads().map((k) => ({
        path: PATHS[k],
        bytes: state.files[k].bytes,
      })),
      message,
    );
    if (res.unchanged) {
      say(
        "publish-status",
        "Opublikowane pliki są identyczne z wgranymi — nie ma czego publikować.",
        "ok",
      );
      return updateButtons();
    }
    say(
      "publish-status",
      `Wysłano (<a href="${esc(res.url)}" target="_blank" rel="noopener">commit ${res.sha.slice(0, 7)}</a>). Czekam na publikację…`,
    );
    state.published = undefined;
    watch(token, res.sha);
  } catch (e) {
    say("publish-status", esc(e.message), "error");
    updateButtons();
  }
}

async function watch(token, sha, round = 0) {
  let done = false;
  try {
    const { run, jobs } = await publishState(token, sha);
    if (run) {
      const line = (j) => {
        const ok = j.conclusion === "success",
          skip = j.conclusion === "skipped";
        const st =
          j.status !== "completed"
            ? "w toku…"
            : ok
              ? "gotowe"
              : skip
                ? "pominięte"
                : "błąd";
        return `<li class="job-${j.status !== "completed" ? "run" : ok ? "ok" : skip ? "skip" : "fail"}"><a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(JOBS[j.name] ?? j.name)}</a>: ${st}</li>`;
      };
      $("jobs").innerHTML = jobs.map(line).join("");
      done = run.status === "completed";
      if (done) {
        const job = (n) => jobs.find((j) => j.name === n)?.conclusion;
        const link = `<a href="${esc(run.url)}" target="_blank" rel="noopener">szczegóły w GitHub Actions</a>`;
        const teacher =
          '<a href="https://nauczyciel.szkolamistrzow.info/zastepstwa.html">nauczyciel.szkolamistrzow.info</a>';
        const pupils =
          '<a href="https://plan.szkolamistrzow.info">plan.szkolamistrzow.info</a>';
        if (job("deploy") === "success" && job("plan-uczniowski") === "success")
          say(
            "publish-status",
            `Gotowe. Sprawdź ${teacher} i ${pupils} (plan uczniowski odświeża się jeszcze ok. minuty).`,
            "ok",
          );
        else if (job("deploy") === "success")
          say(
            "publish-status",
            `Opublikowano ${teacher}, ale plan uczniowski nie został zaktualizowany — ${link}.`,
            "error",
          );
        else if (job("build") === "success" && job("deploy") !== "failure")
          say(
            "publish-status",
            `Pliki sprawdzone, ale automatyczna publikacja jest wyłączona (zmienna PUBLISH_PRZEBUDOWA) — ${link}.`,
            "warning",
          );
        else
          say(
            "publish-status",
            `Publikacja nie powiodła się, strony pokazują poprzednią wersję — ${link}.`,
            "error",
          );
      }
    }
  } catch (e) {
    say(
      "publish-status",
      `Nie mogę odczytać stanu publikacji: ${esc(e.message)}`,
      "warning",
    );
  }
  if (!done && round < 120)
    setTimeout(() => watch(token, sha, round + 1), 10000);
}

loadToken();
$("files").addEventListener("change", (e) => {
  void addFiles([...e.target.files]);
  e.target.value = "";
});
const drop = $("drop");
for (const ev of ["dragenter", "dragover"])
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
for (const ev of ["dragleave", "drop"])
  drop.addEventListener(ev, () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  void addFiles([...e.dataTransfer.files]);
});
$("confirm").addEventListener("change", updateButtons);
$("token").addEventListener("input", () => {
  state.published = undefined;
  updateButtons();
});
$("token").addEventListener("change", () => {
  saveToken();
  if (state.result) void check();
});
$("remember").addEventListener("change", saveToken);
$("forget").addEventListener("click", () => {
  $("token").value = "";
  saveToken();
  updateButtons();
});
$("download").addEventListener("click", download);
$("publish").addEventListener("click", () => void publish());
$("repo").textContent = `${REPO.owner}/${REPO.repo} (${REPO.branch})`;
renderFiles([]);
updateButtons();
