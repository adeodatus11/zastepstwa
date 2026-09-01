#!/usr/bin/env python3
import argparse
import html
import json
import re
from collections import defaultdict
from pathlib import Path


DAY_NAMES = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek"]

GROUP_ORDER = {
    "gr1": 10,
    "gr2": 20,
    "gr3": 30,
    "relu": 100,
    "reln": 110,
    "dz": 200,
    "ch": 210,
    "ch1": 211,
    "ch2": 212,
    "tech.hand.": 300,
    "tech.fryz.": 310,
    "cukiernik": 400,
    "fryzjer": 410,
    "kucharz": 420,
    "sprzedawca": 430,
}

GROUP_DISPLAY = {
    "gr1": "GR1",
    "gr2": "GR2",
    "gr3": "GR3",
    "relu": "REL-U",
    "reln": "REL-N",
    "dz": "DZ",
    "ch": "CH",
    "ch1": "CH1",
    "ch2": "CH2",
    "tech.hand.": "TECH.HAND.",
    "tech.fryz.": "TECH.FRYZ.",
    "cukiernik": "CUKIERNIK",
    "fryzjer": "FRYZJER",
    "kucharz": "KUCHARZ",
    "sprzedawca": "SPRZEDAWCA",
}


def clean_text(value):
    value = html.unescape(value or "").replace("\xa0", " ")
    return " ".join(value.split())


def strip_tags(value):
    value = re.sub(r'<div class="g">.*?</div>', " ", value, flags=re.S)
    value = re.sub(r"<[^>]+>", " ", value)
    return clean_text(value)


def extract_nav_section(source, title, next_title=None):
    start = re.search(rf'<div class="h">{re.escape(title)}</div>', source)
    if not start:
        return ""
    tail = source[start.end() :]
    if next_title:
        end = re.search(rf'<div class="h">{re.escape(next_title)}</div>', tail)
    else:
        end = re.search(r"</nav>", tail)
    return tail[: end.start()] if end else tail


def extract_links(section):
    return [
        (html.unescape(href), clean_text(label))
        for href, label in re.findall(r'<a class="l" href="#([^"]+)">([^<]+)</a>', section)
    ]


