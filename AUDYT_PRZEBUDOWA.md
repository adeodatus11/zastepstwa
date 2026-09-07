# Audyt i koordynacja przebudowy

Stan: 7 września 2026, branch `przebudowa`, commit `f21700f`.
Badanie w osobnym worktree `/tmp/zsz5-audyt-przebudowa`, przez lokalny HTTP.

## Najważniejsze ustalenie

Na tym branchu nie zapisano nowego pulpitu ani dokumentów przebudowy Claude’a. Brakuje `styl.css`, `aktualnosci.json`, `dyzury-pp.json` i dokumentów `PRZEBUDOWA_*`. Pliki HTML są identyczne z zapisanymi wersjami na lokalnym `wakacyjny` w chwili porównania; różnią się dwa arkusze zmian. Nowy pulpit i dokumentacja występują jako lokalne zmiany/pliki w pierwotnym katalogu na `wakacyjny`. Nie zostały przeniesione w ramach audytu.

## Potwierdzone problemy

| Priorytet | Obszar | Dowód i konsekwencja | Działanie |
|---|---|---|---|
| Pilny | TV | Przeglądarka pokazuje HTTP 404 dla `plan lekcji 4 maja.xml`; konfiguracja zawiera też nieistniejący `ZbiorczeZestawienieZmian.xlsx` i pustą listę przeniesień. | Zrównać źródła z modułem zastępstw i sprawdzić dwa pełne cykle slajdów. |
| Wysoki | Wykazy oddziałów | Na ekranie 390 px dokument ma 3615 px szerokości. Zrzut potwierdza ucięcie zawartości. Brak linku powrotnego do pulpitu. | Naprawić układ mobilny i dodać wspólną nawigację. |
| Wysoki | Wersje danych | Wykaz deklaruje plan od 1.09, aktualny plan od 7.09. W wykazie jest `3B`, w nawigacji planu `2B`. | Wygenerować wykaz z tego samego źródła co aktualny plan; nie poprawiać wyłącznie daty nagłówka. |
| Wysoki | Kalendarz a pulpit | Pulpit wpisuje na sztywno Święto Szkoły 25.09 jako najbliższe wydarzenie; kalendarz pokazuje radę 9.09, 15:45. | Pulpit ma czytać wspólne dane kalendarza albo jasno nazywać wydarzenie wyróżnionym. |
| Wysoki | Odtwarzalność | Generator wykazów domyślnie wskazuje nieobecny `plan-lekcji-2026-09-01.html`, a datę 1.09 wpisuje na sztywno. Na branchu są tylko trzy skrypty; brakuje lokalnych narzędzi budowania dyżurów i publikacji. | Zapisać kompletny potok generowania z parametrami wejścia, daty i wyjścia. |
| Średni | Wspólny wygląd | Pulpit i część podstron mają zielone nagłówki/karty; plan, wykaz, kalendarz i TV mają odrębne układy i style. Brak wspólnego arkusza. | Wspólne tokeny, nagłówek, powrót, typografia, przyciski i stany błędu; osobne reguły dla TV i tabel planu. |
| Średni | Nawigacja | Powroty mają różne nazwy; strona sal istnieje, ale nie ma jej w linkach pulpitu. | Jedna mapa stron z nazwą, odbiorcą i miejscem w nawigacji. |

## Mapa zakresu

| Strona | Rola i źródła | Status audytu |
|---|---|---|
| `index.html` | Pulpit; dyżur z XLSX, komunikaty i wydarzenia w HTML | Działa; rozjazd dat z kalendarzem i brak nowego projektu |
| `zastepstwa.html` | XML + dwa XLSX, wspólny `schedule-changes.js` | Wczytano 80 zastępstw, 6 przeniesień, 16 dyżurów zastępczych; nie jest to kontrola poprawności każdego wpisu |
| `plan-lekcji-2026-09-07.html` | Eksport planu z dyżurami | Otwiera się, ma powrót; wymaga zachowania procesu generowania |
| `dyzury-nadzoru.html` | Ten sam XLSX co pulpit | Wczytuje aktualny/najbliższy dyżur i tydzień |
| `pomoc-psychologiczno-pedagogiczna.html` | Grafik specjalistów w HTML | Otwiera się; musi wejść do pełnego zakresu przebudowy |
| `calendar-2026-2027.html` | Kalendarz i jego dane | Otwiera się; pokazuje wcześniejszy termin niż pulpit |
| `wykaz-podzialow-grup.html` | Wygenerowane dane z planu | Problem mobilny, starsza wersja danych, brak powrotu |
| `sale-sg-obiekty-zewnetrzne-2026-2027.html` | Osobny wyciąg planu sal | Otwiera się; potrzebna decyzja o roli i synchronizacji |
| `tv.html` | Ekran korytarzowy | Nie działa z obecnymi źródłami |

## Proponowana koordynacja

1. **Ustalić bazę na `przebudowa`.** Selektywnie przenieść projekt Claude’a i potrzebne narzędzia. Nie kopiować całego brudnego katalogu ani nadpisywać arkuszy operacyjnych przy przenoszeniu wyglądu.
2. **Zapisać jeden plan realizacji.** Dla każdej z dziewięciu stron: źródło danych, generator, zależności, status, kryteria odbioru. Dokumenty Claude’a są materiałem wejściowym, nie dowodem wykonania.
3. **Najpierw spójność danych.** Wspólna konfiguracja aktualnego planu dla zastępstw i TV; jedno źródło kalendarza dla pulpitu; wykazy i sale generowane z tej samej wersji planu. Wspólna informacja o okresie obowiązywania.
4. **Następnie wspólna warstwa strony.** Wybrać pulpit jako wzorzec, wydzielić style i sprawdzić na dyżurach nadzoru. Ujednolicić nazwę powrotu, logo, tytuły, fokus klawiatury, stany ładowania i błędów.
5. **Przenosić całe funkcje.** Zastępstwa obejmują wybór nauczyciela, plan tygodniowy, przeniesienia, płatności i dyżury zastępcze. Redesign nie może ograniczyć ich do zwykłej listy. Zmiany stron generowanych muszą trafić również do generatorów.
6. **Odbierać cały serwis.** Desktop/tablet/telefon 1440/834/390 px, przejście pulpit → podstrona → pulpit, poprawność dat i źródeł, brak błędów JS i brakujących zasobów, wyszukiwanie i filtry, druk planu, kontrolowany brak danych. TV osobno w docelowej orientacji.

Kolejność: baza i źródła → naprawa TV → wspólny styl + pilotaż dyżurów → pomoc PP i kalendarz → wykazy i sale → zastępstwa → przetwarzanie planu → wygląd TV → odbiór całości.

## Granice badania

Audyt objął kod, historię Git, otwarcie dziewięciu stron w przeglądarce i pomiar szerokości przy 390 px; obejrzano pulpit desktop i wykaz mobilny. Nie wykonano pełnego testu każdej interakcji, wydruku, wszystkich szerokości ani poprawności merytorycznej danych. Nie badano zewnętrznych serwisów, nie wdrażano zmian i nie zmieniano plików aplikacji.
