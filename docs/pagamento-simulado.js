/* Página de desenvolvimento: faz o papel do gateway (POST /api/pagamentos?acao=simular).
   Só funciona com o gateway simulado; em produção a ação não existe (404). */
(function () {
  const ref = new URLSearchParams(location.search).get('ref') || '';
  const saida = document.getElementById('resultado');
  document.getElementById('ref').textContent = ref || '(sem referência)';
  document.querySelectorAll('[data-status]').forEach(botao => {
    botao.addEventListener('click', async () => {
      if (!ref) { saida.textContent = 'Abra esta página pelo link de pagamento.'; return; }
      saida.textContent = 'Enviando o aviso…';
      try {
        const r = await fetch('/api/pagamentos?acao=simular', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref, status: botao.dataset.status }) });
        const corpo = await r.json().catch(() => ({}));
        saida.textContent = r.ok ? (corpo.duplicado || corpo.sem_mudanca ? 'Essa cobrança já estava nesse estado; nada mudou.' : 'Aviso aceito. Volte ao orçamento.') : 'Recusado (' + r.status + '): ' + (corpo.erro || 'erro');
      } catch { saida.textContent = 'Sem conexão com o servidor local.'; }
    });
  });
})();
