# Pulpit nauczyciela — Windows 11

Aplikacja otwiera wyłącznie https://nauczyciel.szkolamistrzow.info/ w pełnym ekranie, bez paska adresu i menu. Internet jest potrzebny do pierwszego pobrania danych i aktualizacji. Potem aplikacja działa także offline. Wyświetla aktualnie opublikowaną stronę; samo uruchomienie aplikacji nie publikuje brancha `przebudowa`.

## Uruchomienie na komputerze szkolnym

1. Przenieś paczkę `Pulpit nauczyciela-1.2.0-win.zip` z folderu `release` na Windows 11 (Intel/AMD, x64).
2. Rozpakuj **cały** ZIP np. do `C:\KioskNauczyciela`. Nie przenoś samego pliku EXE bez pozostałych plików.
3. Podłącz telewizor przez HDMI. Naciśnij Win+P i wybierz **Rozszerz** (nie Duplikuj). W ustawieniach ekranów Windows ustaw laptop jako ekran główny.
4. Uruchom `Pulpit nauczyciela.exe`. Domyślnie kiosk otwiera się na ekranie głównym laptopa, a istniejący widok `tv.html` — na drugim ekranie.
5. Przy pierwszym uruchomieniu z dwoma ekranami pojawi się panel wyboru. Przycisk **Pokaż numery ekranów** ułatwia rozpoznanie monitorów. Wybierz przypisanie i kliknij **Zapisz i uruchom**. Numery są numerami w aplikacji; nie muszą odpowiadać numerom w ustawieniach Windows.
6. Aby aplikacja startowała po zalogowaniu: naciśnij Win+R, wpisz `shell:startup`, a w otwartym folderze umieść skrót do EXE.

Zakończenie aplikacji: **Ctrl+Shift+Q** (skrót obsługowy, nie zabezpieczenie hasłem). Zwykłe Alt+F4 i Escape nie zamykają widoku.

Paczka nie jest podpisana certyfikatem wydawcy. Windows może wymagać zatwierdzenia uruchomienia przez administratora szkoły zgodnie z zasadami komputera.

## Dwa ekrany

- Laptop: pełny kiosk do klikania, z powrotem na pulpit po 15 sekundach bezczynności.
- Telewizor HDMI: automatyczny, dotychczasowy widok `https://nauczyciel.szkolamistrzow.info/tv.html`. Nie wraca na pulpit po 15 sekundach. Układ i przewijanie stron pozostają takie jak na `tv.html`. Pionowy widok nowego serwisu jest skalowany do dostępnego ekranu bez obcinania treści, z miejscem na pasek stanu. Na ekranie poziomym może to oznaczać wolne miejsce po bokach.
- Oba widoki działają równocześnie i korzystają z jednej pobranej kopii serwisu, ale mają osobne sesje. Wybór nauczyciela na laptopie nie wpływa na telewizor.
- TV przełącza się na nową kompletną publikację po pobraniu. Aktywny kiosk czeka z przełączeniem do końca sesji. Aktualizacja TV nie przeładowuje kiosku.
- Oba ekrany mają informację o dacie pobrania i trybie offline. `tv.html` jest zawsze włączany do kopii, nawet jeżeli zniknie link do niego na stronie głównej.
- **Ctrl+Shift+S** otwiera wybór ekranów. Ponowne uruchomienie EXE, gdy aplikacja już działa, także otwiera ten panel. Można zamienić przypisania albo wyłączyć TV.
- Zapisane przypisanie pozostaje po restarcie. Odłączenie HDMI wyłącza okno TV, bez zasłaniania kiosku. Ponowne podłączenie zapamiętanego ekranu przywraca TV. Jeżeli Windows nada monitorowi nowe ID po wymianie sprzętu/sterownika, wybierz go ponownie w panelu.
- Po odłączeniu monitora przypisanego do kiosku kiosk przechodzi na dostępny ekran główny; w razie kolizji TV jest wstrzymywany. Dwa widoki nie są celowo umieszczane na tym samym ekranie.

## Zachowanie

