#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable

from openpyxl import load_workbook


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = Path(
    "/Users/maciejnajwer/Library/CloudStorage/OneDrive-ZESPÓŁSZKÓŁZAWODOWYCHNR5/rok szkolny 2026_2027/"
    "kalendarz 2026-2027 (stan na 2026.08.23) wysłane do NajwerM.xlsx"
)
DEFAULT_OUTPUT = REPO_ROOT / "calendar-data-2026-2027.json"


@dataclass
class EventDraft:
    start: str
    end: str | None
    all_day: bool
    title: str
    description: str
    category: str
    tags: list[str]
    priority: str
    audience: str
    needs_confirmation: bool = False
    source_note: str | None = None
    display: str | None = None

    def to_dict(self, idx: int) -> dict:
        payload = {
            "id": f"evt-{idx:04d}",
            "title": self.title,
            "start": self.start,
            "allDay": self.all_day,
            "category": self.category,
            "tags": self.tags,
            "priority": self.priority,
            "audience": self.audience,
            "extendedProps": {
                "description": self.description,
                "needsConfirmation": self.needs_confirmation,
                "sourceNote": self.source_note or "",
            },
        }
        if self.end:
            payload["end"] = self.end
        if self.display:
            payload["display"] = self.display
        return payload


def compact(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def slug(text: str) -> str:
    lowered = text.lower()
    lowered = (
        lowered.replace("ą", "a")
        .replace("ć", "c")
        .replace("ę", "e")
        .replace("ł", "l")
        .replace("ń", "n")
        .replace("ó", "o")
        .replace("ś", "s")
        .replace("ź", "z")
        .replace("ż", "z")
    )
    lowered = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
    return lowered


def iso_day(value: datetime | date) -> str:
    return value.strftime("%Y-%m-%d")


def next_day_iso(day: date) -> str:
    return (day + timedelta(days=1)).strftime("%Y-%m-%d")


def split_chunks(text: str) -> list[str]:
    if not text:
        return []
    normalized = compact(text)
    if not normalized:
        return []
    return [chunk.strip() for chunk in re.split(r"\n\s*\n", normalized) if chunk.strip()]


def detect_category(text: str) -> tuple[str, list[str], str]:
    lower = text.lower()
    tags: set[str] = set()
    category = "general"
    priority = "normal"

    if "rada pedagogiczna" in lower or "rada " in lower:
        category = "council"
        tags.add("rady")
        priority = "high"
    if any(token in lower for token in ["wystawienie ocen", "zestawień klasyfikacyjnych", "klasyfikacyjna", "proponowanych ocen", "ocen rocznych", "ocen końcowych"]):
        category = "classification"
        tags.add("klasyfikacja")
        priority = "high"
    if any(token in lower for token in ["matura", "egzamin", "egzaminy", "egzaminu semestralnego"]):
        if category == "general":
            category = "exam"
        tags.add("egzaminy")
        priority = "high"
    if "praktyki" in lower:
        if category == "general":
            category = "practice"
        tags.add("praktyki")
    if any(token in lower for token in ["zebranie", "zebrania", "konsultacje", "rada rodziców"]):
        if category == "general":
            category = "meeting"
        tags.add("spotkania")
    if any(token in lower for token in ["wolne", "ferie", "przerwa świąteczna", "święto", "boże ciało", "wielkanoc"]):
        if category == "general":
            category = "holiday"
        tags.add("wolne")
    if "bs2st" in lower or "semestr bs2" in lower or "semestr bs ii" in lower:
        tags.add("bs2")
    if "do doprecyzowania" in lower or "wymaga doprecyzowania" in lower:
        tags.add("doprecyzowanie")
        priority = "important"

    if any(token in lower for token in ["jubileusz", "święto szkoły", "rozpoczęcie roku", "zakończenie roku"]):
        priority = "high"
        tags.add("kluczowe")

    return category, sorted(tags), priority


def detect_audience(text: str) -> str:
    lower = text.lower()
    if "wszyscy nauczyciele" in lower or "rada pedagogiczna" in lower:
        return "nauczyciele"
    if "5 technikum" in lower or "klasy 5" in lower:
        return "klasy maturalne"
    if "bs2st" in lower:
        return "bs ii stopnia"
    if "1-4 technikum" in lower or "1-3 bs1st" in lower or "pozostałe klasy" in lower:
        return "technikum i bs i"
    if "praktyki" in lower:
        return "wybrane klasy"
    if "rodzic" in lower:
        return "rodzice i wychowawcy"
    return "wszyscy"


def short_title(text: str, fallback: str) -> str:
    first_line = compact(text).split("\n")[0].strip(" -;")
    if first_line:
        title = first_line
    else:
        title = fallback
    if len(title) > 88:
        title = title[:85].rstrip() + "..."
    return title


def parse_time(text: str) -> str | None:
    match = re.search(r"(\d{1,2}:\d{2})", text)
    if not match:
        return None
    hour, minute = match.group(1).split(":")
    return f"{int(hour):02d}:{minute}"


def build_timed_event(day: date, chunk: str, source_note: str | None = None, needs_confirmation: bool = False) -> EventDraft:
    category, tags, priority = detect_category(chunk)
    audience = detect_audience(chunk)
    title = short_title(chunk, "Wydarzenie")
    time_text = parse_time(chunk)
    if time_text and "do ustalenia" not in chunk.lower():
        start = f"{day.strftime('%Y-%m-%d')}T{time_text}:00"
        hour, minute = [int(part) for part in time_text.split(":")]
        end_dt = datetime(day.year, day.month, day.day, hour, minute) + timedelta(minutes=90)
        end = end_dt.strftime("%Y-%m-%dT%H:%M:%S")
        all_day = False
    else:
        start = day.strftime("%Y-%m-%d")
        end = None
        all_day = True

    return EventDraft(
        start=start,
        end=end,
        all_day=all_day,
        title=title,
        description=chunk,
        category=category,
        tags=tags,
        priority=priority,
        audience=audience,
        needs_confirmation=needs_confirmation,
        source_note=source_note,
    )


def make_range_event(start_day: date, end_day: date, title: str, description: str, category: str, tags: Iterable[str], priority: str, audience: str, source_note: str | None = None) -> EventDraft:
    return EventDraft(
        start=start_day.strftime("%Y-%m-%d"),
        end=next_day_iso(end_day),
        all_day=True,
        title=title,
        description=description,
        category=category,
        tags=sorted(set(tags)),
        priority=priority,
        audience=audience,
        source_note=source_note,
    )


def rows_from_sheet(source_path: Path) -> list[dict]:
    wb = load_workbook(source_path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = []
    for values in ws.iter_rows(min_row=2, values_only=True):
        dt, _, _, _, opis1, opis2, praktyki, inne = values
        if not dt:
            continue
        rows.append(
            {
                "date": dt.date() if isinstance(dt, datetime) else dt,
                "opis1": compact(str(opis1)) if opis1 not in (None, "") else "",
                "opis2": compact(str(opis2)) if opis2 not in (None, "") else "",
                "praktyki": compact(str(praktyki)) if praktyki not in (None, "") else "",
                "inne": compact(str(inne)) if inne not in (None, "") else "",
            }
        )
    return rows


def collect_ranges(rows: list[dict], label: str) -> list[tuple[date, date]]:
    dates = [row["date"] for row in rows if label in " | ".join([row["opis1"], row["opis2"], row["praktyki"], row["inne"]]).lower()]
    if not dates:
        return []
    dates = sorted(dates)
    groups: list[tuple[date, date]] = []
    start = dates[0]
    prev = dates[0]
    for current in dates[1:]:
        if current == prev + timedelta(days=1):
            prev = current
            continue
        groups.append((start, prev))
        start = current
        prev = current
    groups.append((start, prev))
    return groups


def build_events(rows: list[dict]) -> list[EventDraft]:
    events: list[EventDraft] = []

    # Range events from XLSX recurring daily markers.
    winter_break = collect_ranges(rows, "zimowa przewa świąteczna")
    spring_break = collect_ranges(rows, "wiosenna przerwa świąteczna")
    winter_holidays = collect_ranges(rows, "ferie")

    if winter_break:
        start, end = winter_break[0]
        events.append(
            make_range_event(
                start,
                end,
                "Zimowa przerwa świąteczna",
                "Zakres wygenerowany z dziennych wpisów XLSX.",
                "holiday",
                ["wolne", "przerwa", "kluczowe"],
                "high",
                "wszyscy",
            )
        )
    if winter_holidays:
        start, end = winter_holidays[0]
        events.append(
            make_range_event(
                start,
                end,
                "Ferie zimowe",
                "Zakres wygenerowany z dziennych wpisów XLSX.",
                "holiday",
                ["wolne", "ferie", "kluczowe"],
                "high",
                "wszyscy",
            )
        )
    if spring_break:
        start, end = spring_break[0]
        events.append(
            make_range_event(
                start,
                end,
                "Wiosenna przerwa świąteczna",
                "Zakres wygenerowany z dziennych wpisów XLSX.",
                "holiday",
                ["wolne", "przerwa", "kluczowe"],
                "high",
                "wszyscy",
            )
        )

    practice_3_start = date(2026, 10, 5)
    practice_3_end = date(2026, 10, 30)
    practice_4_start = date(2027, 2, 2)
    practice_4_end = date(2027, 2, 26)
    events.append(
        make_range_event(
            practice_3_start,
            practice_3_end,
            "Praktyki zawodowe - klasy 3 technikum",
            "Zakres zgodnie z XLSX: 5.10.2026 - 30.10.2026.",
            "practice",
            ["praktyki", "kluczowe"],
            "important",
            "wybrane klasy",
        )
    )
    events.append(
        make_range_event(
            practice_4_start,
            practice_4_end,
            "Praktyki zawodowe - klasy 4 technikum",
            "Zakres zgodnie z XLSX: 2.02.2027 - 26.02.2027.",
            "practice",
            ["praktyki", "kluczowe"],
            "important",
            "wybrane klasy",
        )
    )

    skip_exact_chunks = {
        "wolne",
        "ferie",
        "zimowa przewa świąteczna",
        "wiosenna przerwa świąteczna",
        "praktyki: klasy 3 technikum",
        "praktyki: klasy 4 technikum",
    }

    for row in rows:
        day = row["date"]
        cell_chunks: list[str] = []
        for key in ("opis1", "opis2", "praktyki", "inne"):
            cell_chunks.extend(split_chunks(row[key]))

        for chunk in cell_chunks:
            normalized = chunk.lower().strip()
            if normalized in skip_exact_chunks:
                continue

            # Manual correction: Rada pedagogiczna on 9 Sep 2026, not 10 Sep.
            if day == date(2026, 9, 10) and normalized.startswith("rada pedagogiczna"):
                events.append(
                    build_timed_event(
                        date(2026, 9, 9),
                        chunk,
                        source_note="Ręczna korekta użytkownika: rada pedagogiczna przeniesiona na 9.09.2026.",
                    )
                )
                continue

            # Manual split: Aug 31 council is embedded under Jun 28 in XLSX.
            if day == date(2027, 6, 28) and normalized.startswith("rada pedagogiczna"):
                events.append(
                    EventDraft(
                        start="2027-06-28",
                        end=None,
                        all_day=True,
                        title="Rada pedagogiczna - wpis wymaga doprecyzowania",
                        description=(
                            "Arkusz XLSX zawiera pod datą 28.06.2027 treść odnoszącą się do 31.08.2027. "
                            "Zostawiono ten punkt jako osobny wpis wymagający wyjaśnienia.\n\n"
                            f"Oryginalna treść:\n{chunk}"
                        ),
                        category="council",
                        tags=["doprecyzowanie", "rady"],
                        priority="important",
                        audience="nauczyciele",
                        needs_confirmation=True,
                        source_note="Ręczna interpretacja: 28.06.2027 i 31.08.2027 to dwa różne terminy rad.",
                    )
                )
                august_chunk = (
                    "RADA PEDAGOGICZNA: 31 sierpnia 2027 r. godz. 9:00\n"
                    "1) klasyfikacyjna: klasyfikacja uczniów po egzaminach poprawkowych\n"
                    "2) plenarna: podsumowanie roku szkolnego 2026/2027\n"
                    "3) inauguracyjna: rozpoczynająca rok szkolny 2027/2028"
                )
                events.append(
                    build_timed_event(
                        date(2027, 8, 31),
                        august_chunk,
                        source_note="Ręczna interpretacja na podstawie wpisu z 28.06.2027 i uwagi użytkownika.",
                    )
                )
                continue

            needs_confirmation = False
            source_note = None
            if day == date(2027, 6, 17) and "3 semestr bs2st" in normalized:
                needs_confirmation = True
                source_note = "Użytkownik wskazał, że wpis BS II przy 17.06.2027 wymaga doprecyzowania."

            events.append(build_timed_event(day, chunk, source_note=source_note, needs_confirmation=needs_confirmation))

    return events


def sort_key(event: EventDraft) -> tuple[str, int, str]:
    return (
        event.start,
        0 if not event.all_day else 1,
        slug(event.title),
    )


def main() -> None:
    rows = rows_from_sheet(DEFAULT_SOURCE)
    events = sorted(build_events(rows), key=sort_key)

    category_counts: dict[str, int] = defaultdict(int)
    confirmation_count = 0
    for event in events:
        category_counts[event.category] += 1
        if event.needs_confirmation:
            confirmation_count += 1

    payload = {
        "meta": {
            "schoolYear": "2026/2027",
            "generatedAt": datetime.now().isoformat(timespec="seconds"),
            "sourceWorkbook": str(DEFAULT_SOURCE),
            "totalEvents": len(events),
            "confirmationCount": confirmation_count,
            "categoryCounts": dict(sorted(category_counts.items())),
            "notes": [
                "Źródłem prawdy jest XLSX z 2026-08-23, z ręcznymi korektami wskazanymi przez użytkownika.",
                "Rada pedagogiczna wrześniowa została ustawiona na 2026-09-09.",
                "Wpis rady z 2027-08-31 został wydzielony z wiersza 2027-06-28, a 2027-06-28 pozostaje jako punkt do doprecyzowania.",
                "Wpis BS II z 2027-06-17 został oznaczony jako wymagający doprecyzowania.",
            ],
        },
        "events": [event.to_dict(idx + 1) for idx, event in enumerate(events)],
    }

    DEFAULT_OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved {DEFAULT_OUTPUT}")
    print(f"events: {len(events)}")


if __name__ == "__main__":
    main()
