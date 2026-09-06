"""Fetch public primary sources into ignored, content-addressed local snapshots."""
from pathlib import Path
from urllib.request import urlopen
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import hashlib, json, subprocess

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'artifacts/mayoral-issues-sources'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'https://www.city.yokohama.lg.jp/'
SOURCES = [
 ('E1', '横浜市長選挙・2026年10月18日', 'city-info/senkyo/data/mayor/20261018_shicho.html'),
 ('E2', '2026年市長選・候補者情報と選挙公報', 'city-info/senkyo/data/mayor/20261018kohosya_koho.html'),
 ('G1', '2026年8月28日市長会見記録', 'mayor/kishakaiken/kaikenyoshi/2026/20260828.html'),
 ('G2', '市長の言動に関する調査報告書・訂正版', 'shikai/kiroku/katsudo/r8/JohninSGS-R08.files/J-So-202608013-gi-2.pdf'),
 ('F1', 'ワンストップ財政情報', 'city-info/zaisei/jokyo/onestopzaisei.html'),
 ('F2', '令和8年度予算案資料', 'city-info/zaisei/jokyo/yosan/r8/r8yosan.files/R8yosan-siryou.pdf'),
 ('X1', '令和8年度GREEN×EXPO推進局事業計画書', 'city-info/yokohamashi/org/green/jigyokeikaku/r8jigyokeikaku.files/r8jigyoukeikakusho222.pdf'),
 ('M1', '敬老特別乗車証のご案内', 'kenko-iryo-fukushi/fukushi-kaigo/koreisha-kaigo/kaigoyobo-kenkoudukuri-ikigai/ikigai-shakaisanka/keirou.html'),
 ('M2', '横浜市みんなのおでかけ交通事業', 'kurashi/machizukuri-kankyo/kotsu/chiikikokyo/huyasu/odekake/aratanaseido.html'),
 ('N1', '令和8年4月1日時点保育所等利用状況・補足資料', 'kosodate-kyoiku/hoiku-yoji/shisetsu/shisetsutaisaku/taiki/taikijidoutaisaku.files/0049_20260512.pdf'),
 ('N2', '待機児童対策資料一覧', 'kosodate-kyoiku/hoiku-yoji/shisetsu/shisetsutaisaku/taiki/taikijidoutaisaku.html'),
 ('N3', '令和8年度こども青少年局事業計画書', 'city-info/yokohamashi/org/kodomo/jigyoukeikaku/r8jigyoukeikaku.files/0002_20260126.pdf'),
 ('D1', '令和8年度教育委員会予算概要', 'city-info/yokohamashi/org/kyoiku/yosan/r8yosangaiyou.files/0009_20260507.pdf'),
]

class PlainText(HTMLParser):
 def __init__(self):
  super().__init__(); self.parts = []; self.skip = 0
 def handle_starttag(self, tag, attrs):
  if tag in ('script', 'style'): self.skip += 1
  if tag in ('p', 'div', 'tr', 'li', 'h1', 'h2', 'h3'): self.parts.append('\n')
 def handle_endtag(self, tag):
  if tag in ('script', 'style'): self.skip -= 1
 def handle_data(self, data):
  if not self.skip: self.parts.append(data.strip() + ' ')

def acquire(item):
 sid, title, path = item; url = BASE + path
 with urlopen(url, timeout=60) as r:
  data = r.read(30000001); resolved = r.url
 if len(data) > 30000000: raise ValueError('Source exceeds limit')
 digest = hashlib.sha256(data).hexdigest()
 suffix = '.pdf' if data.startswith(b'%PDF') else '.html'
 raw = OUT / (digest + suffix)
 if raw.exists(): assert raw.read_bytes() == data
 else: raw.write_bytes(data)
 txt = OUT / (sid + '.txt')
 if suffix == '.pdf': subprocess.run(['pdftotext', '-layout', str(raw), str(txt)], check=True)
 else:
  parser = PlainText(); parser.feed(data.decode('utf-8')); txt.write_text(''.join(parser.parts))
 return dict(id=sid, title=title, url=url, resolvedUrl=resolved, sha256=digest,
  retrievedAt=datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
  localPath=str(raw.relative_to(ROOT)), textPath=str(txt.relative_to(ROOT)),
  redistribution='Raw snapshots remain in ignored artifacts; public page links to original')

if __name__ == '__main__':
 with ThreadPoolExecutor(max_workers=4) as pool: sources = list(pool.map(acquire, SOURCES))
 (ROOT / 'docs/content-review/mayoral-issues/sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n')
 print(f'Acquired {len(sources)} primary source snapshots.')
