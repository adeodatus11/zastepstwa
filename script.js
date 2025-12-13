const CONFIG = {
    xml: './plan.xml',
    dyzury: './dyzury.xlsx',
    zastepstwa: './zastepstwa.xlsx'
};

const DB = {
    teachers: {},
    rooms: [],     
    classes: {},
    classesList: [],
    locations: [], 
    periods: [],
    lessons: [],
    duties: [],
    subs: [],
    dutyChanges: []
};

const DAYS = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];

// === EVENT LISTENERS ===
document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('date-picker').valueAsDate = new Date();
    
    // Obsługa przycisków
    document.getElementById('mode-select').addEventListener('change', populateSelect);
    document.getElementById('show-btn').addEventListener('click', render);

    log("Ładowanie plików...", true);
    
    try {
        await loadXML();
        await loadExcel(CONFIG.dyzury, 'dyzury');
        await loadExcel(CONFIG.zastepstwa, 'zastepstwa');
        
        addMissingTeachers();
        extractUniqueLocations();
        
        populateSelect();
        
        log(`Gotowe. Wybierz widok i kliknij Pokaż.`);
    } catch (e) {
        console.error(e);
        log("BŁĄD: " + e.message, true);
    }
});

function log(msg, important=false) {
    const el = document.getElementById('debug-bar');
    el.innerText = msg;
    if(important) el.style.fontWeight = "bold";
}

// === INICJALIZACJA ===

function extractUniqueLocations() {
    const locs = new Set();
    DB.duties.forEach(d => { if(d.place) locs.add(d.place); });
    DB.dutyChanges.forEach(d => { if(d.place) locs.add(d.place); });
    DB.locations = Array.from(locs).sort();
}

function populateSelect() {
    const mode = document.getElementById('mode-select').value;
    const sel = document.getElementById('data-select');
    sel.innerHTML = ""; 
    sel.disabled = false;
    
    document.body.className = `mode-${mode}`;

    if (mode === 'teacher') {
        const sorted = Object.entries(DB.teachers).sort((a,b) => a[1].name.localeCompare(b[1].name));
        sorted.forEach(([id, t]) => {
            const opt = document.createElement('option');
            opt.value = id; opt.innerText = t.name;
            sel.appendChild(opt);
        });
        if(sorted.length) sel.value = sorted[0][0];
    } 
    else if (mode === 'room') {
        DB.rooms.sort().forEach(r => {
            const opt = document.createElement('option');
            opt.value = r; opt.innerText = r;
            sel.appendChild(opt);
        });
        if(DB.rooms.length) sel.value = DB.rooms[0];
    }
    else if (mode === 'class') {
        DB.classesList.sort().forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; opt.innerText = c;
            sel.appendChild(opt);
        });
        if(DB.classesList.length) sel.value = DB.classesList[0];
    }
    else if (mode === 'location') {
        DB.locations.forEach(l => {
            const opt = document.createElement('option');
            opt.value = l; opt.innerText = l;
            sel.appendChild(opt);
        });
        if(DB.locations.length) sel.value = DB.locations[0];
    }
}

// === RENDEROWANIE ===

function render() {
    const mode = document.getElementById('mode-select').value;
    const selectedId = document.getElementById('data-select').value;
    const dateInput = document.getElementById('date-picker').value;
    const grid = document.getElementById('grid');
    grid.innerHTML = "";

    if(!selectedId || !dateInput) return;

    const monday = getMonday(dateInput);

    for(let i=0; i<5; i++) {
        const curDate = new Date(monday); curDate.setDate(monday.getDate() + i);
        const dateStr = curDate.toISOString().split('T')[0];
        const dayNum = i + 1;

        const col = document.createElement('div'); col.className = 'day-col';
        col.innerHTML = `<div class="day-header">${DAYS[dayNum]}<span class="day-date">${dateStr}</span></div>`;
        const content = document.createElement('div'); content.className = 'day-content';

        if (mode === 'location') {
            renderLocationMode(content, selectedId, dayNum, dateStr);
        } else {
            renderScheduleMode(content, mode, selectedId, dayNum, dateStr);
        }
        
        col.appendChild(content); 
        grid.appendChild(col);
    }
}

