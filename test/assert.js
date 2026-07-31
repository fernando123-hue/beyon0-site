/* Micro-harness. Sem dependências, sem runner. Publica em window.__testResults. */
const results = [];

export function check(name, fn) {
  try {
    const r = fn();
    if (r === true) results.push({ name, ok: true });
    else results.push({ name, ok: false, msg: String(r) });
  } catch (e) {
    results.push({ name, ok: false, msg: e && e.message ? e.message : String(e) });
  }
}

export function near(actual, expected, tol) {
  return Math.abs(actual - expected) <= tol
    ? true
    : `esperado ${expected} ±${tol}, veio ${actual}`;
}

export function close() {
  window.__testResults = results;
  const failed = results.filter((r) => !r.ok);
  window.__testSummary = { total: results.length, failed: failed.length };
  const el = document.getElementById('out');
  if (el) {
    el.textContent = results
      .map((r) => (r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.msg ? '  → ' + r.msg : ''))
      .join('\n') + `\n\n${results.length - failed.length}/${results.length} passaram`;
  }
}
