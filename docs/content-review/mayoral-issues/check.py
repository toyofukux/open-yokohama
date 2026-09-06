"""Recheck the fixed source bytes, table extraction, arithmetic and manuscript coverage."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, re, unicodedata

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
sources = json.loads((HERE / 'sources.json').read_text())
texts = {}
for source in sources:
 raw = ROOT / source['localPath']
 assert hashlib.sha256(raw.read_bytes()).hexdigest() == source['sha256'], source['id']
 texts[source['id']] = (ROOT / source['textPath']).read_text()

def number(value): return int(value.replace(',', '').replace(' ', ''))
def yen_from_thousands(value):
 yen = value * 1000
 oku, rest = divmod(yen, 100000000)
 man, rest = divmod(rest, 10000)
 return f'{oku}億{man:,}万{rest // 1000}千円'

def childcare_row(prefix):
 line = next(line for line in texts['N1'].splitlines() if line.strip().startswith(prefix))
 # A row contains R6, R7, R8 and difference, in this order.
 cells = re.findall(r'[▲△]?\d[\d,]*', line)
 return number(cells[2])

applications = childcare_row('保育所等利用申請者数 (A)')
enrolled = childcare_row('利用児童数 (B)')
held = childcare_row('保留児童数 (C)')
extension = childcare_row('育児休業の延長を希望される方 (D)')
remaining = childcare_row('育児休業延長希望を除いた数 (E)')
assert applications - enrolled == held == 2532
assert held - extension == remaining == 1256
ages = re.search(r'保留児童数\s+167\s*人\s+(\d+)\s*人\s+(\d+)\s*人', texts['N1'])
assert ages
ratio = (number(ages[1]) + number(ages[2])) / remaining * 100
assert round(ratio) == 72
childcare = (HERE / 'childcare-access.md').read_text()
for value in [f'{applications:,}', f'{enrolled:,}', f'{held:,}', f'{remaining:,}', f'{extension:,}', '約72％']:
 assert value in childcare

expo_row = re.search(r'令和8年度\s+([\d,]+)\s+0\s+0\s+([\d,]+)\s+0\s+([\d,]+)', texts['X1'])
assert expo_row
total, other, general = map(number, expo_row.groups())
assert other + general == total
expo = (HERE / 'green-expo.md').read_text()
for value in [total, other, general]: assert yen_from_thousands(value) in expo
heat = re.search(r'酷暑対策（断熱・空調）\s+([\d,]+)千円', texts['D1'])
assert heat
shelters = (HERE / 'school-shelters.md').read_text()
assert yen_from_thousands(number(heat[1])) in shelters
assert '219校' in texts['D1'] and '123校' in texts['D1']
assert '123校と80校の関係は、この資料だけでは確認できていない' in shelters

normalized = unicodedata.normalize('NFKC', texts['F1'])
assert '2兆933億円' in normalized and '4兆700億円' in normalized
for amount in ['100億円', '400億円', '200億円', '40億円']: assert amount in texts['F2']
assert '10月18日' in texts['E1'] and '10月４日' in texts['E1']
assert texts['E2'].count('今後掲載予定') >= 2

manuscripts = []
known_urls = {source['url'] for source in sources}
for manuscript in sorted(HERE.glob('*.md')):
 body = manuscript.read_text()
 if not body.startswith('---'): continue
 links = re.findall(r'\]\((https://[^)]+)\)', body)
 assert links and all(link.split('#')[0] in known_urls for link in links)
 manuscripts.append(dict(path=str(manuscript.relative_to(ROOT)), sha256=hashlib.sha256(manuscript.read_bytes()).hexdigest(), sections=len(re.findall(r'^## ', body, re.M)), citations=len(links)))
assert len(manuscripts) == 6
report = dict(checkedAt=datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
 sourceSnapshots=len(sources), manuscripts=manuscripts,
 calculations=dict(childcareHeld=held, childcareExcludingExtension=remaining, childcareAgeOneTwoPercent=ratio, expoTotalThousands=total, expoGeneralThousands=general, expoOtherThousands=other, heatThousands=number(heat[1])),
 sourceDiscrepancy='D1 PDF52 body: 123 construction schools; embedded table: 80 schools (47%). Relationship unconfirmed; article explicitly preserves the discrepancy.',
 humanValidation='not performed', independentReview='not performed')
(HERE / 'checks.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(f'Checked {len(sources)} fixed primary sources, {len(manuscripts)} manuscripts, source-derived arithmetic. D1 discrepancy remains explicit.')