// --- RENDEROWANIE PLANÓW ---
function renderScheduleMode(container, mode, id, day, dateStr) {
    
    // 1. Dyżur poranny (Tylko dla Nauczyciela)
    if (mode === 'teacher') {
        getDutiesForTime(id, day, dateStr, 0, 480).forEach(d => {
            const div = document.createElement('div'); 
            div.className = 'card morning-duty'; 
            if(d.status==='added') div.classList.add('duty-sub');
            div.style.borderLeftColor = "#f59e0b";
            if(d.status==='cancelled') div.style.textDecoration='line-through';
            div.innerHTML = `<div style="font-weight:700">${d.status==='added'?'ZASTĘPSTWO!':'DYŻUR'} ${d.time}</div><div>${d.place}</div>`;
            container.appendChild(div);
        });
    }

    // 2. Lekcje
    DB.periods.forEach(p => {
        const wrapper = document.createElement('div'); wrapper.className = 'slot-wrapper';
        const div = document.createElement('div');
        
        let lesson = null, subAbs = null, subAdd = null;

        if (mode === 'teacher') {
            lesson = DB.lessons.find(l => l.teacherId == id && l.day == day && l.period == p.nr);
            subAbs = lesson ? DB.subs.find(s => s.date == dateStr && s.absent == id && s.periodRaw.startsWith(p.nr+',')) : null;
            subAdd = DB.subs.find(s => s.date == dateStr && s.sub == id && s.periodRaw.startsWith(p.nr+','));
        } 
        else if (mode === 'room') {
            lesson = DB.lessons.find(l => l.room === id && l.day === day && l.period === p.nr);
            subAdd = DB.subs.find(s => s.date == dateStr && s.room === id && s.periodRaw.startsWith(p.nr+','));
            if(lesson) {
                const abs = DB.subs.find(s => s.date == dateStr && s.absent == lesson.teacherId && s.periodRaw.startsWith(p.nr+','));
                if(abs) subAbs = abs; 
            }
        }
        else if (mode === 'class') {
            lesson = DB.lessons.find(l => l.classNames.includes(id) && l.day == day && l.period == p.nr);
            subAdd = DB.subs.find(s => s.date == dateStr && normalizeClass(s.branch) === normalizeClass(id) && s.periodRaw.startsWith(p.nr+','));
            
            if(lesson) {
                 const abs = DB.subs.find(s => s.date == dateStr && s.absent == lesson.teacherId && s.periodRaw.startsWith(p.nr+','));
                 if(abs) subAbs = abs; 
            }
        }

        // RENDER
        if(subAdd) {
            div.className = 'card is-new';
            let subLine = "";
            if(mode === 'teacher') subLine = `${subAdd.branch || '?'} / s.${subAdd.room} / ${subAdd.subject}`;
            if(mode === 'room') subLine = `${subAdd.branch || '?'} / ${getTeacherName(subAdd.sub)} / ${subAdd.subject}`;
            if(mode === 'class') subLine = `${getTeacherName(subAdd.sub)} / s.${subAdd.room || '?'} / ${subAdd.subject}`;

            div.innerHTML = `
                <div class="meta"><span class="nr">${p.nr}</span> ${p.start}-${p.end}</div>
                <div class="main-info">ZASTĘPSTWO</div>
                <div class="sub-line">${subLine}</div>
                <div class="details">Za: ${subAdd.rawAbs}</div>
                ${subAdd.payInfo ? `<div class="pay-info">${subAdd.payInfo}</div>` : ''}
            `;
        } else if(lesson) {
            if(subAbs) {
                div.className = 'card is-sub';
                div.innerHTML = `
                    <div class="meta"><span class="nr">${p.nr}</span> ${p.start}-${p.end}</div>
                    <div class="main-info">${lesson.subject}</div>
                    <span class="note-red">
                        ${mode==='teacher' ? 'Nieobecność' : getTeacherName(lesson.teacherId)} 
                        (Zast: ${subAbs.rawSub})
                    </span>`;
            } else {
                div.className = 'card';
                let subLine = "";
                if(mode === 'teacher') subLine = `${lesson.classNames || ''} / s.${lesson.room}`;
                if(mode === 'room') subLine = `${lesson.classNames || ''} / ${getTeacherName(lesson.teacherId)}`;
                if(mode === 'class') subLine = `${getTeacherName(lesson.teacherId)} / s.${lesson.room}`;

                div.innerHTML = `
                    <div class="meta"><span class="nr">${p.nr}</span> ${p.start}-${p.end}</div>
                    <div class="main-info">${lesson.subject}</div>
                    <div class="sub-line">${subLine}</div>`;
            }
        } else {
            div.className = 'card empty'; div.innerHTML = `${p.nr}. ${p.start}`;
        }
        wrapper.appendChild(div);

        // 3. Dyżury (Tylko dla Nauczyciela)
        if (mode === 'teacher') {
            const pEnd = timeToMin(p.end);
            getDutiesForTime(id, day, dateStr, pEnd-5, pEnd+15).forEach(d => {
                const dDiv = document.createElement('div'); dDiv.className = 'duty-section';
                if(d.status === 'added') dDiv.classList.add('duty-sub');
                if(d.status === 'cancelled') dDiv.style.textDecoration='line-through';
                dDiv.innerHTML = `<div style="font-weight:700">${d.status==='added'?'ZASTĘPSTWO!':'DYŻUR'} ${d.time}</div><div>${d.place}</div>`;
                wrapper.appendChild(dDiv);
            });
        }
        container.appendChild(wrapper);
    });
}

