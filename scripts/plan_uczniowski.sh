#!/usr/bin/env bash
# Nakładka zmian planu uczniowskiego (plan.szkolamistrzow.info) z tych samych,
# już oczyszczonych eksportów, z których powstał serwis nauczyciela.
# Uruchamia ją site.yml po wdrożeniu; lokalnie: PLAN_DIR=../plan-4-maja-2026.
# Kontrole są te same co w skillu `zastepstwa` repozytorium planu (sekcja 4).
set -euo pipefail
PLAN_DIR=${PLAN_DIR:-plan}
src() { node -p "require('./publication.json').sources.$1"; }

python3 "$PLAN_DIR/scripts/build_student_changes.py" \
  "$(src substitutions)" "$(src transfers)" \
  --plan-xml "$(src xml)" --output "$PLAN_DIR/student-changes.json"

python3 - "$PLAN_DIR/student-changes.json" <<'PY'
import json, re, sys
d = json.load(open(sys.argv[1]))
print('Okres', d['validFrom'], '–', d['validTo'], '|', len(d['substitutions']), 'zastępstw,', len(d['transfers']), 'przeniesień')
problems = []
for x in d['substitutions'] + d['transfers']:
    if not x['sourceTeacher']:
        problems.append(f"bez skrótu nauczyciela: {x['date']} lekcja {x['period']} {x['className']}")
    g = x['groupName']
    if g and not any(s.lower() in (g.lower(), 'cała klasa') for s in x['sourceGroups']):
        problems.append(f"grupa nie pokryta planem: {x['date']} lekcja {x['period']} {x['className']} {g}")
    if re.match(r'^\s*IND?\b', x['className'], re.I) or re.match(r'^\s*IND?\b', x['groupName'], re.I):
        problems.append(f"IND w publikacji: {x['date']} {x['className']} {x['groupName']}")
for p in problems:
    print('::error::' + p)
sys.exit(1 if problems else 0)
PY

(cd "$PLAN_DIR" && node scripts/test_student_changes.cjs)
