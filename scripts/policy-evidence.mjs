import { readFileSync } from 'node:fs';

const figures = {
  '/docs/content-review/mayoral-issues/childcare-access.md': {
    'childcare-wards': '../data/childcare/figure.html',
  },
  '/docs/content-review/mayoral-issues/school-shelters.md': {
    'gym-timeline': '../data/editorial/figures/gym-timeline.html',
    'gym-funding': '../data/editorial/figures/gym-funding.html',
  },
  '/docs/content-review/foundations/mayor-powers.md': {
    'mayor-roles': '../data/editorial/figures/mayor-roles.html',
  },
};

export default function policyEvidence() {
  return (tree, file) => {
    const entry = Object.entries(figures).find(([suffix]) => file.path?.endsWith(suffix));
    if (!entry) return;
    for (const [id, path] of Object.entries(entry[1])) {
      const markers = tree.children.filter(
        (node) => node.type === 'html' && node.value.trim() === `<!-- evidence:${id} -->`,
      );
      if (markers.length !== 1) throw new Error(`Expected one evidence insertion point: ${id}`);
      markers[0].value = readFileSync(new URL(path, import.meta.url), 'utf8');
    }
  };
}
