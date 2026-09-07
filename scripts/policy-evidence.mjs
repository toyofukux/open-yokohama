import { readFileSync } from 'node:fs';

export default function policyEvidence() {
  return (tree, file) => {
    if (!file.path?.endsWith('/docs/content-review/mayoral-issues/childcare-access.md')) return;
    const marker = tree.children.find(
      (node) => node.type === 'html' && node.value.trim() === '<!-- evidence:childcare-wards -->',
    );
    if (!marker) throw new Error('Childcare evidence insertion point is missing');
    marker.value = readFileSync(new URL('../data/childcare/figure.html', import.meta.url), 'utf8');
  };
}
