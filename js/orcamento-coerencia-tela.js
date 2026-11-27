/* A PERGUNTA DE COERÊNCIA NA CONVERSA (Mapa vivo v2, FASE 4, parte 2; cofre: 01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md, "FASE 4").
   Quando o estado do servidor traz coerencia (o ramo que ela tocou não bate com o que ela escreveu: api/_vendas/coerencia.mjs, só com o mapa
   vivo ligado, reacao: true), o Zero faz UMA pergunta com palpite pronto e dois botões, dentro da conversa, com as mesmas falas e botões dos
   toques (js/orcamento-toques.js, BZToques.kit):
     "Pelo que você contou, o seu negócio parece ser de Alimentação, e não de Saúde. Quer que eu ajuste?"  [Sim, ajuste]  [Não, está certo]
   "Sim" troca só o ramo pelo caminho do "Mudar as respostas" (BZToques.trocarRamo: o servidor confere, grava e conta). "Não" fecha. Nunca trava
   o envio nem o pagamento. Uma vez por conversa, lembrado no aparelho (sessionStorage; sem armazenamento, uma vez por página aberta).
   Segurança (revisão do #289): o palpite do servidor só vale se estiver na tabela de js/orcamento-coerencia.js; a fala sai dos NOMES da tabela,
   por textContent (o kit); nenhum texto dela entra aqui. ES5 sintático, como os outros módulos do orçamento. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica(raiz);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZOrcCoerenciaTela = api;
})(typeof window !== 'undefined' ? window : null, function (raiz) {
  'use strict';

  var CHAVE = 'bz-coerencia-';
  var SIM = 'Sim, ajuste', NAO = 'Não, está certo';
  var NAO_DEU = 'Não consegui ajustar agora. Se quiser, toque em "Mudar as respostas".';
  var perguntadas = {};
  var tem = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };
  var ehObjeto = function (v) { return !!v && typeof v === 'object' && !(v instanceof Array); };

  function armazem() { try { return raiz && raiz.sessionStorage ? raiz.sessionStorage : null; } catch (e) { return null; } }
  function jaPerguntou(id) {
    if (perguntadas[id]) return true;
    var a = armazem();
    try { return !!(a && a.getItem(CHAVE + id)); } catch (e) { return false; }
  }
  function marcar(id) {
    perguntadas[id] = true;
    var a = armazem();
    try { if (a) a.setItem(CHAVE + id, '1'); } catch (e) { /* (sem armazenamento: vale a memória da página) */ }
  }
  /* o nome de um código da tabela, ou null: nada vindo do servidor vira texto sem passar por aqui */
  function nomeDaTabela(C, valor) {
    var k;
    for (k in C.NOMES) if (tem(C.NOMES, k) && C.NOMES[k] === valor) return valor;
    return null;
  }
  /* a linha só quebra entre os blocos de sentido (dono: quebra de linha pelo sentido, conferida em 390 e 320): "de Alimentação", "e não de Saúde"
     e "Quer que eu ajuste?" ficam inteiros, presos por espaço que não quebra */
  var juntar = function (t) { return t.replace(/ /g, ' '); };
  function pergunta(nome, tocado) {
    return 'Pelo que você contou, o seu negócio parece ser ' + juntar('de ' + nome) + (tocado && tocado !== nome ? ', ' + juntar('e não de ' + tocado) : '') +
      '. ' + juntar('Quer que eu ajuste?');
  }

  /* o estado chegou (js/orcamento.js, a cada render). Pergunta no máximo uma vez por conversa; sem tudo certo, não faz nada */
  function atualizar(E) {
    var w = raiz || {}, T = w.BZToques, C = w.BZOrcCoerencia;
    if (!ehObjeto(E) || E.reacao !== true || !ehObjeto(E.coerencia) || !T || !T.kit || !C || !C.NOMES) return false;
    if (typeof T.comConsultor === 'function' && !T.comConsultor()) return false;
    var c = E.coerencia, id = ehObjeto(E.conversa) && typeof E.conversa.id === 'string' ? E.conversa.id : null;
    if (!id || !tem(C.NOMES, c.palpite) || c.palpite === 'outro' || jaPerguntou(id)) return false;
    marcar(id);
    var nome = C.NOMES[c.palpite], texto = pergunta(nome, nomeDaTabela(C, c.tocado)), kit = T.kit;
    var f = kit.fala(texto);
    var falaId = f && f.firstChild && f.firstChild.id ? f.firstChild.id : null;
    kit.opcoes(texto, [{ valor: 'sim', rotulo: SIM }, { valor: 'nao', rotulo: NAO }], function (v) {
      if (v === 'sim' && !T.trocarRamo(c.palpite)) kit.fala(NAO_DEU);
      else if (v !== 'sim' && typeof kit.focarSaida === 'function') kit.focarSaida();
    }, falaId ? { falaId: falaId } : {});
    return true;
  }

  return Object.freeze({ atualizar: atualizar, pergunta: pergunta, SIM: SIM, NAO: NAO });
});
