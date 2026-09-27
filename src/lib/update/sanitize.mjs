// Czyszczenie eksportu z danych uczniów — odpowiednik scripts/privacy_xlsx.py.
// Nazwa dziennika zajęć innych bywa imieniem, nazwiskiem i klasą ucznia; znika,
// a nauczaniu indywidualnemu zostaje sam znacznik IND, żeby generatory mogły
// je pominąć. Surowy plik nigdy nie opuszcza przeglądarki.
import { readWorkbook } from "./xlsx.mjs";
import { writeZip } from "./zip.mjs";

export const DIARY = "Dziennik zajęć innych";
export const INDIVIDUAL_MARKER = "IND";
export const isIndividual = (v) => /^\s*IND?\b/i.test(String(v ?? ""));

/** Wartości kolumny dziennika, które wciąż identyfikują ucznia. */
export function sensitiveValues(sheets) {
  const found = new Set();
  for (const rows of Object.values(sheets)) {
    const [head = [], ...body] = rows;
    const cols = head.flatMap((h, i) =>
      String(h).trim() === DIARY ? [i] : [],
    );
    for (const r of body)
      for (const i of cols) {
        const v = r[i];
        if (v && String(v).trim() !== INDIVIDUAL_MARKER) found.add(String(v));
      }
  }
  return found;
}

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

/** Zwraca {bytes, sheets, removed} oczyszczonego pliku; rzuca, gdy się nie uda. */
export async function sanitize(input, { DOMParser, XMLSerializer }) {
  const { files, sheets } = await readWorkbook(input, DOMParser);
  const values = sensitiveValues(sheets);
  const replacement = new Map(
    [...values].map((v) => [v, isIndividual(v) ? INDIVIDUAL_MARKER : ""]),
  );
  const out = [];
  for (const f of files) {
    const xmlPart =
      f.name === "xl/sharedStrings.xml" ||
      /^xl\/worksheets\/[^/]+\.xml$/.test(f.name);
    if (!xmlPart || !replacement.size) {
      out.push(f);
      continue;
    }
    const doc = new DOMParser().parseFromString(
      new TextDecoder().decode(f.bytes),
      "application/xml",
    );
    let changed = false;
    for (const tag of ["si", "is"])
      for (const item of Array.from(doc.getElementsByTagName(tag))) {
        const t = item.textContent;
        if (!replacement.has(t)) continue;
        while (item.firstChild) item.removeChild(item.firstChild);
        const node = doc.createElementNS(NS, "t");
        node.appendChild(doc.createTextNode(replacement.get(t)));
        item.appendChild(node);
        changed = true;
      }
    out.push(
      changed
        ? {
            ...f,
            bytes: new TextEncoder().encode(
              new XMLSerializer().serializeToString(doc),
            ),
          }
        : f,
    );
  }
  const bytes = await writeZip(out);
  const check = await readWorkbook(bytes, DOMParser);
  if (sensitiveValues(check.sheets).size)
    throw Error(
      "Nie udało się oczyścić nazw dzienników — plik nie zostanie wysłany.",
    );
  return { bytes, sheets: check.sheets, removed: values.size };
}
