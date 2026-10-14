#!/usr/bin/env python3
"""Re-record editorial content hashes after a shared layout revision.

Article bodies are unchanged; only footer/article-bottom links, the inquiry form
and the ledger schema moved. Idempotent: archives the previous record once and
keeps a single revisionHistory entry for this revision.
"""
import hashlib, json, os, shutil, sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
os.chdir(ROOT)
RECORD = 'docs/content-review/publication.json'
ARCHIVE = 'docs/content-review/inquiries/archive/2026-09-10-inquiry-form/publication.json'
REASON = 'Shared layout/footer/article-bottom links moved to the site inquiry form; article body unchanged'
REVIEWER = 'Claude author 2026-09-10: shared layout/footer/article-bottom link revision for the account-free inquiry form; article output unchanged'
APPROVER = (
    'User approved in this conversation (2026-09-10): account-free inquiry form, no individual replies, '
    'footer GitHub icon and article-bottom links; article claims unchanged; deployment not yet instructed'
)
SCOPE = 'Footer and article-bottom links only; no manuscript, figure or table changes'
REVIEW = sys.argv[1] if len(sys.argv) > 1 else 'pending: independent review not yet recorded'

if not os.path.exists(ARCHIVE):
    shutil.copyfile(RECORD, ARCHIVE)
data = json.load(open(RECORD))
archived = {r['route']: r for r in json.load(open(ARCHIVE))['articles']}
now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
changed = 0
for record in data['articles']:
    before = archived[record['route']]['review']
    digest = hashlib.sha256()
    for path in record['contentFiles']:
        digest.update(path.encode()); digest.update(b'\0'); digest.update(open(path, 'rb').read()); digest.update(b'\0')
    actual = digest.hexdigest()
    previous = record['article']['contentHash']
    history = record.setdefault('revisionHistory', [])
    if not any(h.get('archivePath') == ARCHIVE for h in history):
        history.append({'contentHash': previous, 'archivePath': ARCHIVE, 'reason': REASON})
    if previous != actual:
        changed += 1
    record['article']['contentHash'] = actual
    record['review']['contentHash'] = actual
    # Carry the archived reviewer and approval statements forward instead of overwriting them.
    record['review']['reviewer'] = f"{REVIEWER}; carried forward: {before['reviewer']}"
    record['review']['reviewedAt'] = now
    if before.get('humanApproval'):
        record['review']['humanApproval'] = {
            'approver': f"{APPROVER}; previous approval ({before['humanApproval']['approvedAt']}): {before['humanApproval']['approver']}",
            'contentHash': actual,
            'approvedAt': now,
        }
    record['revisionReview'] = {
        'scope': SCOPE,
        'recordedAt': now,
        'independentReview': REVIEW,
        'humanUnderstandingValidation': 'not performed',
    }
json.dump(data, open(RECORD, 'w'), ensure_ascii=False, indent=2)
open(RECORD, 'a').write('\n')
print(f'rehashed {len(data["articles"])} records ({changed} hashes changed); archive {ARCHIVE}')
