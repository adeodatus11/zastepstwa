# Instrukcje dla Claude

Przed aktualizacją zastępstw i przeniesień przeczytaj [INSTRUKCJA_AKTUALIZACJI_ZASTEPSTW.md](INSTRUKCJA_AKTUALIZACJI_ZASTEPSTW.md) oraz aktualne `PRIVACY.md`, `README.md`, `AGENTS.md` (jeżeli istnieje), `publication.json` i workflow repozytorium.

Surowe Excele przechowuj poza repozytorium. Oczyść je przed pierwszym commitem. Pracuj ze świeżego klonu gałęzi `przebudowa`; nie wypychaj ani nie scalaj starej historii sprzed czyszczenia danych 14.09.2026.

Instrukcja opisuje sposób realizacji zleconej aktualizacji. Samo przeczytanie tego pliku nie jest poleceniem publikacji, przepisywania historii ani wysyłania wiadomości do osób lub usług zewnętrznych.

## Ekran TV (`tv.html`) — kalibracja telewizora na korytarzu

Ustalone 16.10.2026 i zaakceptowane przez użytkownika — nie zmieniać bez nowego
pomiaru na telewizorze.

- Telewizor Philips (pion, 1080×1920, Chrome 152 w aplikacji, bez możliwości
  zmiany adresu) ucina obraz: ok. 38 px u góry, 40 px u dołu, 32 px z lewej,
  33 px z prawej. Ramka w `src/styles/site.css` (`.tv-mode`):
  `--tv-top: 46px; --tv-bottom: 48px; --tv-left: 40px; --tv-right: 41px`
  (ok. 8 px zapasu na każdym boku; boki nie muszą być równe).
- Aplikacja na telewizorze nakłada własne style silniejsze niż nasze CSS
  (także `!important`): nagłówek `position: static` od 0 px, dół strony 120 px.
  Dlatego położenie nagłówka i planu koryguje skrypt `pinLayout()` w
  `src/lib/tv.ts` (transformacja: przesunięcie + skala do prostokąta z ramki,
  co 5 s). Nie zastępować tego samym CSS — na telewizorze nie zadziała.
- Diagnostyka: `tv.html?diag` (żółta ramka z wersją, marginesami, położeniem
  nagłówka i planu, korektą), `tv.html?linijki` (paski co 25 px przy
  krawędziach — ze zdjęcia z bliska odczytuje się przycięcie każdego boku).
  Na telewizorze nie da się zmienić adresu, więc do kalibracji trzeba je
  tymczasowo włączyć domyślnie, a potem wyłączyć.
- Zdjęcia całego telewizora są niedokładne (perspektywa, czarna ramka strony
  zlewa się z obudową) — mierzyć tylko linijkami na zdjęciu z bliska.
