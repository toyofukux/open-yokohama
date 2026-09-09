# coding: utf-8
"""Verify saved original bytes, citations, reviewed versions and source-derived calculations."""
from pathlib import Path
import hashlib,json,re,subprocess
from collect import PlainText
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sources=json.loads((HERE/'sources.json').read_text());by_id={s['id']:s for s in sources};assert len(by_id)==len(sources)
texts={}
for s in sources:
 assert sha(ROOT/s['localPath'])==s['sha256'],s['id']
 assert sha(ROOT/s['textPath'])==s['textSha256'],('text snapshot',s['id'])
 texts[s['id']]=(ROOT/s['textPath']).read_text()
reviews=json.loads((HERE/'reviews.json').read_text());reviewed={(f['path'],f['sha256']) for r in reviews for f in r['files']}
rows=[]
for md in sorted(HERE.rglob('*.md')):
 body=md.read_text()
 if not body.startswith('---\n'):continue
 ids=re.search(r'sourceIds: \[([^]]+)\]',body)[1].split(', ')
 assert all(i in by_id for i in ids),md
 urls={by_id[i]['url'] for i in ids}
 for url in re.findall(r'\]\((https://[^)]+)\)',body):assert url.split('#')[0] in urls,(md,url)
 definitions=re.findall(r'^\[\^([^]]+)\]:',body,re.M)
 references=re.findall(r'\[\^([^]]+)\](?!:)',body)
 assert set(definitions)==set(references) and len(definitions)==len(set(definitions)),md
 rel=str(md.relative_to(ROOT));digest=sha(md)
 assert (rel,digest) in reviewed,('Not independently reviewed at this version',rel,digest)
 rows.append(dict(path=rel,sha256=digest,publication='prepared_not_published' if md.parent.name=='prepared' else 'eligible_pending_implementation_checks'))
assert len(rows)==17 and sum('/prepared/' not in r['path'] for r in rows)==15
# Re-extract the same annual gym budget scope used by the foundation articles.
gym=subprocess.check_output(['pdftotext','-f','22','-l','22','-layout',str(ROOT/by_id['D3']['localPath']),'-']).decode()
assert re.sub(r'\s+','',gym)==re.sub(r'\s+','',texts['D3'].split('\f')[21])
match=re.search(r'令和8年度\s+([\d,]+)\s+([\d,]+)\s+0\s+0\s+([\d,]+)\s+([\d,]+)',gym);assert match
values=[int(x.replace(',','')) for x in match.groups()];assert values==[4915700,2127000,2774000,14700] and sum(values[1:])==values[0]
assert re.search(r'目標\s+24\s+20\s+22\s+123',gym)
# Waste quantities are material outputs, not inferred carbon savings.
parser=PlainText();parser.feed((ROOT/by_id['W2']['localPath']).read_text())
waste='\n'.join(parser.parts);assert waste==texts['W2']
annual=re.search(r'(?m)^R7\n([\s\S]*?)^R6$',waste)[1]
material=int(re.search(r'【材料リサイクル】\s*([\d,]+)t',annual)[1].replace(',',''))
gas=int(re.search(r'【ガス化】\s*([\d,]+)t',annual)[1].replace(',',''))
assert (material,gas)==(18652,32070) and material+gas==50722
assert '56.8' in texts['C3'] or '56．8' in texts['C3']
assert texts['E2'].count('今後掲載予定')>=2
for needle in ['10月18日','10月４日','10月14日','郵便等投票証明書']:assert needle in texts['V1']
manifest=json.loads((ROOT/'data/editorial/figures/expansion-manifest.json').read_text())
for fig in manifest['figures']:
 assert sha(ROOT/fig['path'])==fig['sha256']
 assert (fig['path'],fig['sha256']) in reviewed
third=json.loads((ROOT/'data/editorial/figures/third-manifest.json').read_text())
assert third['expoThousands']['general']+third['expoThousands']['other']==third['expoThousands']['total']==8697215
fiscal=subprocess.check_output(['pdftotext','-f','34','-l','34','-layout',str(ROOT/by_id['F2']['localPath']),'-']).decode()
assert re.sub(r'\s+','',fiscal)==re.sub(r'\s+','',texts['F2'].split('\f')[33])
labels=['市税・県税交付金・地方交付税等の見込み直し','「創造・転換」等による財源創出の取組','財政調整基金を活用した','保有土地売却益の活用','下水道事業会計留保資金の活用','７年度市人事委員会勧告']
fiscal_values=[]
for label in labels:
 line=next(line for line in fiscal.split('主な項目',1)[1].splitlines() if label in line)
 match=re.search(r'([▲△]?)([\d,]+)億円\s*$',line);assert match
 fiscal_values.append(int(match[2].replace(',',''))*(-1 if match[1] else 1))
assert fiscal_values==[370,212,200,40,40,-450] and sum(fiscal_values)==412
report=dict(checkedAt=datetime.now(timezone.utc).isoformat(),sourceSnapshots=len(sources),manuscripts=rows,figures=len(manifest['figures']),calculations=dict(gymThousands=values,wasteResourceTonnes=material+gas,fiscalMainItemsOku=sum(fiscal_values)),independentReview='manuscript and figure hashes checked against separate reviewer records',humanUnderstanding='not performed',remaining=['Q02 matched net additional city cost unavailable; A2 PDF1 vs PDF18 prior-year funding inconsistency','Q19 candidate information and manifesto not yet published'])
(HERE/'checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('Verified',len(sources),'source snapshots,',len(rows),'manuscripts and',len(manifest['figures']),'reviewed figures.')
