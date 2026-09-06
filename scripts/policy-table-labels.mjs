// Keep each responsive cell associated with its real column heading, without JS.
export default function policyTableLabels() {
  return (tree, file) => {
    if (!file.path?.includes('/docs/content-review/')) return;
    const plain = (node) => node.value ?? (node.children ?? []).map(plain).join('');
    const visit = (node) => {
      if (node.type === 'table') {
        const labels = node.children[0].children.map(plain);
        for (const row of node.children.slice(1)) {
          row.children.forEach((cell, index) => {
            cell.data ??= {};
            cell.data.hProperties = { ...cell.data.hProperties, 'data-label': labels[index] };
          });
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}
