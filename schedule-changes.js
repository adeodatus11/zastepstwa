(function () {
  function compactSpaces(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function stripAccents(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ł/g, "l")
      .replace(/Ł/g, "L");
  }

  function normalizeText(value) {
    return stripAccents(compactSpaces(value)).toLowerCase();
  }

  function normalizePersonKey(value) {
    return normalizeText(
      compactSpaces(value)
        .replace(/\[[^\]]+\]/g, "")
        .replace(/[()]/g, " ")
        .replace(/-/g, " ")
    )
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");
  }

  function normalizeBranchClass(value) {
    return normalizeText(value).replace(/\s+/g, "");
  }

  function normalizeGroup(value) {
    return normalizeText(value).replace(/\s+/g, "");
  }

  function encodePath(url) {
    return encodeURI(url).replace(/\+/g, "%2B");
  }

  async function fetchWorkbookFromCandidates(candidates) {
    for (const rawUrl of candidates) {
      const response = await fetch(`${encodePath(rawUrl)}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) {
        continue;
      }
      const buffer = await response.arrayBuffer();
      return {
        source: rawUrl,
        workbook: XLSX.read(buffer, { type: "array" })
      };
    }
    return null;
  }

  function parseIsoDateValue(value) {
    if (!value) {
      return "";
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    }

    const text = compactSpaces(value);
    if (!text) {
      return "";
    }

    const dotMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (dotMatch) {
      return `${dotMatch[3]}-${dotMatch[2]}-${dotMatch[1]}`;
    }

    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return text;
    }

    return "";
  }

  function isoDateToDayIndex(isoDate) {
    if (!isoDate) {
      return 0;
    }
    const date = new Date(`${isoDate}T00:00:00`);
    const day = date.getDay();
    return day === 0 ? 7 : day;
  }

  function parseBranch(rawBranch) {
    const text = compactSpaces(rawBranch);
    if (!text) {
      return {
        raw: "",
        className: "",
        classKey: "",
        groupName: "",
        groupKey: ""
      };
    }

    const [classNameRaw, groupRaw = ""] = text.split("|");
    const className = compactSpaces(classNameRaw);
    const groupName = compactSpaces(groupRaw);

    return {
      raw: text,
      className,
      classKey: normalizeBranchClass(className),
      groupName,
      groupKey: normalizeGroup(groupName)
    };
  }

  function parseLessonDescriptor(rawLesson) {
    const text = compactSpaces(rawLesson);
    if (!text) {
      return {
        period: 0,
        timeFrom: "",
        timeTo: ""
      };
    }

    const parts = text.split(",");
    const period = Number(compactSpaces(parts[0]));
    const timePart = compactSpaces(parts.slice(1).join(","));
    const timeMatch = timePart.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);

    return {
      period: Number.isFinite(period) ? period : 0,
      timeFrom: timeMatch ? timeMatch[1] : "",
      timeTo: timeMatch ? timeMatch[2] : ""
    };
  }

  function parseTransferDescriptor(rawDescriptor) {
    const text = compactSpaces(rawDescriptor);
    if (!text) {
      return null;
    }

    const parts = text.split(",").map((part) => compactSpaces(part));
    if (parts.length < 3) {
      return null;
    }

    const date = parseIsoDateValue(parts[0]);
    const period = Number(parts[1]);
    const timeMatch = parts[2].match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    const roomPart = parts.find((part) => /^sala:/i.test(part));
    const room = roomPart ? compactSpaces(roomPart.replace(/^sala:/i, "")) : "";

    return {
      raw: text,
      date,
      day: isoDateToDayIndex(date),
      period: Number.isFinite(period) ? period : 0,
      timeFrom: timeMatch ? timeMatch[1] : "",
      timeTo: timeMatch ? timeMatch[2] : "",
      room
    };
  }

  function createTeacherLookup(teachersById) {
    const byId = {};
    const byPersonKey = {};

    Object.entries(teachersById || {}).forEach(([id, teacher]) => {
      const name = compactSpaces((teacher && teacher.name) || "");
      if (!name) {
        return;
      }
      byId[id] = teacher;
      const key = normalizePersonKey(name);
      if (key && !byPersonKey[key]) {
        byPersonKey[key] = id;
      }
      const short = compactSpaces((teacher && teacher.short) || "");
      if (short) {
        const shortKey = normalizeText(short);
        if (shortKey && !byPersonKey[shortKey]) {
          byPersonKey[shortKey] = id;
        }
      }
    });

    function resolve(rawName) {
      const personKey = normalizePersonKey(rawName);
      if (personKey && byPersonKey[personKey]) {
        const id = byPersonKey[personKey];
        return { id, name: byId[id].name };
      }

      const shortMatch = String(rawName || "").match(/\[([^\]]+)\]|\(([^\)]+)\)/);
      if (shortMatch) {
        const shortKey = normalizeText(shortMatch[1] || shortMatch[2] || "");
        if (shortKey && byPersonKey[shortKey]) {
          const id = byPersonKey[shortKey];
          return { id, name: byId[id].name };
        }
      }

      return { id: "", name: compactSpaces(rawName) };
    }

    return { resolve };
  }

  function makeSubstitutionKey(event) {
    return [
      event.date,
      event.period,
      event.branch.classKey,
      event.branch.groupKey,
      normalizeText(event.subject),
      normalizePersonKey(event.absentTeacherName)
    ].join("|");
  }

  function makeTransferKey(event) {
    return [
      event.from.date,
      event.from.period,
      event.branch.classKey,
      event.branch.groupKey,
      normalizeText(event.subject),
      normalizePersonKey(event.teacherName)
    ].join("|");
  }

  function inferSubstitutionKind(event) {
    const candidate = normalizeText(event.effectLabel || event.rawSubstituteLabel || event.substituteTeacherName || "");
    if (candidate.includes("przychodza pozniej") || candidate.includes("przychodzą później")) {
      return "late";
    }
    if (candidate.includes("zwolnieni do domu")) {
      return "cancelled";
    }
    if (candidate.includes("zlaczenie grup") || candidate.includes("złączenie grup")) {
      return "merge";
    }
    if (event.substituteTeacherId || event.substituteTeacherName) {
      return "teacher_substitution";
    }
    return "effect";
  }

  function substitutionLabelScore(value) {
    const candidate = normalizeText(value);
    if (!candidate) {
      return 0;
    }
    if (candidate.includes("przychodza pozniej") || candidate.includes("przychodzą później") || candidate.includes("zwolnieni do domu")) {
      return 4;
    }
    if (candidate.includes("zlaczenie grup") || candidate.includes("złączenie grup")) {
      return 3;
    }
    if (candidate === "zastepstwo") {
      return 1;
    }
    return 2;
  }

  function chooseMoreSpecificSubstitutionLabel(currentValue, candidateValue) {
    if (!currentValue) {
      return candidateValue;
    }
    if (!candidateValue) {
      return currentValue;
    }
    return substitutionLabelScore(candidateValue) > substitutionLabelScore(currentValue)
      ? candidateValue
      : currentValue;
  }

  function parseDetailedChanges(workbook, teacherLookup) {
    const substitutions = new Map();
    const transfers = new Map();

    const substitutionSheet = workbook.Sheets["Dane zastępstwa"];
    if (substitutionSheet) {
      const rows = XLSX.utils.sheet_to_json(substitutionSheet, { defval: "" });
      rows.forEach((row) => {
        const branch = parseBranch(row["Oddział/dziennik/grupa/miejsce dyżuru z podziałem"] || row["Oddział/dziennik/grupa/miejsce dyżuru"]);
        const absentTeacher = teacherLookup.resolve(row["Prowadzący"]);
        const substituteTeacher = teacherLookup.resolve(row["Zastępstwo"]);
        const event = {
          date: parseIsoDateValue(row["Data"]),
          day: isoDateToDayIndex(parseIsoDateValue(row["Data"])),
          period: Number(row["Numer lekcji"]) || 0,
          timeFrom: compactSpaces(row["Godzina od"]),
          timeTo: compactSpaces(row["Godzina do"]),
          branch,
          subject: compactSpaces(row["Nazwa zajęć"]),
          replacementSubject: compactSpaces(row["Realizowana nazwa zajęć"]),
          absentTeacherId: absentTeacher.id,
          absentTeacherName: absentTeacher.name,
          substituteTeacherId: substituteTeacher.id,
          substituteTeacherName: substituteTeacher.name,
          rawSubstituteLabel: compactSpaces(row["Zastępstwo"]),
          reason: compactSpaces(row["Powód nieobecności"]),
          effectLabel: compactSpaces(row["Skutek nieobecności"]),
          replacementType: compactSpaces(row["Forma zastępstwa"]),
          paymentForm: compactSpaces(row["Forma płatności"]),
          paymentType: compactSpaces(row["Typ płatności"]),
          note: "",
          room: ""
        };
        substitutions.set(makeSubstitutionKey(event), event);
      });
    }

    const transferSheet = workbook.Sheets["Dane przeniesienia"];
    if (transferSheet) {
      const rows = XLSX.utils.sheet_to_json(transferSheet, { defval: "" });
      rows.forEach((row) => {
        const fromDate = parseIsoDateValue(row["Data"]);
        const toDate = parseIsoDateValue(row["Data przeniesienia"]) || fromDate;
        const branch = parseBranch(row["Oddział/dziennik/grupa z podziałem"] || row["Oddział/dziennik/grupa"]);
        const event = {
          branch,
          subject: compactSpaces(row["Nazwa zajęć"]),
          teacherId: "",
          teacherName: "",
          note: "Przeniesienie lekcji",
          roomChanged: compactSpaces(row["Zmiana sali"]),
          from: {
            date: fromDate,
            day: isoDateToDayIndex(fromDate),
            period: Number(row["Numer lekcji"]) || 0,
            timeFrom: compactSpaces(row["Godzina od"]),
            timeTo: compactSpaces(row["Godzina do"]),
            room: ""
          },
          to: {
            date: toDate,
            day: isoDateToDayIndex(toDate),
            period: Number(row["Numer lekcji przeniesienia"]) || 0,
            timeFrom: compactSpaces(row["Godzina od przeniesienia"]),
            timeTo: compactSpaces(row["Godzina do przeniesienia"]),
            room: ""
          }
        };
        transfers.set(makeTransferKey(event), event);
      });
    }

    return { substitutions, transfers };
  }

  function parseInfoSubstitutions(workbook, teacherLookup) {
    const substitutions = new Map();
    const sheet = workbook.Sheets["Oddziały"] || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      return substitutions;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    rows.forEach((row) => {
      const lessonMeta = parseLessonDescriptor(row["Lekcja"]);
      const branch = parseBranch(row["Oddział"]);
      const absentTeacher = teacherLookup.resolve(row["Nauczyciel/wakat"]);
      const substituteRaw = compactSpaces(row["Zastępca"]);
      const substituteTeacher = teacherLookup.resolve(substituteRaw);
      const event = {
        date: parseIsoDateValue(row["Dzień"]),
        day: isoDateToDayIndex(parseIsoDateValue(row["Dzień"])),
        period: lessonMeta.period,
        timeFrom: lessonMeta.timeFrom,
        timeTo: lessonMeta.timeTo,
        branch,
        subject: compactSpaces(row["Przedmiot"]),
        replacementSubject: compactSpaces(row["Przedmiot"]),
        absentTeacherId: absentTeacher.id,
        absentTeacherName: absentTeacher.name,
        substituteTeacherId: substituteTeacher.id,
        substituteTeacherName: substituteTeacher.id ? substituteTeacher.name : "",
        rawSubstituteLabel: substituteRaw,
        reason: "",
        effectLabel: substituteTeacher.id ? "Zastępstwo" : substituteRaw,
        replacementType: "",
        paymentForm: compactSpaces(row["Forma płatności"]),
        paymentType: "",
        note: compactSpaces(row["Uwagi"]),
        room: compactSpaces(row["Sala"])
      };
      substitutions.set(makeSubstitutionKey(event), event);
    });

    return substitutions;
  }

  function parseInfoTransfers(workbook, teacherLookup) {
    const transfers = new Map();
    const sheet = workbook.Sheets["Oddziały"] || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      return transfers;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    rows.forEach((row) => {
      const from = parseTransferDescriptor(row["Przeniesiono z"]);
      const to = parseTransferDescriptor(row["Przeniesiono na"]);
      if (!from || !to) {
        return;
      }

      const branch = parseBranch(row["Oddział"]);
      const teacher = teacherLookup.resolve(row["Nauczyciel/wakat"]);
      const event = {
        branch,
        subject: compactSpaces(row["Przedmiot"]),
        teacherId: teacher.id,
        teacherName: teacher.name,
        note: compactSpaces(row["Uwagi"]),
        roomChanged: from.room !== to.room ? "Tak" : "Nie",
        from,
        to
      };

      transfers.set(makeTransferKey(event), event);
    });

    return transfers;
  }

  function mergeSubstitutionMaps(primaryMap, secondaryMap) {
    const result = new Map();

    primaryMap.forEach((event, key) => {
      result.set(key, { ...event });
    });

    secondaryMap.forEach((event, key) => {
      const existing = result.get(key) || {};
      const merged = {
        ...existing,
        ...event,
        branch: event.branch || existing.branch,
        effectLabel: chooseMoreSpecificSubstitutionLabel(existing.effectLabel, event.effectLabel),
        replacementType: existing.replacementType || event.replacementType,
        paymentForm: event.paymentForm || existing.paymentForm,
        paymentType: existing.paymentType || event.paymentType,
        reason: existing.reason || event.reason,
        note: existing.note || event.note,
        rawSubstituteLabel: existing.rawSubstituteLabel || event.rawSubstituteLabel,
        room: event.room || existing.room,
        replacementSubject: existing.replacementSubject || event.replacementSubject
      };
      merged.kind = inferSubstitutionKind(merged);
      result.set(key, merged);
    });

    result.forEach((event) => {
      if (!event.kind) {
        event.kind = inferSubstitutionKind(event);
      }
    });

    return [...result.values()].sort((left, right) => {
      if (left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }
      if (left.period !== right.period) {
        return left.period - right.period;
      }
      return left.branch.className.localeCompare(right.branch.className, "pl");
    });
  }

  function mergeTransferMaps(primaryMap, secondaryMap) {
    const result = new Map();

    primaryMap.forEach((event, key) => {
      result.set(key, { ...event, from: { ...event.from }, to: { ...event.to } });
    });

    secondaryMap.forEach((event, key) => {
      const existing = result.get(key) || {};
      result.set(key, {
        ...existing,
        ...event,
        branch: event.branch || existing.branch,
        teacherId: event.teacherId || existing.teacherId,
        teacherName: event.teacherName || existing.teacherName,
        note: event.note || existing.note,
        roomChanged: event.roomChanged || existing.roomChanged,
        from: { ...(existing.from || {}), ...(event.from || {}) },
        to: { ...(existing.to || {}), ...(event.to || {}) }
      });
    });

    return [...result.values()].sort((left, right) => {
      if (left.from.date !== right.from.date) {
        return left.from.date.localeCompare(right.from.date);
      }
      if (left.from.period !== right.from.period) {
        return left.from.period - right.from.period;
      }
      return left.branch.className.localeCompare(right.branch.className, "pl");
    });
  }

  async function loadChangeSets(config, teachersById) {
    const teacherLookup = createTeacherLookup(teachersById);
    const detailedSource = await fetchWorkbookFromCandidates(config.detailedChanges || []);
    const substitutionInfoSource = await fetchWorkbookFromCandidates(config.substitutionsInfo || []);
    const transferInfoSource = await fetchWorkbookFromCandidates(config.transfersInfo || []);

    const detailed = detailedSource ? parseDetailedChanges(detailedSource.workbook, teacherLookup) : { substitutions: new Map(), transfers: new Map() };
    const substitutionInfo = substitutionInfoSource ? parseInfoSubstitutions(substitutionInfoSource.workbook, teacherLookup) : new Map();
    const transferInfo = transferInfoSource ? parseInfoTransfers(transferInfoSource.workbook, teacherLookup) : new Map();

    return {
      substitutions: mergeSubstitutionMaps(detailed.substitutions, substitutionInfo),
      transfers: mergeTransferMaps(detailed.transfers, transferInfo),
      sources: {
        detailedChanges: detailedSource ? detailedSource.source : "",
        substitutionsInfo: substitutionInfoSource ? substitutionInfoSource.source : "",
        transfersInfo: transferInfoSource ? transferInfoSource.source : ""
      }
    };
  }

  function lessonMatchesBranch(lesson, branch) {
    if (!branch || !branch.classKey) {
      return false;
    }

    const lessonClasses = lesson.classNames || (lesson.className ? [lesson.className] : []);
    const classMatch = lessonClasses.some((className) => normalizeBranchClass(className) === branch.classKey);
    if (!classMatch) {
      return false;
    }

    if (!branch.groupKey) {
      return true;
    }

    const lessonGroups = lesson.groupNames || (lesson.groupName ? [lesson.groupName] : []);
    if (lessonGroups.length === 0) {
      return false;
    }

    return lessonGroups.some((groupName) => normalizeGroup(groupName) === branch.groupKey);
  }

  function lessonMatchesSubstitution(lesson, event) {
    if (!event || lesson.period !== event.period || !lessonMatchesBranch(lesson, event.branch)) {
      return false;
    }

    if (event.absentTeacherId && lesson.teacherIds && lesson.teacherIds.length > 0) {
      return lesson.teacherIds.includes(event.absentTeacherId);
    }

    const lessonTeachers = lesson.teacherNames || [];
    return lessonTeachers.some((teacherName) => normalizePersonKey(teacherName) === normalizePersonKey(event.absentTeacherName));
  }

  function lessonMatchesTransfer(lesson, event) {
    if (!event || lesson.period !== event.from.period || !lessonMatchesBranch(lesson, event.branch)) {
      return false;
    }

    if (event.teacherId && lesson.teacherIds && lesson.teacherIds.length > 0) {
      return lesson.teacherIds.includes(event.teacherId);
    }

    const lessonTeachers = lesson.teacherNames || [];
    return lessonTeachers.some((teacherName) => normalizePersonKey(teacherName) === normalizePersonKey(event.teacherName));
  }

  window.ScheduleChanges = {
    loadChangeSets,
    normalizeText,
    normalizeBranchClass,
    normalizeGroup,
    normalizePersonKey,
    parseBranch,
    lessonMatchesBranch,
    lessonMatchesSubstitution,
    lessonMatchesTransfer
  };
})();
