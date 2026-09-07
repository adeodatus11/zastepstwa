const page = document.getElementById("app")?.dataset.page;
if (
  [
    "plan",
    "zastepstwa",
    "plan-lekcji-2026-09-07",
    "sale-sg-obiekty-zewnetrzne-2026-2027",
  ].includes(page || "")
)
  void import("./plan").then((m) => m.init());
else if (page === "tv") void import("./tv").then((m) => m.init());
else if (page === "calendar-2026-2027")
  void import("./calendar").then((m) => m.init());
else if (page !== "materialy")
  void import("./pages").then((m) => m.init(page || "index"));

try {
  const saved = new URLSearchParams(
    sessionStorage.getItem("plan-context") || "",
  );
  if (saved.size)
    for (const a of document.querySelectorAll<HTMLAnchorElement>(
      'a[href^="/plan.html"]',
    )) {
      const url = new URL(a.href);
      for (const [key, value] of saved)
        if (!url.searchParams.has(key)) url.searchParams.set(key, value);
      a.href = url.pathname + url.search;
    }
} catch {}
