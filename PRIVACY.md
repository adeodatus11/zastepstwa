# Import plików XLSX

Przed dodaniem eksportu do Git usuń nazwy dzienników zajęć innych:

```
python3 scripts/privacy_xlsx.py --sanitize InformacjeOZastepstwach.xlsx
git config core.hooksPath .githooks
```

Strona `aktualizuj.html` robi to samo w przeglądarce, zanim cokolwiek wyśle: surowe pliki są czytane lokalnie, a do GitHuba trafiają wyłącznie oczyszczone kopie. Po oczyszczeniu strona czyta plik ponownie i przerywa, jeśli nazwa dziennika nadal w nim jest. Zbiorcze zestawienie zmian (powody nieobecności nauczycieli, nazwy dzienników uczniów) jest używane tylko do kontroli: zaraz po odczycie zostają z niego daty, lekcje, oddziały, przedmioty, zastępcy i skutek nieobecności — powody nieobecności i arkusz „Dane nieobecności” są odrzucane. Ten plik nigdy nie jest wysyłany ani dodawany do Git. Token GitHub użytkownika zostaje w jego przeglądarce (pamięć sesji albo, na życzenie, pamięć lokalna) i jest wysyłany tylko do api.github.com.

Kontrola przed push sprawdza wszystkie nowe commity. Budowanie i CI również odrzucają nazwy dzienników. Kontrola dotyczy tej konkretnej kolumny, nie zastępuje przeglądu innych pól pod kątem danych uczniów. Nie dodawaj do Git oryginalnych eksportów ani kopii przed oczyszczeniem.

Po oczyszczeniu historii 14 września 2026 stare klony nie mogą być wypychane ani scalane z serwerem. Przenieś potrzebne lokalne zmiany do świeżego klonu, bez kopiowania starej historii Git i nieoczyszczonych eksportów.
