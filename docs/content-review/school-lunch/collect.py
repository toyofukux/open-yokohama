"""Read-only acquisition of public source candidates; never updates published data."""
from pathlib import Path
from urllib.request import urlopen
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
import hashlib,json,subprocess
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'artifacts/school-lunch-sources';OUT.mkdir(parents=True,exist_ok=True)
SOURCES=[
('S1','横浜市・学校給食費','https://www.city.yokohama.lg.jp/kosodate-kyoiku/kyoiku/sesaku/kyusyoku/kyushokuhi.html'),
('S2','文部科学省・学校給食費の抜本的な負担軽減','https://www.mext.go.jp/a_menu/sports/syokuiku/kyu-lighten.html'),
('S3','横浜市・令和8年度就学援助のお知らせ','https://www.city.yokohama.lg.jp/kosodate-kyoiku/kyoiku/soudan/shugakuenjo/shugakuenjo.files/0119_20260403.pdf'),
('S4','横浜市・令和8年度学校給食物資購入費事業計画書','https://www.city.yokohama.lg.jp/city-info/yokohamashi/org/kyoiku/jigyoukeikaku/r8jigyoukeikaku.files/0232_20260126.pdf'),
('S5','横浜市会・2026年6月8日特別委員会資料','https://www.city.yokohama.lg.jp/shikai/kiroku/katsudo/r8/TokubetuDaiR08.files/T-toku-20260608-ss-2.pdf'),
('S6','横浜市・市民の声38000081','https://cgi.city.yokohama.lg.jp/shimin/kouchou/search/data/38000081.html'),
('S7','横浜市会・2026年5月18日教育委員会資料','https://www.city.yokohama.lg.jp/shikai/kiroku/katsudo/r8/JohninKK-R08.files/J-Ko-20260518-ky-1.pdf'),
('S8','横浜市・就学援助制度','https://www.city.yokohama.lg.jp/kosodate-kyoiku/kyoiku/soudan/shugakuenjo/shugakuenjo.html'),
('C1','候補・小児医療費助成','https://www.city.yokohama.lg.jp/kenko-iryo-fukushi/kenko-iryo/iryohijosei/shoni/'),
('C2','候補・地域公共交通計画','https://www.city.yokohama.lg.jp/kurashi/machizukuri-kankyo/kotsu/toshikotsu/plan/chiki-kotsu-plan.html'),
]
def acquire(item):
 sid,title,url=item
 with urlopen(url,timeout=30) as r:
  b=r.read(20000001);contenttype=r.headers.get('Content-Type');finalurl=r.url
 if len(b)>20000000:raise ValueError('Source exceeds limit')
 digest=hashlib.sha256(b).hexdigest();suffix='.pdf' if b.startswith(b'%PDF') else '.html'
 p=OUT/(digest+suffix)
 if p.exists():assert p.read_bytes()==b
 else:p.write_bytes(b)
 if suffix=='.pdf':subprocess.run(['pdftotext','-layout',str(p),str(OUT/(sid+'.txt'))],check=True)
 return {'id':sid,'title':title,'url':url,'resolvedUrl':finalurl,'retrievedAt':datetime.now(timezone.utc).isoformat(),'sha256':digest,'bytes':len(b),'contentType':contenttype,'localPath':str(p.relative_to(ROOT)),'status':'acquired','redistribution':'raw kept in ignored artifacts; not approved for publication'}
with ThreadPoolExecutor(max_workers=4) as pool:items=list(pool.map(acquire,SOURCES))
(OUT/'inventory.json').write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n')
print(json.dumps([{'id':i['id'],'bytes':i['bytes'],'sha256':i['sha256']} for i in items],ensure_ascii=False))
