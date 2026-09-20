"""Reject or redact diary identifiers before committing school exports."""
import argparse
import io
import re
import subprocess
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
import openpyxl

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
# Individual tuition is never published, so its diary keeps only this category
# marker: the pupil's name goes, the reason the row is skipped stays auditable.
INDIVIDUAL_MARKER = 'IND'
INDIVIDUAL_PATTERN = re.compile(r'^\s*IND?\b', re.IGNORECASE)

def is_individual(value):
    return bool(INDIVIDUAL_PATTERN.match(str(value)))

def sensitive_values(data):
    workbook = openpyxl.load_workbook(io.BytesIO(data), read_only=True)
    values = set()
    for sheet in workbook:
        rows = iter(sheet.values)
        headers = next(rows, ())
        columns = [i for i, h in enumerate(headers) if str(h).strip() == 'Dziennik zajęć innych']
        for row in rows:
            values.update(
                str(row[i])
                for i in columns
                if i < len(row) and row[i] and str(row[i]).strip() != INDIVIDUAL_MARKER
            )
    return values

def sanitize(data):
    values = {v: (INDIVIDUAL_MARKER if is_individual(v) else '') for v in sensitive_values(data)}
    result = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as source, zipfile.ZipFile(result, 'w') as target:
        for info in source.infolist():
            content = source.read(info.filename)
            if info.filename == 'xl/sharedStrings.xml' or info.filename.startswith('xl/worksheets/') and info.filename.endswith('.xml'):
                root = ET.fromstring(content)
                changed = False
                for tag in ('si', 'is'):
                    for item in root.iter(NS + tag):
                        text = ''.join(item.itertext())
                        if text in values:
                            for child in list(item):
                                item.remove(child)
                            ET.SubElement(item, NS + 't').text = values[text]
                            changed = True
                if changed:
                    content = ET.tostring(root, encoding='utf-8', xml_declaration=True)
            target.writestr(info, content)
    cleaned = result.getvalue()
    if sensitive_values(cleaned):
        raise ValueError('Nie udało się oczyścić nazw dzienników')
    return cleaned

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--sanitize', type=Path)
    p.add_argument('--revision', default='HEAD')
    args = p.parse_args()
    if args.sanitize:
        args.sanitize.write_bytes(sanitize(args.sanitize.read_bytes()))
        print(f'Usunięto nazwy dzienników (nauczanie indywidualne oznaczone jako {INDIVIDUAL_MARKER}). Zachowano dane planu.')
    else:
        files = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', args.revision], text=True).splitlines()
        bad = []
        for path in files:
            if path.lower().endswith('.xlsx'):
                data = subprocess.check_output(['git', 'show', f'{args.revision}:{path}'])
                if sensitive_values(data):
                    bad.append(path)
        if bad:
            raise SystemExit('Zablokowano pliki z nazwami dzienników: ' + ', '.join(bad))
        print('Kontrola prywatności XLSX: OK')
