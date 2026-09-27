// Wysyłka oczyszczonych plików na GitHuba i śledzenie publikacji.
// Token należy do użytkownika i zostaje w jego przeglądarce.
export const REPO = {
  owner: "adeodatus11",
  repo: "zastepstwa",
  branch: "przebudowa",
};
const API = "https://api.github.com";

async function gh(token, path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: init.raw
        ? "application/vnd.github.raw"
        : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (res.ok)
    return init.raw ? new Uint8Array(await res.arrayBuffer()) : res.json();
  const why = {
    401: "Token jest nieprawidłowy albo wygasł.",
    403: "Token nie ma uprawnień do tego repozytorium (potrzebne: Contents — zapis, Actions — odczyt).",
    404: "Nie znaleziono repozytorium albo pliku — sprawdź, czy token obejmuje repozytorium zastepstwa.",
  }[res.status];
  const err = Error(why ?? `GitHub odpowiedział błędem ${res.status}.`);
  err.status = res.status;
  throw err;
}

/** Sprawdza token i zwraca login właściciela. */
export const whoami = (token) => gh(token, "/user").then((u) => u.login);

/** Opublikowana wersja pliku z gałęzi publikacyjnej (token opcjonalny, repozytorium publiczne). */
export const fetchPublished = (token, path) =>
  gh(
    token,
    `/repos/${REPO.owner}/${REPO.repo}/contents/${encodeURIComponent(path)}?ref=${REPO.branch}`,
    { raw: true },
  );

function base64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Jeden commit z kilkoma plikami; przy wyścigu z innym pushem ponawia raz. */
export async function commitFiles(token, files, message, attempt = 0) {
  const base = `/repos/${REPO.owner}/${REPO.repo}/git`;
  const ref = await gh(token, `${base}/ref/heads/${REPO.branch}`);
  const parent = await gh(token, `${base}/commits/${ref.object.sha}`);
  const tree = await gh(token, `${base}/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: parent.tree.sha,
      tree: await Promise.all(
        files.map(async (f) => ({
          path: f.path,
          mode: "100644",
          type: "blob",
          sha: (
            await gh(token, `${base}/blobs`, {
              method: "POST",
              body: JSON.stringify({
                content: base64(f.bytes),
                encoding: "base64",
              }),
            })
          ).sha,
        })),
      ),
    }),
  });
  if (tree.sha === parent.tree.sha)
    return { unchanged: true, sha: ref.object.sha };
  const commit = await gh(token, `${base}/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [ref.object.sha],
    }),
  });
  try {
    await gh(token, `${base}/refs/heads/${REPO.branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } catch (e) {
    if (e.status === 422 && attempt === 0)
      return commitFiles(token, files, message, 1);
    throw e;
  }
  return { sha: commit.sha, url: commit.html_url };
}

/** Stan zadań publikacji dla danego commita: [{name, status, conclusion, url}]. */
export async function publishState(token, sha) {
  const runs = await gh(
    token,
    `/repos/${REPO.owner}/${REPO.repo}/actions/runs?head_sha=${sha}&per_page=5`,
  );
  const run = runs.workflow_runs?.[0];
  if (!run) return { run: null, jobs: [] };
  const jobs = await gh(
    token,
    `/repos/${REPO.owner}/${REPO.repo}/actions/runs/${run.id}/jobs`,
  );
  return {
    run: { status: run.status, conclusion: run.conclusion, url: run.html_url },
    jobs: jobs.jobs.map((j) => ({
      name: j.name,
      status: j.status,
      conclusion: j.conclusion,
      url: j.html_url,
    })),
  };
}