// --- RENDEROWANIE MIEJSCA DYŻURU ---
function renderLocationMode(container, placeName, day, dateStr) {
    const regular = DB.duties.filter(d => d.day == day && matchLoc(d.place, placeName)).map(d => ({
        ...d, status: 'ok', teacherName: getTeacherName(d.teacherId)
    }));
    regular.forEach(reg => {
        const canc = DB.dutyChanges.find(c => c.date == dateStr && c.time == reg.time && c.absent == reg.teacherId);
        if(canc) { reg.status = 'cancelled'; reg.subInfo = `Zast: ${canc.rawSub}`; }
    });
    const added = DB.dutyChanges.filter(c => c.date == dateStr && matchLoc(c.place, placeName)).map(c => ({
        time: c.time, startMin: timeToMin(c.time.split('-')[0]),
        teacherName: c.rawSub, status: 'added', subInfo: `Za: ${DB.teachers[c.absent]?.name || '?'}`
    }));

    const allDuties = [...regular, ...added].sort((a,b) => a.startMin - b.startMin);

    if (allDuties.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#999">Brak dyżurów</div>';
        return;
    }

    const grouped = {};
    allDuties.forEach(d => {
        if(!grouped[d.time]) grouped[d.time] = [];
        grouped[d.time].push(d);
    });

    Object.keys(grouped).forEach(time => {
        const group = grouped[time];
        const wrapper = document.createElement('div'); 
        wrapper.className = 'slot-wrapper';
        wrapper.innerHTML = `<div style="background:#fef3c7; padding:5px 10px; font-weight:bold; border-bottom:1px solid #eee; color:#92400e; font-size:0.9em">${time}</div>`;
        const listDiv = document.createElement('div');
        listDiv.style.padding = "5px 10px"; listDiv.style.backgroundColor = "#fff";
        group.forEach(d => {
            const row = document.createElement('div'); row.className = 'loc-duty-item';
            if (d.status === 'added') {
                row.style.background = "#ccff33"; row.style.padding = "5px"; row.style.borderRadius = "4px";
                row.innerHTML = `<span><span class="teacher-name">${d.teacherName}</span> <small>(Zastępstwo)</small></span><span class="badge" style="background:#a3d700;color:black">NEW</span>`;
            } else if (d.status === 'cancelled') {
                row.style.textDecoration = "line-through"; row.style.opacity = "0.6";
                row.innerHTML = `<span class="teacher-name">${d.teacherName}</span> <small>${d.subInfo || ''}</small>`;
            } else {
                row.innerHTML = `<span class="teacher-name">${d.teacherName}</span>`;
            }
            listDiv.appendChild(row);
        });
        wrapper.appendChild(listDiv);
        container.appendChild(wrapper);
    });
}

// === PARSOWANIE ===

function matchLoc(a, b) {
    if(!a || !b) return false;
    const nA = a.toLowerCase().trim(); const nB = b.toLowerCase().trim();
    return nA === nB || nA.includes(nB) || nB.includes(nA);
}
function normalizeClass(c) {
    return (c || "").replace(/\s/g, '').toLowerCase();
}
function getTeacherName(id) {
    return DB.teachers[id] ? DB.teachers[id].name : id;
}

async function fetchText(url) {
    const res = await fetch(url);
    if(!res.ok) throw new Error("Brak: " + url);
    const blob = await res.blob();
    return new Promise(r => {
        const reader = new FileReader(); reader.onload = () => r(reader.result); reader.readAsText(blob, 'windows-1250'); 
    });
}

