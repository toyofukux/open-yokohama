"""Save official primary sources locally; public output contains metadata, not original files."""
from pathlib import Path
from html.parser import HTMLParser
from datetime import datetime, timezone
import json, hashlib, subprocess, concurrent.futures, sys
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
class PlainText(HTMLParser):
 def __init__(self):super().__init__();self.parts=[];self.skip=0
 def handle_starttag(self,tag,attrs):
  if tag in ['script','style']:self.skip+=1
 def handle_endtag(self,tag):
  if tag in ['script','style']:self.skip=max(0,self.skip-1)
 def handle_data(self,text):
  if not self.skip and text.strip():self.parts.append(text.strip())
def collect(item):
 ident,title,url=item
 assert url.startswith('https://')
 raw=subprocess.check_output(['curl','-fsSL','--max-time','45',url]);sha=hashlib.sha256(raw).hexdigest()
 ext='.pdf' if raw.startswith(b'%PDF') else '.txt' if '.txt' in url else '.html'
 folder=ROOT/'artifacts/editorial-completion/sources';folder.mkdir(parents=True,exist_ok=True)
 file=folder/(sha+ext);file.write_bytes(raw);text=folder/(ident+'.txt')
 if ext=='.pdf':subprocess.run(['pdftotext','-layout',str(file),str(text)],check=True)
 else:
  try:decoded=raw.decode('utf-8-sig')
  except UnicodeDecodeError:decoded=raw.decode('cp932')
  if ext=='.html':parser=PlainText();parser.feed(decoded);decoded='\n'.join(parser.parts)
  text.write_text(decoded)
 return dict(id=ident,title=title,url=url,resolvedUrl=url,sha256=sha,retrievedAt=datetime.now(timezone.utc).isoformat(),localPath=str(file.relative_to(ROOT)),textPath=str(text.relative_to(ROOT)),textSha256=hashlib.sha256(text.read_bytes()).hexdigest(),redistribution='Original snapshot stays in ignored artifacts; official link and paraphrase only')
if __name__=='__main__':
 items=json.loads(Path(sys.argv[1]).read_text());path=HERE/'sources.json';sources=json.loads(path.read_text()) if path.exists() else []
 rows=list(concurrent.futures.ThreadPoolExecutor(4).map(collect,items))
 for row in rows:sources=[s for s in sources if s['id']!=row['id']];sources.append(row)
 path.write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n');print('Saved',len(rows),'sources; total',len(sources))