def parse_source(source):
    class_links = extract_links(extract_nav_section(source, "Oddziały", "Nauczyciele"))
    teacher_links = extract_links(extract_nav_section(source, "Nauczyciele", "Sale"))
    tables = {
        table_id: body
        for table_id, body in re.findall(
            r'<table class="plan" id="([^"]+)">(.*?)</table>', source, flags=re.S
        )
    }
    teacher_names = dict(teacher_links)

    class_groups = defaultdict(lambda: defaultdict(lambda: defaultdict(set)))
    class_subject_teachers = defaultdict(lambda: defaultdict(set))
    subject_order = {}
    order_counter = 0

    for teacher_code, teacher_name in teacher_links:
        table = tables.get(teacher_code)
        if not table:
            continue

        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", table, flags=re.S)
        for row in rows:
            lesson_match = re.search(r'<td[^>]*class="[^"]*\br\b[^"]*"[^>]*>(.*?)</td>', row, re.S)
            lesson_no = strip_tags(lesson_match.group(1)) if lesson_match else ""
            cells = re.findall(r"<td\b[^>]*>(.*?)</td>", row, flags=re.S)

            day_index = -1
            for cell in cells[2:]:
                if '<div class="g">' not in cell:
                    colspan = re.search(r'colspan="(\d+)"', cell)
                    if colspan and int(colspan.group(1)) == 2:
                        day_index += 1
                    continue

                day_index += 1
                day = DAY_NAMES[day_index] if 0 <= day_index < len(DAY_NAMES) else ""
                subject = strip_tags(cell)
                if not subject:
                    continue
                if subject not in subject_order:
                    subject_order[subject] = order_counter
                    order_counter += 1

                group_div = re.search(r'<div class="g">(.*?)</div>', cell, flags=re.S)
                if not group_div:
                    continue

                for _, class_name, group in re.findall(
                    r'<a href="#([^"]+)">([^<]+)</a>(?:\s|&nbsp;|\xa0)*(?:\(([^)]+)\))?',
                    group_div.group(1),
                ):
                    class_name = clean_text(class_name)
                    group = clean_text(group).lower()
                    class_subject_teachers[class_name][subject].add(teacher_name)
                    if not group:
                        continue
                    class_groups[class_name][group][subject].add(teacher_name)

    for class_name in list(class_groups):
        if "relu" in class_groups[class_name] and "reln" not in class_groups[class_name]:
            class_groups[class_name]["reln"]["Religia"] = set()

    classes = []
    for _, class_name in class_links:
        groups = class_groups.get(class_name, {})
        divisions = build_divisions(groups, subject_order)
        subject_teachers = build_subject_teachers(class_subject_teachers.get(class_name, {}), subject_order)
        teacher_subjects = build_teacher_subjects(subject_teachers)
        classes.append(
            {
                "id": class_name,
                "divisionCount": len(divisions),
                "groupCount": sum(len(division["groups"]) for division in divisions),
                "subjectTeacherCount": len(teacher_subjects),
                "subjectTeachers": subject_teachers,
                "teacherSubjects": teacher_subjects,
                "copyText": build_copy_text(class_name, teacher_subjects),
                "divisions": divisions,
            }
        )

    return {
        "sourceTitle": "Plan lekcji obowiązuje od 01.09.2026",
        "vulcan": {
            "updated": "Opracowano na podstawie Bazy Wiedzy VULCAN, stan na 01.09.2026.",
            "steps": [
                "Dziennik / Dziennik oddziału: wybierz oddział.",
                "Przedmioty i nauczyciele: kliknij Zmień listę przedmiotów i nauczycieli.",
                "Zmiana przedmiotów: przenieś do prawej listy przedmioty realizowane w oddziale. Nazwy powinny brzmieć identycznie jak w planie nauczania oddziału.",
                "Zmiana nauczycieli: przenieś do prawej listy nauczycieli uczących w oddziale w bieżącym roku.",
                "W macierzy przedmiotów i nauczycieli kliknij komórkę na przecięciu przedmiotu i nauczyciela, aby przypisać nauczyciela do przedmiotu. Ponowne kliknięcie odznacza przypisanie.",
                "Grupy: przez Zmień listę grup dodaj grupy występujące w oddziale, a przez Zmień przynależność przypisz uczniów do grup.",
            ],
            "sources": [
                {
                    "label": "Jak założyć dziennik oddziału i wprowadzić podstawowe dane",
                    "url": "https://www.bazawiedzy.vulcan.edu.pl/bazawiedzy.php/show/23",
                },
                {
                    "label": "Prowadzenie dziennika oddziału przez wychowawcę",
                    "url": "https://www.bazawiedzy.vulcan.edu.pl/bazawiedzy.php/show/9",
                },
                {
                    "label": "Jak opisać przedmioty w dzienniku oddziału",
                    "url": "https://www.bazawiedzy.vulcan.edu.pl/bazawiedzy.php/show/6",
                },
            ],
        },
        "classes": classes,
        "stats": {
            "classes": len(classes),
            "classesWithGroups": sum(1 for item in classes if item["groupCount"]),
            "teachers": len(teacher_names),
        },
    }


def division_key(group):
    if re.fullmatch(r"gr\d+", group):
        return "gr"
    if group in {"relu", "reln"}:
        return "religia"
    if group in {"dz", "ch", "ch1", "ch2"}:
        return "wf"
    if group in {"tech.hand.", "tech.fryz."}:
        return "technikum"
    if group in {"cukiernik", "fryzjer", "kucharz", "sprzedawca"}:
        return "zawod"
    return group


def group_display(group):
    return GROUP_DISPLAY.get(group, group.upper())


