import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
test('Privacy sanitizer preserves scheduling cells and rejects diary identifiers', () => {
 execFileSync(process.env.PYTHON || 'python3', ['-c', `
import sys,io,openpyxl
sys.path.insert(0,'scripts')
from privacy_xlsx import sanitize,sensitive_values,INDIVIDUAL_MARKER
from pathlib import Path
data=Path('InformacjeOZastepstwach.xlsx').read_bytes()
assert not sensitive_values(data)
import zipfile,xml.etree.ElementTree as E
n='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

def with_diary(source, text):
 # Synthetic identifier inserted into a copy for the regression check.
 out=io.BytesIO()
 with zipfile.ZipFile(io.BytesIO(source)) as z,zipfile.ZipFile(out,'w') as t:
  for i in z.infolist():
   b=z.read(i.filename)
   if i.filename=='xl/worksheets/sheet3.xml':
    r=E.fromstring(b)
    for c in r.iter(n+'c'):
     if c.get('r')=='D2':
      c.clear();c.set('r','D2');c.set('t','inlineStr');E.SubElement(E.SubElement(c,n+'is'),n+'t').text=text
    b=E.tostring(r)
   t.writestr(i,b)
 return out.getvalue()

def cells(blob):
 book=openpyxl.load_workbook(io.BytesIO(blob))
 return {s.title:[list(r) for r in s.values] for s in book}

def diary_column(blob):
 rows=cells(blob)['Dzienniki zajeć innych']
 i=[j for j,h in enumerate(rows[0]) if str(h).strip()=='Dziennik zajęć innych'][0]
 return [r[i] for r in rows[1:]]

# A plain diary title is an identifier: it is detected and removed outright.
tainted=with_diary(data,'TEST STUDENT DIARY')
assert sensitive_values(tainted)=={'TEST STUDENT DIARY'}
clean=sanitize(tainted)
assert not sensitive_values(clean)
assert diary_column(clean)[0] is None or diary_column(clean)[0]==''
before,after=cells(tainted),cells(clean)
assert set(before)==set(after)
for title,rows in before.items():
 assert len(rows)==len(after[title]), title
 for y,(ra,rb) in enumerate(zip(rows,after[title])):
  for x,(va,vb) in enumerate(zip(ra,rb)):
   # Only the diary cell may change; every scheduling cell stays put.
   assert va==vb or (title=='Dzienniki zajeć innych' and y==1 and x==3), (title,y,x,va,vb)

# Individual tuition keeps the category marker but loses the pupil.
marked=sanitize(with_diary(data,'IND - Nazwisko Imie [1A]'))
assert not sensitive_values(marked)
assert diary_column(marked)[0]==INDIVIDUAL_MARKER
assert 'Nazwisko' not in b''.join(zipfile.ZipFile(io.BytesIO(marked)).read(x) for x in zipfile.ZipFile(io.BytesIO(marked)).namelist()).decode('utf8','ignore')
`]);
});
