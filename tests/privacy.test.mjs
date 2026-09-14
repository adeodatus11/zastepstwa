import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
test('Privacy sanitizer preserves scheduling cells and rejects diary identifiers', () => {
 execFileSync(process.env.PYTHON || 'python3', ['-c', `
import sys,io,openpyxl
sys.path.insert(0,'scripts')
from privacy_xlsx import sanitize,sensitive_values
from pathlib import Path
data=Path('InformacjeOZastepstwach.xlsx').read_bytes()
assert not sensitive_values(data)
# Synthetic identifier inserted into a copy for the regression check.
import zipfile,xml.etree.ElementTree as E
n='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
out=io.BytesIO()
with zipfile.ZipFile(io.BytesIO(data)) as z,zipfile.ZipFile(out,'w') as t:
 for i in z.infolist():
  b=z.read(i.filename)
  if i.filename=='xl/worksheets/sheet3.xml':
   r=E.fromstring(b)
   for c in r.iter(n+'c'):
    if c.get('r')=='D2':
     c.clear();c.set('r','D2');c.set('t','inlineStr');E.SubElement(E.SubElement(c,n+'is'),n+'t').text='TEST STUDENT DIARY'
   b=E.tostring(r)
  t.writestr(i,b)
assert sensitive_values(out.getvalue())=={'TEST STUDENT DIARY'}
clean=sanitize(out.getvalue())
assert not sensitive_values(clean)
a=openpyxl.load_workbook(io.BytesIO(data));b=openpyxl.load_workbook(io.BytesIO(clean))
for s in a:
 assert list(s.values)==list(b[s.title].values)
`]);
});
