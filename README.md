# Serwis nauczyciela ZSZ5 — przebudowa

Nowy serwis powstaje na branchu `przebudowa`. Źródła interfejsu są w `src/`, a gotowa strona w `dist/`. Pliki HTML w głównym katalogu pozostają wersją referencyjną sprzed przebudowy i źródłem mapowania dawnych linków. Nie są częścią nowego artefaktu publikacji.

## Uruchomienie

Wymagane: Node.js 24, Python 3.12+ i openpyxl.

```sh
npm ci
python3 -m pip install -r requirements-build.txt
npm run dev
```

Podgląd roboczy: adres wypisany przez Astro, zwykle `http://127.0.0.1:4321`. Dane generują się przed startem. Po zmianie arkuszy wykonaj ponownie `npm run data` albo uruchom serwer ponownie. Zmiany komponentów Astro i stylów są widoczne automatycznie.

Gotowe wydanie:

```sh
npm run build
npm run preview -- --port 4321
```

Nie otwieraj plików przez `file://` ani nie serwuj głównego katalogu jako nowego serwisu. Podgląd wydania serwuje wyłącznie `dist/`.

## Aktualizacja danych

`publication.json` jest rejestrem źródeł oraz okresów obowiązywania. Dotychczasowe pliki Excel/XML pozostają wejściem; nie przepisujemy ich ręcznie do JSON.

| Co aktualizujesz | Co zmienić |
|---|---|
| Zastępstwa i dyżury zastępcze | Arkusz wskazany przez `sources.substitutions`, standardowe arkusze „Oddziały” i „Dyżury” |
| Przeniesienia | Arkusz `sources.transfers`, zakładka „Oddziały” |
| Plan bazowy, wykazy, sale, dyżury nauczycieli | XML `sources.xml`; daty `validFrom` / `validTo`. Wykazy i sale wyliczają się z niego automatycznie |
| Dawne linki do planu | HTML `sources.legacyPlan` służy tylko do mapowania kotwic na osoby, klasy i sale; nowy interfejs nie kopiuje jego tabel |
| Nadzór | XLSX `sources.supervision` i daty `supervisionValidFrom` / `supervisionValidTo`; uwagi do dni w `supervisionNotes` |
| Specjaliści | `src/content/specialists.json` — jedyne źródło ich grafiku |
| Kalendarz | XLSX `sources.calendar`; zakres roku w `calendarFrom`, `calendarTo`, `schoolYear` |
| Komunikaty | Nowy lub zmieniony plik Markdown w `src/content/aktualnosci/` |

Przykład komunikatu:

```md
---
title: "Tytuł komunikatu"
date: "2026-09-07"
---
Treść komunikatu. Można dodawać zwykłe linki Markdown.
```

Generator zachowuje parser zastępstw z `schedule-changes.js`. Nowe osoby występujące tylko w arkuszu dostają stabilny identyfikator. Brak wymaganego źródła, niepoprawne kolumny lub dane przerywają budowanie. Poprawny arkusz zawierający tylko nagłówki oznacza brak zmian i jest dozwolony.

Dyżury nadzoru po końcu wskazanego okresu nie są przedstawiane jako aktualne. Przy nowym tygodniu trzeba podmienić grafik i jego zakres. Kalendarz szkolny wykorzystuje istniejący generator dla roku 2026/2027; przy przejściu na nowy rok należy również zaktualizować jego reguły szkolne i przetestować nowy arkusz.

## Architektura i utrzymanie

- Astro: wspólny szablon stron i statyczny HTML. Lokalny Source Sans 3 oraz logo optymalizowane do WebP.
- `src/lib/model.mjs`: wspólny model planu i zmian, używany także przez TV.
- `scripts/build/data.mjs`: import, kontrola wejścia, wersjonowane JSON i manifest. Python odpowiada za istniejącą logikę kalendarza.
- `src/lib/data.ts`: odświeżenie co dwie minuty i po powrocie na kartę, kontrola schematu, ostatnia działająca wersja przy awarii.
- Wspólny CSS: progi 768 i 1200 px. Na telefonie podstawowy plan jest dzienny; tydzień przewija się wyłącznie we własnym obszarze.
- Stare adresy `.html` pozostają wejściami do nowych widoków. Parametry planu: `type=teacher|class|room|duty`, `id`, `date=YYYY-MM-DD`, `mode=base|changes`, `view=day|week`, opcjonalnie `list=changes`.
- Preferowany nauczyciel jest lokalny dla urządzenia. Kontekst planu jest zapamiętywany w sesji. Brak kont użytkowników, service workera i trybu offline.
- Formatowanie: `npm run format`. Regresja: polecenia poniżej.

## Kontrola jakości

```sh
npm run check
npm run verify
npx playwright install chromium firefox webkit
npm run test:browser
npm run test:performance
```

Raporty i zrzuty są w `reports/`. Testy przeglądarek uruchamiają własny serwer. Pomiary Lighthouse też uruchamiają własny serwer i Chrome, bez zależności od otwartego podglądu. Serwer pomiarowy kompresuje HTML, CSS, JS i JSON przez gzip, jak docelowy hosting; zwykły nieskompresowany serwer plików nie odzwierciedla kosztu transferu wydania. W CI instalacja przeglądarek obejmuje `--with-deps`.

Testy obejmują import całego planu, zgodność dopasowania z poprzednim silnikiem, zastępstwa/płatności/przeniesienia, brak i uszkodzenie plików, pusty poprawny arkusz, granice dat, eksport ICS, wszystkie strony przy sześciu szerokościach, trzy silniki przeglądarek, powrót po awarii i TV. Budżet całego JavaScript wszystkich modułów razem wynosi mniej niż 50 KB gzip; moduł planu mieści się również w swoim limicie 150 KB.

## Publikacja i powrót do wcześniejszej wersji

Workflow `.github/workflows/site.yml` po pushu na `przebudowa` buduje i sprawdza stronę oraz przygotowuje artefakt `podglad-serwisu`. Publikowane mogą być wyłącznie pliki z `dist/`; surowe XLSX/XML i skrypty nie trafiają do artefaktu.

**Produkcja nie jest przełączana w ramach lokalnej przebudowy.** Po odbiorze kompletnej wersji:

1. W ustawieniach GitHub Pages wybrać źródło „GitHub Actions”, zachować domenę `nauczyciel.szkolamistrzow.info`.
2. Uruchomić workflow dla `przebudowa` z `publish=true`. Workflow musi przejść wszystkie kontrole.
3. Aby kolejne podmiany danych publikowały się automatycznie, ustawić zmienną repozytorium `PUBLISH_PRZEBUDOWA=true`. Domyślnie zmienna jest nieustawiona i push przygotowuje wyłącznie podgląd.

W razie regresji wyłączyć tę zmienną i przywrócić źródło Pages do dotychczasowego `wakacyjny` albo opublikować wcześniejszy zaakceptowany commit nowego serwisu. Nie usuwać blokad Git i nie wykonywać wymuszonego pushu. Błąd budowania lub testów nie uruchamia zadania deploy, więc poprzednie wydanie pozostaje dostępne.
