import { readFileSync } from 'node:fs';

const figures = {
  '/docs/content-review/mayoral-issues/city-governance.md': {
    'governance-process': '../data/editorial/figures/governance-process.html',
  },
  '/docs/content-review/mayoral-issues/city-budget.md': {
    'fiscal-funding': '../data/editorial/figures/fiscal-funding.html',
  },
  '/docs/content-review/mayoral-issues/green-expo.md': {
    'expo-funding': '../data/editorial/figures/expo-funding.html',
  },
  '/docs/content-review/expansion/city-building-history.md': {
    'city-history': '../data/editorial/figures/city-history.html',
  },
  '/docs/content-review/expansion/housing-access.md': {
    'housing-support': '../data/editorial/figures/housing-support.html',
  },
  '/docs/content-review/expansion/waste-and-carbon.md': {
    'plastic-process': '../data/editorial/figures/plastic-process.html',
  },
  '/docs/content-review/expansion/care-in-community.md': {
    'care-support': '../data/editorial/figures/care-support.html',
  },
  '/docs/content-review/expansion/population-facilities.md': {
    'facility-choices': '../data/editorial/figures/facility-choices.html',
  },
  '/docs/content-review/mayoral-issues/childcare-access.md': {
    'childcare-wards': '../data/childcare/figure.html',
    'childcare-counts': '../data/editorial/figures/childcare-counts.html',
    'childcare-history': '../data/editorial/figures/childcare-history.html',
    'childcare-ages': '../data/editorial/figures/childcare-ages.html',
  },
  '/docs/content-review/mayoral-issues/school-shelters.md': {
    'gym-timeline': '../data/editorial/figures/gym-timeline.html',
    'gym-funding': '../data/editorial/figures/gym-funding.html',
  },
  '/docs/content-review/mayoral-issues/local-mobility.md': {
    'mobility-support': '../data/editorial/figures/mobility-support.html',
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