- Po 15 sekundach od ostatniego ruchu myszy, kliknięcia, przewinięcia, klawisza lub dotyku aplikacja wraca na stronę główną (kontrola co 100 ms).
- Reset usuwa wybór nauczyciela, filtry, cookies, pamięć użytkownika i historię, ale zachowuje kopię serwisu; następny użytkownik otrzymuje nową sesję.
- Nieużywany pulpit pozostaje otwarty, bez przeładowywania co 15 sekund. Nawigacja i odświeżenia danych same nie przedłużają czasu.
- Linki do tej samej domeny otwierają się w jednym oknie. Inne domeny, pobieranie plików, nowe okna, drukowanie skrótem klawiaturowym i uprawnienia kamery/mikrofonu są blokowane.
- Aplikacja zapisuje na dysku kompletną kopię stron, kodu, stylów i danych. Plan, zastępstwa i kalendarz pozostają dostępne bez Internetu, również po zamknięciu i ponownym uruchomieniu aplikacji.
- Na dole ekranu zawsze widać datę i godzinę pobrania kopii (czas Polski). Bez połączenia pasek zmienia się na żółty: „Tryb offline — wyświetlamy ostatnią zapisaną kopię”. Ostrzega, że dane mogą być nieaktualne. Nowy serwis pokazuje również czas publikacji danych, osobno od czasu pobrania.
- Aktualizacja jest sprawdzana co 30 sekund oraz po odzyskaniu połączenia i wybudzeniu komputera. Błąd pobrania, niepełne dane lub przerwana aktualizacja nie nadpisują poprzedniej poprawnej kopii ani jej daty.
- Nowa kompletna kopia pojawia się po zakończeniu sesji użytkownika (reset po 15 sekundach). Na nieużywanym pulpicie jest włączana automatycznie. Pasek informuje, jeżeli nowa kopia czeka na zakończenie sesji.
- Przed pierwszym udanym pobraniem nie ma danych offline: aplikacja wyświetla taką informację i automatycznie ponawia pobieranie. Nie oznacza pustego planu jako aktualnego.
- Kopia jest przechowywana w katalogu danych aplikacji użytkownika Windows, w podfolderze `offline`. Jest odrębna od zapamiętanego wyboru nauczyciela. Zachowuje ją restart, wybudzenie i wymiana plików programu; usunięcie profilu aplikacji usuwa również kopię.
- Obsługiwany jest zarówno obecny serwis HTML/XLSX, jak i nowa wersja `przebudowa`. W nowej wersji plan, zastępstwa, kontakty i kalendarz są sprawdzane względem jednego manifestu publikacji. Kopia obejmuje pliki statyczne serwisu i używane biblioteki CDN, nie zewnętrzne serwisy ani logowanie do SharePoint.

## Komputer ogólnodostępny

Pełny ekran tej aplikacji **nie jest blokadą Windows**: systemowe skróty (np. Ctrl+Alt+Delete, przełączanie aplikacji) pozostają zależne od konfiguracji systemu. Na stanowisku publicznym użyj osobnego konta bez uprawnień administratora. Jeżeli użytkownik ma nie mieć dostępu do pulpitu i innych programów, administrator musi skonfigurować ograniczenia Windows odpowiednie do posiadanej edycji. Autostart skrótem działa po zalogowaniu, nie konfiguruje automatycznego logowania. Ustaw też usypianie/wygaszacz stosownie do godzin pracy stanowiska.

## Budowanie

W tym folderze, z zainstalowanym Node.js i npm:

```powershell
npm ci
npm test
npm run dist:win
```

ZIP dla Windows x64 powstaje w `release/`. Na Windows można również zbudować instalator:

```powershell
npm run installer:win
```

Próba lokalna: `npm start`. Test dwóch okien z symulowanymi monitorami: `node desktop-kiosk/screens-smoke.mjs` z głównego katalogu repozytorium. Test integracyjny na zbudowanej stronie Astro (najpierw `npm run build` w głównym katalogu): `node desktop-kiosk/smoke.mjs` z głównego katalogu repozytorium (wymaga zależności Playwright głównego projektu). Zależności aplikacji są odrębne od strony Astro. Przy kolejnych wydaniach aktualizuj Electron, wykonuj testy i dostarczaj nową paczkę na stanowisko (brak automatycznej aktualizacji samej aplikacji).

## Odbiór na docelowym Windows 11

1. Otwórz plan, wybierz nauczyciela i przewiń. Po 15 sekundach bezczynności musi pojawić się czysty pulpit.
2. Porusz myszą po 10 sekundach: powrót powinien nastąpić dopiero 15 sekund po tym ruchu. Powtórz dla klawiatury i dotyku, jeżeli jest ekran dotykowy.
3. Spróbuj linku do zewnętrznej witryny — nie powinien się otworzyć.
4. Poczekaj na datę pobrania w pasku. Odłącz sieć i przejdź na plan oraz kalendarz: dane mają nadal działać, z żółtym paskiem i niezmienioną datą. Zamknij i uruchom program bez Internetu — kopia ma być nadal dostępna. Przywróć sieć i sprawdź aktualizację w ciągu około 30 sekund plus czas pobierania.
5. Sprawdź, czy TV pokazuje `tv.html` i pozostaje na nim po resecie kiosku. Wybór nauczyciela na laptopie nie powinien zmieniać TV.
6. Otwórz Ctrl+Shift+S, pokaż numery monitorów i zapisz przypisanie. Uruchom aplikację ponownie; przypisanie powinno pozostać.
7. Odłącz HDMI: kiosk ma pozostać dostępny. Podłącz HDMI ponownie: TV ma wrócić na telewizor.
8. Sprawdź ponowne logowanie do konta, autostart oraz zakończenie skrótem Ctrl+Shift+Q. Testy automatyczne symulują dwa monitory; fizyczne przypisanie i HDMI trzeba potwierdzić na docelowym Windows.

Dokumentacja użytych mechanizmów: https://www.electronjs.org/docs/latest/api/browser-window/ oraz https://www.electronjs.org/docs/latest/api/web-contents/.
