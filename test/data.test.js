'use strict';
const assert = require('assert');
const { render, get, refreshArea, escapeHtml, textToHtml } = require('../electron/data');

assert.strictEqual(render('{{a.b}}', { a: { b: 'x' } }), 'x');
assert.strictEqual(render('{{list[1]}}', { list: ['a', 'b'] }), 'b');
assert.strictEqual(get({ a: [10, 20] }, 'a[1]'), 20);

(async () => {
  const htmlArea = await refreshArea({
    name: 'h', type: 'html', html: '<div>ok</div>',
  });
  assert.strictEqual(htmlArea.html, '<div>ok</div>');
  assert.strictEqual(htmlArea.error, null);

  const scriptHtml = await refreshArea({
    name: 's', type: 'script', command: "echo '<b>hi</b>'",
  });
  assert.strictEqual(scriptHtml.html, '<b>hi</b>');

  const scriptText = await refreshArea({
    name: 't', type: 'script', command: 'echo hello',
  });
  assert.ok(scriptText.html.includes('hello'), scriptText.html);

  const scriptTmpl = await refreshArea({
    name: 't2', type: 'script', command: "echo world", template: '<i>{{stdout}}</i>',
  });
  assert.strictEqual(scriptTmpl.html, '<i>world</i>');

  const err = await refreshArea({ name: 'e', type: 'script', command: 'false' });
  assert.ok(err.error);

  assert.strictEqual(escapeHtml('<a>'), '&lt;a&gt;');
  assert.ok(textToHtml('x', { color: '#fff' }).includes('color:#fff'));
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
