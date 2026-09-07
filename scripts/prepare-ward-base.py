"""Normalize MLIT N03 polygons into a reusable, non-georeferenced SVG coordinate base.

Raw archive stays in ignored artifacts. No network access occurs during normal builds.
"""
from pathlib import Path
import hashlib, json, math, re, zipfile

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'artifacts/ward-map-sources/kanagawa-2023/N03-23_14_230101.geojson'
acquisition = json.loads((ROOT / 'artifacts/ward-map-sources/acquisition.json').read_text())
assert hashlib.sha256((ROOT / acquisition['localPath']).read_bytes()).hexdigest() == acquisition['sha256']
with zipfile.ZipFile(ROOT / acquisition['localPath']) as archive:
 assert source.read_bytes() == archive.read(source.name), 'Extracted geometry differs from fixed archive'
features = [f for f in json.loads(source.read_text())['features'] if f['properties']['N03_003'] == '横浜市']
wards = re.findall(r"\['(\d{6})', '([^']+)', '([^']+)'\]", (ROOT / 'packages/core/schema.ts').read_text())
assert len(wards) == 18
points = [p for f in features for ring in f['geometry']['coordinates'] for p in ring]
cosine = math.cos(math.radians(35.45))
xmin, xmax = min(p[0] for p in points)*cosine, max(p[0] for p in points)*cosine
ymin, ymax = min(p[1] for p in points), max(p[1] for p in points)
scale = min(660/(xmax-xmin), 710/(ymax-ymin))
def project(point): return [(point[0]*cosine-xmin)*scale+40, (ymax-point[1])*scale+30]

def simplify(points, tolerance=0.3):
 if len(points) < 3: return points
 a,b = points[0],points[-1]; dx,dy=b[0]-a[0],b[1]-a[1]
 def distance(p):
  t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy))) if dx or dy else 0
  return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)
 index=max(range(1,len(points)-1),key=lambda i:distance(points[i]))
 if distance(points[index]) <= tolerance: return [a,b]
 return simplify(points[:index+1],tolerance)[:-1]+simplify(points[index:],tolerance)

def area(ring): return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ring,ring[1:]))/2
def centroid(ring):
 a=area(ring)
 return [sum((p[k]+q[k])*(p[0]*q[1]-q[0]*p[1]) for p,q in zip(ring,ring[1:]))/(6*a) for k in [0,1]]

result=[]
for code,slug,name in wards:
 fs=[f for f in features if f['properties']['N03_007']==code[:5]]
 assert fs and all(f['geometry']['type']=='Polygon' for f in fs)
 rings=[list(map(project,ring)) for f in fs for ring in f['geometry']['coordinates']]
 label=centroid(max(rings,key=lambda ring:abs(area(ring))))
 # Small inland wards need label offsets to avoid collisions at phone widths.
 offsets={'港南区':(-13,0),'磯子区':(12,4),'保土ケ谷区':(-7,-4),'西区':(5,0)}
 dx,dy=offsets.get(name,(0,0)); label=[label[0]+dx,label[1]+dy]
 paths=[]
 for ring in rings:
  # Rotate to a canonical start before simplification for stable byte output.
  ring=ring[:-1]; first=min(range(len(ring)),key=lambda i:tuple(ring[i]));ring=ring[first:]+ring[:first];ring.append(ring[0])
  path=simplify(ring)
  paths.append('M'+'L'.join(f'{x:.2f},{y:.2f}' for x,y in path)+'Z')
 result.append(dict(code=code,slug=slug,name=name,path=''.join(paths),label=[round(v,2) for v in label]))
out=ROOT/'data/geography';out.mkdir(exist_ok=True)
metadata=dict(id='yokohama-wards-n03-2023-v1',boundaryDate='2023-01-01',width=740,height=770,
 sourceUrl='https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_1.html',archive=acquisition,
 licenseUrl='https://nlftp.mlit.go.jp/ksj/other/agreement.html',
 attribution='国土数値情報（行政区域データ・2023年）（国土交通省）を加工してOpen Yokohama作成',
 processing='Yokohama18 wards; normalized local projection at35.45deg; ring simplification0.3SVG units; SVG illustration coordinates, not surveying data.',wards=result)
(out/'yokohama-wards.json').write_text(json.dumps(metadata,ensure_ascii=False,separators=(',',':'))+'\n')
print(f'Prepared {len(result)} ward geometries; {sum(len(w["path"]) for w in result)} path bytes.')
