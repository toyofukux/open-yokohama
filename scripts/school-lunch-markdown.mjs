import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Only the adopted manuscript is transformed. Its prose, references and limitations
// remain intact; the page supplies the title and the current review status.
export default function schoolLunchMarkdown() {
  return (tree, file) => {
    if (!file.path?.endsWith('/docs/content-review/school-lunch/DRAFT.md')) return;
    const evidence = JSON.parse(
      readFileSync(new URL('../docs/content-review/school-lunch/evidence.json', import.meta.url)),
    );
    const source = readFileSync(file.path);
    assert.equal(
      createHash('sha256').update(source).digest('hex'),
      evidence.manuscript.sha256,
      'School-lunch manuscript changed: review the new content version first.',
    );
    assert.equal(tree.children[0]?.type, 'heading');
    assert.equal(tree.children[0]?.depth, 1);
    assert.equal(tree.children[1]?.type, 'paragraph');
    assert.ok(tree.children[1]?.children[0]?.value.startsWith('内容レビュー用原稿 v0.1｜'));
    tree.children.splice(0, 2);
  };
}
