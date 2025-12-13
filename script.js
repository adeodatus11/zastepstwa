// === 1. ZEGAR (Data i Godzina) ===
function updateClock() {
    const now = new Date();

    // Formatowanie daty: dd.mm.rrrr
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Miesiące są od 0-11
    const year = now.getFullYear();

    // Formatowanie godziny: hh:mm
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    const dateString = `${day}.${month}.${year} ${hours}:${minutes}`;

    const clockElement = document.getElementById('clock');
    if (clockElement) {
        clockElement.innerText = dateString;
    }
}

// Uruchamiamy zegar od razu, a potem co sekundę
updateClock();
setInterval(updateClock, 1000);


// === 2. BAZA DYŻURÓW I WYSZUKIWARKA ===

// Przykładowe dane - tutaj możesz edytować listę nauczycieli dyżurujących
const dutiesDatabase = [
    // Poniedziałek
    { teacher: "Jan Kowalski", location: "Korytarz Parter", day: "Poniedziałek", time: "07:55 - 08:00", info: "Lekcja 0" },
    { teacher: "Anna Nowak", location: "Korytarz I Piętro", day: "Poniedziałek", time: "07:55 - 08:00", info: "Lekcja 0" },
    
    // Wtorek
    { teacher: "Marek Zając", location: "Stołówka", day: "Wtorek", time: "11:30 - 11:45", info: "Długa przerwa" },
    { teacher: "Ewa Wiśniewska", location: "Szatnia", day: "Wtorek", time: "07:55 - 08:00", info: "Lekcja 0" },
    
    // Środa (Przykład zastępstwa)
    { teacher: "Piotr Zielony", location: "Boisko", day: "Środa", time: "07:55 - 08:00", info: "Zastępstwo za A. Nowak" },
    
    // Inne przykłady
    { teacher: "Krzysztof Błękitny", location: "Korytarz Parter", day: "Czwartek", time: "07:55 - 08:00", info: "Lekcja 0" },
    { teacher: "Maria Żółta", location: "Korytarz I Piętro", day: "Piątek", time: "07:55 - 08:00", info: "Lekcja 0" }
];

function checkDuty() {
    const select = document.getElementById('location-select');
    const resultDiv = document.getElementById('location-result');
    const selectedLocation = select.value;

    // Reset widoku
    resultDiv.innerHTML = '';

    if (!selectedLocation) {
        resultDiv.innerHTML = '<p style="color: #c0392b;"><strong>Wybierz lokalizację z listy!</strong></p>';
        return;
    }

    // Filtrujemy bazę danych po wybranej lokalizacji
    const foundDuties = dutiesDatabase.filter(item => item.location === selectedLocation);

    if (foundDuties.length === 0) {
        resultDiv.innerHTML = `<p>Brak zaplanowanych dyżurów w systemie dla lokalizacji: <strong>${selectedLocation}</strong>.</p>`;
        return;
    }

    // Budowanie tabeli wyników
    let html = `<h3>Harmonogram dyżurów: ${selectedLocation}</h3>`;
    html += `<table>
                <thead>
                    <tr>
                        <th>Dzień</th>
                        <th>Godzina</th>
                        <th>Nauczyciel</th>
                        <th>Uwagi</th>
                    </tr>
                </thead>
                <tbody>`;

    foundDuties.forEach(duty => {
        // Jeśli w uwagach jest słowo "Zastępstwo", zaznaczamy na czerwono
        const isSubstitution = duty.info.toLowerCase().includes('zastępstwo');
        const style = isSubstitution ? 'style="color: red; font-weight: bold;"' : '';

        html += `<tr>
                    <td>${duty.day}</td>
                    <td>${duty.time}</td>
                    <td>${duty.teacher}</td>
                    <td ${style}>${duty.info}</td>
                 </tr>`;
    });

    html += `</tbody></table>`;
    resultDiv.innerHTML = html;
}
