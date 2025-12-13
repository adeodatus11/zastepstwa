// Konfiguracja
const FILES = {
    dyzury: 'dane/dyzury.xlsx',
    zastepstwa: 'dane/zastepstwa.xlsx'
};

// Baza danych w pamięci
let allDuties = [];
let uniqueLocations = new Set();

// 1. ZEGAR
function updateClock() {
    const now = new Date();
    document.getElementById('clock').innerText = now.toLocaleString('pl-PL', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}
setInterval(updateClock, 1000);
updateClock();

// 2. INICJALIZACJA DANYCH
window.addEventListener('DOMContentLoaded', async () => {
    console.log("Start: Pobieranie plików Excel...");
    
    // Wczytaj Dyżury
    await loadExcelFile(FILES.dyzury, parseDyzury);
    
    // Wczytaj Zastępstwa (opcjonalnie)
    await loadExcelFile(FILES.zastepstwa, parseZastepstwa);

    console.log("Koniec: Dane przetworzone.");
    
    // Po wczytaniu: Wypełnij Lekcję 0 i listę lokalizacji
    fillLessonZero();
    populateLocationSelect();
});

// Funkcja pomocnicza do pobierania i czytania XLSX
async function loadExcelFile(url, processingFunction) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Nie można pobrać pliku: ${url}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        // Bierzemy pierwszy arkusz z brzegu
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Konwersja arkusza na JSON (tablica obiektów)
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        if (jsonData.length > 0) {
            console.log(`Wczytano ${jsonData.length} wierszy z ${url}`);
            // Pokaż pierwszy wiersz w konsoli, żeby sprawdzić nazwy kolumn
            console.log("Przykładowy wiersz:", jsonData[0]);
            processingFunction(jsonData);
        } else {
            console.warn(`Plik ${url} jest pusty.`);
        }

    } catch (error) {
        console.error("Błąd wczytywania Excela:", error);
        // Jeśli błąd, nie przerywamy całej strony, tylko logujemy
    }
}

// 3. PRZETWARZANIE DYŻURÓW
function parseDyzury(data) {
    // Tutaj musimy mapować nazwy kolumn z Twojego Excela na nasz kod.
    // Używam funkcji pomocniczej findVal, żeby szukać po fragmencie nazwy (np. "Nazwisko" znajdzie "Nazwisko i imię")
    
    data.forEach(row => {
        // Próba znalezienia odpowiednich kolumn
        // Szukamy kluczy w obiekcie row, które zawierają dany tekst (ignorując wielkość liter)
        const teacher = findVal(row, ["nauczyciel", "nazwisko", "pracownik"]);
        const location = findVal(row, ["miejsce", "sala", "rejon"]);
        const day = findVal(row, ["dzień", "dzien"]);
        const timeStart = findVal(row, ["godz. od", "godzina od", "start"]);
        const timeEnd = findVal(row, ["godz. do", "godzina do", "koniec"]);

        if (teacher && location && day) {
            // Dodaj do głównej bazy
            allDuties.push({
                teacher: teacher,
                location: location,
                day: normalizeDay(day), // "poniedziałek" -> "Poniedziałek"
                time: `${timeStart} - ${timeEnd}`,
                isSubstitution: false
            });
            uniqueLocations.add(location);
        }
    });
}

// 4. PRZETWARZANIE ZASTĘPSTW (Dla dyżurów)
function parseZastepstwa(data) {
    // Zakładam, że w pliku zastępstw jest kolumna "Nauczyciel zastępujący" i "Miejsce"
    data.forEach(row => {
        const newTeacher = findVal(row, ["zastępujący", "nowy nauczyciel"]);
        const location = findVal(row, ["miejsce", "sala"]);
        const day = findVal(row, ["dzień", "data"]); // Może być data dd.mm.rrrr
        const time = findVal(row, ["godzina", "lekcja"]);

        if (newTeacher && location) {
            allDuties.push({
                teacher: newTeacher,
                location: location,
                day: day, // Tu przydałaby się konwersja daty na dzień tygodnia
                time: time || "Zastępstwo",
                isSubstitution: true,
                info: "Zastępstwo"
            });
        }
    });
}

// 5. WYPEŁNIANIE TABELI (Lekcja 0)
function fillLessonZero() {
    // Filtrujemy tylko dyżury, które zaczynają się ok 7:55
    const morningDuties = allDuties.filter(d => d.time.includes("7:55") || d.time.includes("07:55"));

    morningDuties.forEach(duty => {
        // Znajdź komórkę dla danego dnia
        const cells = document.querySelectorAll(`.lesson-zero td[data-day="${duty.day}"]`);
        
        cells.forEach(cell => {
            // Dodaj wpis
            const entry = document.createElement('div');
            entry.innerHTML = `<strong>${duty.location}</strong>: ${duty.teacher}`;
            if (duty.isSubstitution) entry.style.color = "red";
            cell.appendChild(entry);
        });
    });
}

// 6. OBSŁUGA WYSZUKIWARKI
function populateLocationSelect() {
    const select = document.getElementById('location-select');
    select.innerHTML = '<option value="">-- wybierz miejsce --</option>';
    
    // Sortuj lokalizacje alfabetycznie
    const sortedLocs = Array.from(uniqueLocations).sort();
    sortedLocs.forEach(loc => {
        const opt = document.createElement('option');
        opt.value = loc;
        opt.innerText = loc;
        select.appendChild(opt);
    });
}

function displayDutiesForLocation() {
    const loc = document.getElementById('location-select').value;
    const div = document.getElementById('location-result');
    div.innerHTML = "";

    if (!loc) return;

    const duties = allDuties.filter(d => d.location === loc);
    
    if (duties.length === 0) {
        div.innerHTML = "<p>Brak danych.</p>";
        return;
    }

    // Sortowanie dni (proste)
    const dayOrder = { "Poniedziałek": 1, "Wtorek": 2, "Środa": 3, "Czwartek": 4, "Piątek": 5 };
    duties.sort((a, b) => (dayOrder[a.day] || 99) - (dayOrder[b.day] || 99));

    let html = `<h3>${loc}</h3><table><thead><tr><th>Dzień</th><th>Godz.</th><th>Nauczyciel</th></tr></thead><tbody>`;
    duties.forEach(d => {
        const style = d.isSubstitution ? 'style="color:red; font-weight:bold"' : '';
        html += `<tr ${style}><td>${d.day}</td><td>${d.time}</td><td>${d.teacher}</td></tr>`;
    });
    html += "</tbody></table>";
    div.innerHTML = html;
}

// --- Funkcje pomocnicze ---

// Szuka wartości w obiekcie ignorując wielkość liter klucza
function findVal(object, keyCandidates) {
    const keys = Object.keys(object);
    for (let candidate of keyCandidates) {
        const foundKey = keys.find(k => k.toLowerCase().includes(candidate));
        if (foundKey) return object[foundKey];
    }
    return null;
}

// Normalizuje nazwy dni (np. "poniedziałek " -> "Poniedziałek")
function normalizeDay(inputDay) {
    if (!inputDay) return "";
    let d = inputDay.trim().toLowerCase();
    if (d.includes("pon")) return "Poniedziałek";
    if (d.includes("wto")) return "Wtorek";
    if (d.includes("śro") || d.includes("sro")) return "Środa";
    if (d.includes("czw")) return "Czwartek";
    if (d.includes("pią") || d.includes("pia")) return "Piątek";
    return inputDay; // zwraca oryginał jak nie rozpozna
}
