import { type DefaultTreeAdapterMap, parse } from 'parse5';
/** Extract the official page's article container, excluding navigation and executable text. */
export function sourceText(html: string) {
  const text: string[] = [];
  let found = 0;
  function visit(node: DefaultTreeAdapterMap['node'], inside = false) {
    if ('tagName' in node && ['script', 'style', 'noscript'].includes(node.tagName)) return;
    if ('attrs' in node && node.attrs.some((a) => a.name === 'id' && a.value === 'tmp_contents')) {
      found++;
      inside = true;
    }
    if (inside && 'value' in node && node.nodeName === '#text' && node.value.trim())
      text.push(node.value.trim());
    if ('childNodes' in node) for (const child of node.childNodes) visit(child, inside);
  }
  visit(parse(html));
  if (found !== 1 || text.length === 0) throw new Error('Unrecognized official article container');
  return text.join('\n');
}