def group_sort_key(group):
    return (GROUP_ORDER.get(group, 999), group)


def division_label(key, groups):
    displays = [group_display(group) for group in sorted(groups, key=group_sort_key)]
    if key == "religia":
        return "REL-U - REL-N"
    return " - ".join(displays)


def build_divisions(groups, subject_order):
    grouped = defaultdict(dict)
    for group, subjects in groups.items():
        grouped[division_key(group)][group] = subjects

    divisions = []
    for key, division_groups in sorted(
        grouped.items(),
        key=lambda item: min(group_sort_key(group) for group in item[1]),
    ):
        group_rows = []
        for group, subjects in sorted(division_groups.items(), key=lambda item: group_sort_key(item[0])):
            rows = []
            for subject, teachers in sorted(
                subjects.items(),
                key=lambda item: (subject_order.get(item[0], 9999), item[0].casefold()),
            ):
                teacher_list = sorted(teachers, key=str.casefold)
                rows.append({"subject": subject, "teachers": teacher_list})
            group_rows.append(
                {
                    "code": group,
                    "name": group_display(group),
                    "subjects": rows,
                }
            )

        divisions.append(
            {
                "key": key,
                "label": division_label(key, division_groups),
                "groups": group_rows,
            }
        )
    return divisions


def teacher_sort_key(name):
    normalized = name.removeprefix("ks. ").strip()
    parts = normalized.split()
    if len(parts) < 2:
        return (normalized.casefold(), "")
    return (parts[-1].casefold(), " ".join(parts[:-1]).casefold())


def build_subject_teachers(subjects, subject_order):
    return [
        {
            "subject": subject,
            "teachers": sorted(teachers, key=teacher_sort_key),
        }
        for subject, teachers in sorted(
            subjects.items(),
            key=lambda item: (subject_order.get(item[0], 9999), item[0].casefold()),
        )
    ]


def build_teacher_subjects(subject_teachers):
    teacher_subjects = defaultdict(list)
    for row in subject_teachers:
        for teacher in row["teachers"]:
            teacher_subjects[teacher].append(row["subject"])

    return [
        {
            "teacher": teacher,
            "subjects": sorted(set(subjects), key=lambda value: value.casefold()),
        }
        for teacher, subjects in sorted(teacher_subjects.items(), key=lambda item: teacher_sort_key(item[0]))
    ]


def build_copy_text(class_name, teacher_subjects):
    lines = [class_name]
    if not teacher_subjects:
        lines.append("Brak wykrytych nauczycieli uczących w oddziale.")
        return "\n".join(lines)
    for row in teacher_subjects:
        lines.append(f"{row['teacher']} - {'; '.join(row['subjects'])}")
    return "\n".join(lines)


