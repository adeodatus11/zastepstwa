// Osadza samodzielny przewodnik (HTML z build.py) w szablonie serwisu.
// Style przewodnika dostają prefiks `.guide`, żeby nie zmieniały nagłówka,
// menu ani stopki serwisu. Wersja ciemna przewodnika jest pomijana, bo
// serwis ma tylko jasny motyw.

/** Dzieli CSS na reguły najwyższego poziomu: [prelude, body | null]. */
function blocks(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    const semi = css.indexOf(";", i);
    if (open === -1) break;
    // @import / @charset itp. zakończone średnikiem przed klamrą
    if (
      semi !== -1 &&
      semi < open &&
      css.slice(i, semi).trim().startsWith("@")
    ) {
      out.push([css.slice(i, semi).trim(), null]);
      i = semi + 1;
      continue;
    }
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    out.push([css.slice(i, open).trim(), css.slice(open + 1, j - 1)]);
    i = j;
  }
  return out;
}

const dark = /data-theme="dark"|prefers-color-scheme:\s*dark/;

function scopeSelector(sel, scope) {
  return sel
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !dark.test(s))
    .map((s) => {
      if (/^:root\b|^body\b/.test(s)) return s.replace(/^(:root|body)/, scope);
      if (/^html\b/.test(s)) return s;
      return `${scope} ${s}`;
    })
    .join(",");
}

export function scopeCss(css, scope = ".guide") {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let result = "";
  for (const [prelude, body] of blocks(css)) {
    if (body === null) continue;
    if (prelude.startsWith("@")) {
      if (dark.test(prelude)) continue;
      if (
        /^@(-webkit-)?keyframes/.test(prelude) ||
        prelude.startsWith("@font-face")
      )
        result += `${prelude}{${body}}`;
      else {
        const inner = scopeCss(body, scope);
        if (inner) result += `${prelude}{${inner}}`;
      }
      continue;
    }
    const sel = scopeSelector(prelude, scope);
    if (sel) result += `${sel}{${body}}`;
  }
  return result;
}

/** Rozkłada plik przewodnika na style, znaczniki i skrypty. */
export function splitGuide(html) {
  const styles = [];
  const scripts = [];
  let markup = html
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (_, css) => {
      styles.push(css);
      return "";
    })
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/g, (_, js) => {
      scripts.push(js);
      return "";
    })
    .replace(/<!doctype[^>]*>|<\/?(html|head|body)\b[^>]*>/gi, "")
    .replace(/<(title)[^>]*>[\s\S]*?<\/\1>|<(meta|link)\b[^>]*>/gi, "")
    // Nagłówek przewodnika zastępuje belka serwisu.
    .replace(/<header class="top">[\s\S]*?<\/header>/, "")
    // Szablon ma już <main>; w przewodniku wystarczą zwykłe bloki.
    .replace(/<main\b/g, "<div")
    .replace(/<\/main>/g, "</div>")
    .trim();
  return { css: scopeCss(styles.join("\n")), markup, scripts };
}
