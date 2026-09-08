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
    assert.equal(evidence.version, 'v0.4.1');
    tree.children.splice(0, 1);
    const imagePath = 'assets/jnfs16-figure7-5.png';
    const publishedImagePath = '/images/school-lunch/jnfs16-figure7-5.png';
    const plain = (node) => node.value ?? (node.children ?? []).map(plain).join('');
    const hasImage = (node) => node.type === 'image' || (node.children ?? []).some(hasImage);
    const figureIndex = tree.children.findIndex(hasImage);
    assert.ok(figureIndex >= 0, 'Reviewed figure missing');
    const picture = tree.children[figureIndex];
    const caption = tree.children[figureIndex + 1];
    assert.ok(plain(caption).startsWith('出典：'), 'Reviewed figure caption missing');
    caption.data = { hName: 'figcaption' };
    tree.children.splice(figureIndex, 2, {
      type: 'container',
      data: { hName: 'figure' },
      children: [picture, caption],
    });
    const visit = (node) => {
      if ((node.type === 'image' || node.type === 'link') && node.url === imagePath)
        node.url = publishedImagePath;
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}