def render_html(data):
    payload = json.dumps(data, ensure_ascii=False)
    return f"""<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wykazy oddziałów</title>
    <style>
        :root {{
            color-scheme: light;
            --bg: #f3f5f7;
            --panel: #ffffff;
            --ink: #17202a;
            --muted: #637083;
            --line: #d9e0e8;
            --accent: #0f766e;
            --accent-dark: #115e59;
            --soft: #e8f3f1;
            --warn: #fff7ed;
        }}
        * {{ box-sizing: border-box; }}
        body {{
            margin: 0;
            background: var(--bg);
            color: var(--ink);
            font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.45;
        }}
        header {{
            background: #ffffff;
            border-bottom: 1px solid var(--line);
        }}
        .wrap {{
            width: min(1180px, calc(100% - 32px));
            margin: 0 auto;
        }}
        .topbar {{
            display: flex;
            gap: 16px;
            justify-content: space-between;
            align-items: center;
            padding: 18px 0;
        }}
        h1 {{
            margin: 0;
            font-size: clamp(1.35rem, 2vw, 2rem);
            line-height: 1.15;
        }}
        .source {{
            color: var(--muted);
            font-size: .95rem;
            margin-top: 4px;
        }}
        .summary {{
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: flex-end;
            color: var(--muted);
            font-size: .9rem;
        }}
        .summary span {{
            border: 1px solid var(--line);
            border-radius: 999px;
            padding: 5px 9px;
            background: #f8fafc;
            white-space: nowrap;
        }}
        main {{
            padding: 18px 0 36px;
        }}
        .layout {{
            display: grid;
            grid-template-columns: 260px 1fr;
            gap: 18px;
            align-items: start;
        }}
        .sidebar {{
            position: sticky;
            top: 14px;
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 8px;
            padding: 12px;
        }}
        .tools {{
            display: grid;
            gap: 10px;
            margin-bottom: 12px;
        }}
        .view-tabs {{
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 12px;
        }}
        .tab-button,
        .copy-button {{
            border: 1px solid var(--line);
            border-radius: 6px;
            background: #fff;
            color: var(--ink);
            font: inherit;
            font-weight: 800;
            cursor: pointer;
            padding: 8px 10px;
        }}
        .tab-button:hover,
        .copy-button:hover {{
            border-color: var(--accent);
            color: var(--accent-dark);
        }}
        .tab-button.active {{
            border-color: var(--accent);
            background: var(--accent);
            color: #fff;
        }}
        label {{
            display: grid;
            gap: 4px;
            color: var(--muted);
            font-size: .82rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: .04em;
        }}
        input {{
            width: 100%;
            border: 1px solid var(--line);
            border-radius: 6px;
            padding: 9px 10px;
            color: var(--ink);
            font: inherit;
            outline: none;
        }}
        input:focus {{
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(15, 118, 110, .15);
        }}
        .class-list {{
            display: grid;
            gap: 4px;
            max-height: calc(100vh - 170px);
            overflow: auto;
            padding-right: 2px;
        }}
        .class-button {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            min-height: 36px;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: var(--ink);
            font: inherit;
            text-align: left;
            cursor: pointer;
            padding: 7px 9px;
        }}
        .class-button:hover {{
            background: #f1f5f9;
        }}
        .class-button.active {{
            background: var(--accent);
            color: #fff;
            font-weight: 800;
        }}
        .count {{
            min-width: 24px;
            border-radius: 999px;
            padding: 1px 6px;
            background: #e2e8f0;
            color: #475569;
            font-size: .78rem;
            text-align: center;
        }}
        .class-button.active .count {{
            background: rgba(255,255,255,.2);
            color: #fff;
        }}
        .content {{
            display: grid;
            gap: 14px;
        }}
        .class-header {{
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 8px;
            padding: 14px 16px;
        }}
        .class-title {{
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
        }}
        h2 {{
            margin: 0;
            font-size: 1.55rem;
            line-height: 1.2;
        }}
        .meta {{
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            color: var(--muted);
            font-size: .9rem;
        }}
        .meta span {{
            background: #f8fafc;
            border: 1px solid var(--line);
            border-radius: 999px;
            padding: 4px 8px;
        }}
        .division {{
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 8px;
            overflow: hidden;
        }}
        .division-head {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            padding: 12px 14px;
            background: #f8fafc;
            border-bottom: 1px solid var(--line);
        }}
        h3 {{
            margin: 0;
            font-size: 1.05rem;
        }}
        .chips {{
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }}
        .chip {{
            border-radius: 999px;
            background: var(--soft);
            color: var(--accent-dark);
            font-weight: 800;
            font-size: .82rem;
            padding: 4px 8px;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
        }}
        th, td {{
            vertical-align: top;
            text-align: left;
            padding: 12px 14px;
            border-bottom: 1px solid var(--line);
        }}
        th {{
            color: var(--muted);
            font-size: .78rem;
            text-transform: uppercase;
            letter-spacing: .04em;
            background: #ffffff;
        }}
        tr:last-child td {{
            border-bottom: 0;
        }}
        .group-name {{
            min-width: 104px;
            font-size: 1.05rem;
            font-weight: 900;
            color: var(--accent-dark);
        }}
        .subject-list {{
            display: grid;
            gap: 8px;
        }}
        .subject-row {{
            display: grid;
            grid-template-columns: minmax(180px, 1fr) minmax(190px, 1fr);
            gap: 10px;
        }}
        .subject {{
            font-weight: 700;
        }}
        .teachers {{
            color: var(--muted);
        }}
        .teacher-list {{
            display: grid;
            gap: 8px;
            padding: 0 14px;
        }}
        .teacher-row {{
            display: grid;
            grid-template-columns: minmax(190px, .7fr) minmax(220px, 1.3fr);
            gap: 12px;
            padding: 10px 0;
            border-bottom: 1px solid var(--line);
        }}
        .teacher-row:last-child {{
            border-bottom: 0;
        }}
        .teacher-name {{
            font-weight: 900;
            color: var(--accent-dark);
        }}
        .copy-panel,
        .vulcan-note {{
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 8px;
            padding: 14px;
        }}
        .copy-head {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
        }}
        .copy-text {{
            width: 100%;
            border: 1px solid var(--line);
            border-radius: 6px;
            padding: 12px;
            margin: 0;
            color: var(--ink);
            background: #fbfdff;
            font: 0.95rem/1.45 Consolas, "SFMono-Regular", monospace;
            outline: none;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: normal;
        }}
        .copy-text:focus {{
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(15, 118, 110, .15);
        }}
        .vulcan-note ol {{
            margin: 10px 0 0 1.4rem;
            padding: 0;
        }}
        .vulcan-note li {{
            margin: 6px 0;
        }}
        .source-links {{
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 12px;
        }}
        .source-links a {{
            border: 1px solid var(--line);
            border-radius: 999px;
            color: var(--accent-dark);
            background: var(--soft);
            font-weight: 800;
            font-size: .82rem;
            padding: 5px 9px;
            text-decoration: none;
        }}
        .missing {{
            display: inline-block;
            border-radius: 5px;
            background: var(--warn);
            color: #9a3412;
            padding: 2px 6px;
            font-weight: 700;
        }}
        .empty {{
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 8px;
            padding: 18px;
            color: var(--muted);
        }}
        .hidden {{
            display: none !important;
        }}
        @media (max-width: 820px) {{
            .topbar, .class-title, .division-head {{
                align-items: stretch;
                flex-direction: column;
            }}
            .summary {{
                justify-content: flex-start;
            }}
            .layout {{
                grid-template-columns: 1fr;
            }}
            .sidebar {{
                position: static;
            }}
            .class-list {{
                display: flex;
                gap: 6px;
                overflow-x: auto;
                max-height: none;
                padding-bottom: 4px;
            }}
            .class-button {{
                flex: 0 0 auto;
                min-width: 82px;
            }}
            .subject-row {{
                grid-template-columns: 1fr;
                gap: 2px;
            }}
            .teacher-row {{
                grid-template-columns: 1fr;
                gap: 2px;
            }}
            .copy-head {{
                align-items: stretch;
                flex-direction: column;
            }}
        }}
    </style>
</head>
<body>
<header>
    <div class="wrap topbar">
        <div>
            <h1>Wykazy oddziałów</h1>
            <div class="source" id="source"></div>
        </div>
        <div class="summary" id="summary"></div>
    </div>
</header>
<main>
    <div class="wrap layout">
        <aside class="sidebar">
            <div class="tools">
                <label for="search">Szukaj klasy</label>
                <input id="search" type="search" placeholder="np. 1TFA" autocomplete="off">
            </div>
            <div class="class-list" id="classList"></div>
        </aside>
        <section class="content" id="content"></section>
    </div>
</main>
<script>
const REPORT = {payload};

const classList = document.getElementById("classList");
const content = document.getElementById("content");
const search = document.getElementById("search");
document.getElementById("source").textContent = REPORT.sourceTitle;
document.getElementById("summary").innerHTML = `
    <span>${{REPORT.stats.classes}} klas</span>
    <span>${{REPORT.stats.classesWithGroups}} z podziałami</span>
    <span>${{REPORT.stats.teachers}} nauczycieli</span>
`;

let activeClassId = new URLSearchParams(window.location.search).get("klasa")
    || window.location.hash.replace("#", "")
    || "1TFA";
let activeView = new URLSearchParams(window.location.search).get("widok") === "nauczyciele"
    ? "teachers"
    : "groups";

function escapeHtml(value) {{
    return String(value).replace(/[&<>"']/g, char => ({{
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }}[char]));
}}

function renderList() {{
    const term = search.value.trim().toLowerCase();
    classList.innerHTML = "";
    REPORT.classes
        .filter(item => item.id.toLowerCase().includes(term))
        .forEach(item => {{
            const button = document.createElement("button");
            button.type = "button";
            button.className = `class-button ${{item.id === activeClassId ? "active" : ""}}`;
            button.innerHTML = `<span>${{escapeHtml(item.id)}}</span><span class="count">${{item.groupCount}}</span>`;
            button.addEventListener("click", () => selectClass(item.id));
            classList.appendChild(button);
        }});
}}

function selectClass(classId) {{
    activeClassId = classId;
    updateLocation();
    renderList();
    renderClass();
}}

function selectView(view) {{
    activeView = view;
    updateLocation();
    renderClass();
}}

function updateLocation() {{
    const viewParam = activeView === "teachers" ? "?widok=nauczyciele" : "";
    history.replaceState(null, "", `${{viewParam}}#${{encodeURIComponent(activeClassId)}}`);
}}

function renderHeader(item) {{
    return `
        <div class="class-header">
            <div class="class-title">
                <h2>${{escapeHtml(item.id)}}</h2>
                <div class="meta">
                    <span>${{item.divisionCount}} podziałów</span>
                    <span>${{item.groupCount}} grup</span>
                    <span>${{item.subjectTeacherCount}} nauczycieli w oddziale</span>
                </div>
            </div>
            <div class="view-tabs" aria-label="Widok">
                <button type="button" class="tab-button ${{activeView === "groups" ? "active" : ""}}" data-view="groups">Podziały na grupy</button>
                <button type="button" class="tab-button ${{activeView === "teachers" ? "active" : ""}}" data-view="teachers">Nauczyciele w oddziale</button>
            </div>
        </div>`;
}}

function bindViewButtons() {{
    content.querySelectorAll("[data-view]").forEach(button => {{
        button.addEventListener("click", () => selectView(button.dataset.view));
    }});
    const copyButton = content.querySelector("[data-copy-list]");
    if (copyButton) {{
        copyButton.addEventListener("click", () => copyTeacherList(copyButton));
    }}
}}

async function copyTeacherList(button) {{
    const copyList = content.querySelector("#copyList");
    if (!copyList) return;
    const text = copyList.textContent;
    try {{
        if (navigator.clipboard) {{
            await navigator.clipboard.writeText(text);
        }} else {{
            selectText(copyList);
            document.execCommand("copy");
        }}
        const original = button.textContent;
        button.textContent = "Skopiowano";
        setTimeout(() => button.textContent = original, 1200);
    }} catch (error) {{
        selectText(copyList);
    }}
}}

function selectText(element) {{
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
}}

function renderClass() {{
    const item = REPORT.classes.find(entry => entry.id === activeClassId) || REPORT.classes[0];
    if (!item) {{
        content.innerHTML = `<div class="empty">Brak danych do wyświetlenia.</div>`;
        return;
    }}
    activeClassId = item.id;

    const header = renderHeader(item);
    content.innerHTML = header + (activeView === "teachers" ? renderTeachers(item) : renderGroups(item));
    bindViewButtons();
}}

function renderGroups(item) {{
    if (!item.divisions.length) {{
        return `<div class="empty">W tej klasie nie wykryto podziałów na grupy w planie nauczycieli.</div>`;
    }}

    return item.divisions.map(division => `
        <article class="division">
            <div class="division-head">
                <h3>Podział: ${{escapeHtml(division.label)}}</h3>
                <div class="chips">
                    ${{division.groups.map(group => `<span class="chip">${{escapeHtml(group.name)}}</span>`).join("")}}
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Grupa</th>
                        <th>Przedmioty i nauczyciele</th>
                    </tr>
                </thead>
                <tbody>
                    ${{division.groups.map(group => `
                        <tr>
                            <td class="group-name">${{escapeHtml(group.name)}}</td>
                            <td>
                                <div class="subject-list">
                                    ${{group.subjects.map(row => `
                                        <div class="subject-row">
                                            <div class="subject">${{escapeHtml(row.subject)}}</div>
                                            <div class="teachers">${{row.teachers.length ? escapeHtml(row.teachers.join(", ")) : '<span class="missing">brak nauczyciela w planie</span>'}}</div>
                                        </div>
                                    `).join("")}}
                                </div>
                            </td>
                        </tr>
                    `).join("")}}
                </tbody>
            </table>
        </article>
    `).join("");
}}

function renderTeachers(item) {{
    if (!item.teacherSubjects.length) {{
        return `<div class="empty">W tej klasie nie wykryto nauczycieli uczących w oddziale.</div>`;
    }}

    return `
        <article class="copy-panel">
            <div class="copy-head">
                <h3>Lista do przekopiowania</h3>
                <button type="button" class="copy-button" data-copy-list>Kopiuj listę</button>
            </div>
            <pre id="copyList" class="copy-text" tabindex="0">${{escapeHtml(item.copyText)}}</pre>
        </article>
        <article class="division">
            <div class="division-head">
                <h3>Nauczyciele i przedmioty w oddziale</h3>
            </div>
            <div class="teacher-list">
                ${{item.teacherSubjects.map(row => `
                    <div class="teacher-row">
                        <div class="teacher-name">${{escapeHtml(row.teacher)}}</div>
                        <div class="teachers">${{escapeHtml(row.subjects.join("; "))}}</div>
                    </div>
                `).join("")}}
            </div>
        </article>
        <article class="vulcan-note">
            <h3>VULCAN: lista przedmiotów i nauczycieli</h3>
            <div class="teachers">${{escapeHtml(REPORT.vulcan.updated)}}</div>
            <ol>
                ${{REPORT.vulcan.steps.map(step => `<li>${{escapeHtml(step)}}</li>`).join("")}}
            </ol>
            <div class="source-links">
                ${{REPORT.vulcan.sources.map(source => `<a href="${{escapeHtml(source.url)}}" target="_blank" rel="noreferrer">${{escapeHtml(source.label)}}</a>`).join("")}}
            </div>
        </article>
    `;
}}

search.addEventListener("input", renderList);
window.addEventListener("hashchange", () => {{
    const hashClass = decodeURIComponent(window.location.hash.replace("#", ""));
    if (hashClass) {{
        activeClassId = hashClass;
        renderList();
        renderClass();
    }}
}});
renderList();
renderClass();
</script>
</body>
</html>
"""


def main():
    parser = argparse.ArgumentParser(description="Generate a class group division report from Dobry Plan HTML.")
    parser.add_argument("source", nargs="?", default="plan-lekcji-2026-09-01.html")
    parser.add_argument("output", nargs="?", default="wykaz-podzialow-grup.html")
    args = parser.parse_args()

    source_path = Path(args.source)
    output_path = Path(args.output)
    data = parse_source(source_path.read_text(encoding="utf-8"))
    output_path.write_text(render_html(data), encoding="utf-8")

    print(f"Generated {output_path} from {source_path}")
    print(
        f"Classes: {data['stats']['classes']}, "
        f"with groups: {data['stats']['classesWithGroups']}, "
        f"teachers: {data['stats']['teachers']}"
    )


if __name__ == "__main__":
    main()
