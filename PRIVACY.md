# Import plików XLSX

Przed dodaniem eksportu do Git usuń nazwy dzienników zajęć innych:

```
python3 scripts/privacy_xlsx.py --sanitize InformacjeOZastepstwach.xlsx
git config core.hooksPath .githooks
```

Kontrola przed push sprawdza wszystkie nowe commity. Budowanie i CI również odrzucają nazwy dzienników. Kontrola dotyczy tej konkretnej kolumny, nie zastępuje przeglądu innych pól pod kątem danych uczniów. Nie dodawaj do Git oryginalnych eksportów ani kopii przed oczyszczeniem.

Po oczyszczeniu historii 14 września 2026 stare klony nie mogą być wypychane ani scalane z serwerem. Przenieś potrzebne lokalne zmiany do świeżego klonu, bez kopiowania starej historii Git i nieoczyszczonych eksportów.