async function loadXML() {
    const txt = await fetchText(CONFIG.xml);
    const xml = new DOMParser().parseFromString(txt, "text/xml");

    xml.querySelectorAll('teachers teacher').forEach(t => {
        const id = t.getAttribute('id');
        const name = (t.getAttribute('firstname')||'') + ' ' + (t.getAttribute('lastname')||t.getAttribute('name'));
        DB.teachers[id] = { name: name.trim(), normalized: normalize(name) };
    });

    // PARSOWANIE KLAS
    xml.querySelectorAll('classes class').forEach(c => {
        const id = c.getAttribute('id');
        const name = c.getAttribute('name');
        DB.classes[id] = name;
        if(!DB.classesList.includes(name)) DB.classesList.push(name);
    });

    const rooms = {};
    const roomSet = new Set();
    xml.querySelectorAll('classrooms classroom').forEach(r => {
        const name = r.getAttribute('name'); rooms[r.getAttribute('id')] = name; roomSet.add(name);
    });
    DB.rooms = Array.from(roomSet);

    xml.querySelectorAll('periods period').forEach(p => {
        DB.periods.push({ nr: parseInt(p.getAttribute('period')), start: p.getAttribute('starttime'), end: p.getAttribute('endtime') });
    });
    DB.periods.sort((a,b) => a.nr - b.nr);

    const subjects = {};
    xml.querySelectorAll('subjects subject').forEach(s => subjects[s.getAttribute('id')] = s.getAttribute('name'));

    xml.querySelectorAll('cards card').forEach(c => {
        const lesson = xml.querySelector(`lessons lesson[id="${c.getAttribute('lessonid')}"]`);
        if(!lesson) return;
        const tids = lesson.getAttribute('teacherids');
        const days = c.getAttribute('days');
        const dayIdx = days.indexOf('1') + 1;
        const roomId = c.getAttribute('classroomids');
        
        const classIds = lesson.getAttribute('classids').split(',');
        const classNames = classIds.map(cid => DB.classes[cid]).join(', ');

        if(dayIdx > 0 && tids) {
            tids.split(',').forEach(tid => {
                DB.lessons.push({
                    teacherId: tid.trim(), day: dayIdx, period: parseInt(c.getAttribute('period')),
                    subject: subjects[lesson.getAttribute('subjectid')] || 'Lekcja',
                    room: rooms[roomId] || '', 
                    classNames: classNames, 
                    branch: '' 
                });
            });
        }
    });
}

async function loadExcel(url, type) {
    const res = await fetch(url);
    if(!res.ok) throw new Error("Brak: " + url);
    const ab = await res.arrayBuffer();
    const wb = XLSX.read(ab, {type: 'array'});
    if(type === 'dyzury') parseDuties(wb);
    if(type === 'zastepstwa') parseSub(wb);
}

function parseDuties(wb) {
    wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, {header: 1});
        let currentDayMap = null;
        for(let i=0; i<data.length; i++) {
            const row = data[i];
            if(!row || row.length===0) continue;
            const rowStr = row.map(c => String(c||"").toLowerCase());
            if(rowStr.some(s => s.includes('poniedziałek'))) {
                currentDayMap = {};
                row.forEach((cell, idx) => {
                    const val = String(cell||"").toLowerCase();
                    if(val.includes('poniedziałek')) currentDayMap[idx]=1;
                    if(val.includes('wtorek')) currentDayMap[idx]=2;
                    if(val.includes('środa')) currentDayMap[idx]=3;
                    if(val.includes('czwartek')) currentDayMap[idx]=4;
                    if(val.includes('piątek')) currentDayMap[idx]=5;
                });
                continue;
            }
            if(currentDayMap) {
                let timeVal=null, placeVal=null;
                for(let c=0; c<5; c++) {
                    if(row[c] && /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(String(row[c]))) {
                        timeVal = String(row[c]).trim();
                        if(c>0 && row[c-1]) placeVal=row[c-1]; else if(row[0]) placeVal=row[0];
                        break;
                    }
                }
                if(timeVal) {
                    for(const [colIdx, dayNum] of Object.entries(currentDayMap)) {
                        const rawTeacher = row[colIdx];
                        if(rawTeacher && String(rawTeacher).length>2) {
                            const tName = String(rawTeacher).trim();
                            if(/brak|wolne|dyżur|-/.test(tName.toLowerCase())) continue;
                            const tId = findTeacherId(tName);
                            if(tId) {
                                DB.duties.push({
                                    teacherId: tId, day: dayNum, time: timeVal,
                                    startMin: timeToMin(timeVal.split('-')[0]),
                                    place: placeVal ? placeVal.trim() : "Dyżur"
                                });
                            }
                        }
                    }
                }
            }
        }
    });
}

