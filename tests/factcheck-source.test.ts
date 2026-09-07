import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceText } from '../scripts/factcheck-source.ts';

test('source normalization retains article text and excludes navigation and scripts', () => {
  assert.equal(
    sourceText(
      '<nav>wrong</nav><div id="tmp_contents"><h1>A &amp; B</h1><p>原典</p><script>ignore</script></div><footer>wrong</footer>',
    ),
    'A & B\n原典',
  );
  assert.throws(() => sourceText('<div>Changed layout</div>'));
  assert.throws(() => sourceText('<div id="tmp_contents">A</div><div id="tmp_contents">B</div>'));
});
