"""Verify fixed law revision metadata, cited main-provision articles and manuscript links."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, re
ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
sources = json.loads((HERE / 'sources.json').read_text())
def walk(n):
 if isinstance(n, dict):
  yield n
  for child in n.get('children', []): yield from walk(child)
def flat(n): return n if isinstance(n, str) else ''.join(flat(c) for c in n.get('children', []))
phrases = {'Q03-L2': {'96': ['予算を定めること'], '112': ['但し、予算については、この限りでない'], '149': ['予算を調製し、及びこれを執行すること'], '211': ['議会の議決を経なければならない'], '218': ['補正予算']}, 'Q03-L3': {'4': ['議会の同意を得て'], '21': ['学校給食に関すること'], '22': ['予算を執行すること'], '29': ['教育委員会の意見をきかなければならない']}, 'Q03-L4': {'4': ['国土交通大臣の許可'], '15': ['認可', '届け出'], '15_3': ['運行計画', '届け出']}}
for source in sources:
 raw = (ROOT / source['localPath']).read_bytes()
 assert hashlib.sha256(raw).hexdigest() == source['sha256'], source['id']
 if 'textSha256' in source: assert hashlib.sha256((ROOT / source['textPath']).read_bytes()).hexdigest() == source['textSha256']
 if source['id'] not in phrases: continue
 data = json.loads(raw)
 assert data['revision_info'] == source['revisionInfo']
 assert source['asOf'] == '2026-09-09'
 assert data['revision_info']['amendment_enforcement_date'] <= source['asOf']
 assert data['revision_info']['current_revision_status'] == 'CurrentEnforced'
 main = next(n for n in walk(data['law_full_text']) if n.get('tag') == 'MainProvision')
 articles = {n['attr']['Num']: flat(n) for n in walk(main) if n.get('tag') == 'Article'}
 for number, expected in phrases[source['id']].items():
  for phrase in expected: assert phrase in articles[number], (source['id'], number, phrase)
manuscript = (HERE / 'mayor-powers.md').read_text()
known = {s['url'] for s in sources}
for url in re.findall(r'\]\((https://[^)]+)\)', manuscript): assert url.split('#')[0] in known
refs = re.findall(r'\[\^([^\]]+)\](?!:)', manuscript)
definitions = re.findall(r'^\[\^([^\]]+)\]:', manuscript, re.M)
assert set(refs) == set(definitions) and len(definitions) == len(set(definitions))
report = {'checkedAt':datetime.now(timezone.utc).isoformat(), 'sourceSnapshots':len(sources), 'manuscriptSha256':hashlib.sha256(manuscript.encode()).hexdigest(), 'checkedLawArticles':phrases, 'scope':'Fixed source bytes, effective revision metadata, cited main-provision passages and footnote links. Author check; not a complete legal audit.', 'humanValidation':'not performed'}
(HERE / 'checks.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print('Verified six source snapshots, three effective law versions, cited articles and footnotes.')