function parseSub(wb) {
    const sh = wb.Sheets["Oddziały"] || wb.Sheets[0];
    XLSX.utils.sheet_to_json(sh).forEach(r => {
        const d = parseDate(r['Dzień']);
        if(d) DB.subs.push({
            date: d, periodRaw: r['Lekcja'],
            absent: findTeacherId(r['Nauczyciel/wakat']),
            sub: findTeacherId(r['Zastępca']),
            rawSub: r['Zastępca'], rawAbs: r['Nauczyciel/wakat'],
            subject: r['Przedmiot'], room: r['Sala'], note: r['Uwagi'],
            branch: r['Oddział'], payInfo: r['Forma płatności']
        });
    });
    const shDy = wb.Sheets["Dyżury"];
    if(shDy) {
        XLSX.utils.sheet_to_json(shDy).forEach(r => {
            const d = parseDate(r['Dzień']);
            if(d) DB.dutyChanges.push({
                date: d, time: r['Godzina'],
                absent: findTeacherId(r['Nauczyciel']),
                sub: findTeacherId(r['Zastępca']),
                rawSub: r['Zastępca'], place: r['Miejsce dyżuru']
            });
        });
    }
}

function addMissingTeachers() {
    const checkAndAdd = (rawName, objRef, idField) => {
        if (rawName && !objRef[idField]) {
            const newId = "EXT_" + normalize(rawName).replace(/\s+/g, '_');
            if (!DB.teachers[newId]) DB.teachers[newId] = { name: rawName.trim(), normalized: normalize(rawName) };
            objRef[idField] = newId;
        }
    };
    DB.subs.forEach(s => { if (!s.sub && s.rawSub) checkAndAdd(s.rawSub, s, 'sub'); });
    DB.dutyChanges.forEach(d => { if (!d.sub && d.rawSub) checkAndAdd(d.rawSub, d, 'sub'); });
}

function normalize(str) { return (str||"").toLowerCase().replace(/^(x\.|ks\.|p\.|pani|pan)\s+/g, '').replace(/[^a-złąceźżńóś\s]/g, '').trim().split(/\s+/).sort().join(' '); }
function levenshtein(a, b) {
    const m = []; for(let i=0; i<=b.length; i++) m[i]=[i]; for(let j=0; j<=a.length; j++) m[0][j]=j;
    for(let i=1; i<=b.length; i++) for(let j=1; j<=a.length; j++) m[i][j] = b.charAt(i-1)===a.charAt(j-1) ? m[i-1][j-1] : Math.min(m[i-1][j-1]+1, Math.min(m[i][j-1]+1, m[i-1][j]+1));
    return m[b.length][a.length];
}
function findTeacherId(rawName) {
    if(!rawName || rawName.length<3) return null;
    if(/wakat|brak|okienko/i.test(rawName)) return null;
    const target = normalize(rawName);
    let bestId = null, bestScore = 0;
    for(const [id, t] of Object.entries(DB.teachers)) {
        const source = t.normalized;
        if(source === target) return id;
        if(source.includes(target) || target.includes(source)) { if(bestScore<50) { bestScore=50; bestId=id; } }
        const dist = levenshtein(source, target);
        if(dist <= 2 && source.length>4 && bestScore<80) { bestScore=80; bestId=id; }
    }
    return bestId;
}
function timeToMin(str) { if(!str) return 0; const [h,m] = str.trim().split(':').map(Number); return h*60+m; }
function parseDate(val) {
    if(!val) return null;
    if(typeof val === 'number') { const d = XLSX.SSF.parse_date_code(val); return `${d.y}-${d.m<10?'0':''}${d.m}-${d.d<10?'0':''}${d.d}`; }
    if(typeof val === 'string') { const p = val.trim().split('.'); if(p.length===3) return `${p[2]}-${p[1]}-${p[0]}`; }
    return null;
}
function getMonday(d) {
    d = new Date(d); const day = d.getDay(); const diff = d.getDate() - day + (day == 0 ? -6:1);
    return new Date(d.setDate(diff));
}
function getDutiesForTime(tid, day, date, min, max) {
    const res = [];
    DB.duties.filter(d => d.teacherId==tid && d.day==day).forEach(d => {
        if(d.startMin >= min && d.startMin < max) {
            const canc = DB.dutyChanges.find(c => c.date==date && c.time==d.time && c.absent==tid);
            res.push({...d, status: canc?'cancelled':'ok'});
        }
    });
    DB.dutyChanges.filter(c => c.date==date && c.sub==tid).forEach(c => {
        const start = timeToMin(c.time.split('-')[0]);
        if(start >= min && start < max) res.push({ time: c.time, place: c.place, startMin: start, status: 'added' });
    });
    return res;
}
