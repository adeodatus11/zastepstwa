# Rejestr realizacji i odbioru

Branch: `przebudowa`. Stan lokalny: 7 września 2026.

## Wykonane etapy

| Etap | Status | Wynik |
|---|---|---|
| Jedno źródło danych | Gotowe | Manifest, import Excel/XML przy budowaniu, kalendarz z arkusza, kontrola błędów wejścia |
| Wspólny interfejs | Gotowe | Astro, wspólna nawigacja i typografia, lokalne fonty, zoptymalizowane logo |
| Wszystkie podstrony | Gotowe | 9 dawnych adresów i 2 nowe wejścia: `/plan.html`, `/materialy.html` |
| TV i publikacja | Gotowe lokalnie | 1080×1920, cztery różne klasy w partii, dalsze lekcje na kolejnych slajdach, pipeline GitHub Actions |
| Odbiór techniczny | Gotowe lokalnie | 24 testy danych/eksportu/budowania, 57 przypadków przeglądarkowych, pomiary Lighthouse |
| Wdrożenie produkcyjne | Nie uruchomiono | Wymaga odbioru użytkownika; stara produkcja pozostaje bez zmian |

## Mapa widoków

| Widok | Wspólne źródło i zachowanie |
|---|---|
| Pulpit | Kontakty i wydarzenia z tych samych danych co pełne podstrony; aktualności z Markdown |
| Plan i zastępstwa | Wspólny wybór nauczyciela/oddziału/sali/miejsca dyżuru, dzień/tydzień, bazowy/zmiany, lista zmian, druk |
| Dyżury nadzoru | Grafik z XLSX, bieżący/najbliższy wpis i jawny okres obowiązywania |
| Pomoc psychologiczno-pedagogiczna | Jedno źródło godzin specjalistów, wybór dnia i pełnego tygodnia, telefony |
| Wykazy oddziałów | Grupy i nauczyciele wyprowadzeni z aktualnego XML, lista do kopiowania |
| Sale i obiekty zewnętrzne | Ten sam plan i zmiany, wejście w wybór sal |
| Kalendarz | Dzień, tydzień, miesiąc, rok, lista; kategorie, szukanie i doprecyzowanie; Google oraz ICS |
| TV | Ten sam model lekcji i zmian; duża typografia, zegar, status lekcji i aktualizacje |

## Dowody

- Import bieżącego zestawu: **1234 lekcje, 310 dyżurów, 80 zastępstw, 6 przeniesień, 16 dyżurów zastępczych**.
- Dopasowania sprawdzone dla każdej pary lekcja–zastępstwo i lekcja–przeniesienie względem wcześniejszego silnika. To kontrola migracji i reguł, a nie potwierdzenie merytorycznej poprawności wpisów w arkuszach.
- Szerokości **320, 390, 768, 834, 1024, 1440 px**: wszystkie zwykłe trasy, Chromium/Firefox/WebKit, bez poziomego przewijania całego dokumentu i bez brakujących lokalnych zasobów.
- Zrzuty po 390/834/1440 px w `reports/screens/`; ręczny przegląd pulpitu, planu, wykazów, kalendarza, dyżurów i TV.
- TV: dwa pełne cykle z przyspieszonym zegarem oraz kontrola wszystkich slajdów dla każdego pozostałego dnia tygodnia w trzech silnikach. Bez uciętych paneli. Nie przeprowadzono pomiaru na fizycznym telewizorze w szkole.
- Ostatni pomiar Lighthouse mobile: pulpit **99/100**, plan **97/100**, kalendarz **98/100** (wydajność/dostępność). LCP odpowiednio 1,80 / 2,41 / 2,18 s, CLS poniżej 0,01. Serwer pomiarowy stosuje gzip.
- Lighthouse mobile: cele **≥90 wydajność / ≥95 dostępność** spełnione dla pulpitu, planu i kalendarza. Szczegółowe aktualne wyniki w `reports/performance/summary.json`; raporty są lokalnymi artefaktami testów.
- Ograniczono układowe przesunięcia podczas ładowania: stała informacja o publikacji, rezerwacja miejsca, zoptymalizowane logo. Brak parsera XLSX w JavaScript wysyłanym do przeglądarki.
- `npm run check`: brak błędów i ostrzeżeń.

## Granice odbioru

Zestaw danych pochodzi z brancha `przebudowa` (`f21700f` przed zmianami). Przed przełączeniem produkcji należy wgrać aktualne arkusze operacyjne i ponowić kontrolę; nie kopiowano nowszych plików z pracującego `wakacyjny`.

Workflow został przygotowany, lecz nie był uruchamiany na zdalnym GitHubie. Nie zmieniono ustawień Pages, nie włączono automatycznej publikacji i nie wypchnięto zmian. Testy silników WebKit/Chromium/Firefox nie zastępują sprawdzenia na konkretnym telefonie lub telewizorze. W kalendarzu zachowane są istniejące oznaczenia terminów wymagających doprecyzowania.

Przy przyszłych zmianach aktualizować istniejące komponenty i manifest zamiast dopisywać oddzielne style lub źródła na poszczególnych stronach. Po zmianie danych uruchomić walidację i build; po zmianie interfejsu również testy przeglądarek i wydajności.
