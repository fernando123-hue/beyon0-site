/* A PÁGINA DE ORÇAMENTO DE MENTIRA, para testar o js/orcamento.js REAL (o enviar e o que ele faz quando a rede falha) sem navegador: um `document` permissivo (cada
   elemento guarda o que a página escreve nele), uma API falsa que o teste controla (o "servidor" e a rede) e os outros módulos da página como "pó" (aceitam qualquer chamada).
   Só o que o enviar toca é conferido; o resto da tela não é o assunto aqui.  Usado por docs/testes/planta-reenvio.test.mjs. */
import fs from 'node:fs';
import vm from 'node:vm';
import { redigir, limparMensagem } from '../../api/_vendas/seguranca.mjs';

const FONTE = fs.readFileSync(new URL('../../js/orcamento.js', import.meta.url), 'utf8');

/* um objeto que aceita qualquer chamada e qualquer propriedade (e não finge ser uma promessa) */
function po() {
  const alvo = function () {};
  return new Proxy(alvo, {
    get: (t, k) => (k === 'then' ? undefined : (k === Symbol.toPrimitive ? () => '' : po())),
    apply: () => po(), construct: () => po(), set: () => true
  });
}

function elemento(id) {
  const escutas = {};
  const base = {
    id, value: '', textContent: '', hidden: false, className: '', placeholder: '', isConnected: true, children: [], style: {}, scrollTop: 0, scrollHeight: 0, firstElementChild: null, firstChild: null, attrs: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    addEventListener(t, f) { (escutas[t] = escutas[t] || []).push(f); },
    disparar(t, ev) { (escutas[t] || []).forEach((f) => f(ev || { preventDefault() {}, stopPropagation() {}, target: this })); },
    appendChild(c) { this.children.push(c); this.firstElementChild = this.firstElementChild || c; return c; },
    insertBefore(c, ref) { const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) return this.appendChild(c); this.children.splice(i, 0, c); this.firstElementChild = this.children[0]; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); this.firstElementChild = this.children[0] || null; return c; },
    get lastElementChild() { return this.children[this.children.length - 1] || null; },
    getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; },
    remove() { this.isConnected = false; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, removeAttribute(k) { delete this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; },
    contains: () => false, focus() {}, scrollIntoView() {}, querySelector: () => null, querySelectorAll: () => [], closest: () => null, matches: () => false
  };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : function () {})), set: (t, k, v) => { t[k] = v; return true; } });
}

/* servidor: { mensagens: [{papel, conteudo}], ... }; cair: faz a chamada falhar como a rede (status 0). O teste muda `servidor.rede` e `servidor.entra` a qualquer hora. */
export function criarPagina(inicial = {}) {
  const servidor = { mensagens: (inicial.mensagens || []).map((m) => ({ ...m })), rede: true, redeParaLer: true, entra: true, chamadasMensagem: [], leituras: 0 };
  const falha = (msg) => Object.assign(new Error(msg), { status: 0, dados: {} });
  const estado = () => ({ conversa: { etapa: 'estimativa', briefing: {}, tem_contato: false }, mensagens: servidor.mensagens.map((m) => ({ ...m })), estimativa: inicial.estimativa || null, direcoes: [], proposta: null, pedido: null, painel: null, ajustes: [] });
  const API = {
    temSessao: () => true, perdeuSessao: () => false, codigo: () => 'abc123', codigoPerdido: () => null, esquecer() {}, abrirRecado: () => Promise.resolve(),
    sessaoConfig: () => Promise.resolve({ consultor: true }),
    estado: () => { servidor.leituras++; return servidor.redeParaLer ? Promise.resolve(estado()) : Promise.reject(falha('Sem conexão. Confira a internet e tente de novo.')); },
    /* a mensagem entra no servidor (se `entra`) e a resposta chega ou se perde (se `rede` é falso) */
    mensagem: (texto) => {
      servidor.chamadasMensagem.push(texto);
      if (servidor.erro) return Promise.reject(Object.assign(new Error(servidor.erro.message), { status: servidor.erro.status, dados: {} }));
      /* o servidor GRAVA a fala redigida (api/_vendas/fluxo.mjs: redigir(limparMensagem(texto))): a mesma função, para o teste não inventar o formato */
      if (servidor.entra) servidor.mensagens.push({ papel: 'visitante', conteudo: redigir(limparMensagem(texto) || '') }, { papel: 'agente', conteudo: 'Resposta ao: ' + texto });
      return servidor.rede ? Promise.resolve({ resposta: 'Resposta ao: ' + texto }) : Promise.reject(falha('Sem conexão. Confira a internet e tente de novo.'));
    }
  };
  const els = {};
  /* (o que o HTML faz nascer escondido e o teste quer ver aparecer: inicial.escondidos) */
  (inicial.escondidos || []).forEach((id) => { els[id] = elemento(id); els[id].hidden = true; });
  const doc = {
    getElementById: (id) => els[id] || (els[id] = elemento(id)), querySelectorAll: () => [], querySelector: () => null, createElement: (t) => elemento(t),
    addEventListener() {}, dispatchEvent() { return true; }, documentElement: { classList: { contains: () => false, add() {}, remove() {} } }, activeElement: null
  };
  const capturado = {};
  const win = {
    BZOrcamento: API, BZPrevia: po(), BZVisor: po(), BZPerguntas: po(), BZDetalhes: po(), BZEspera: po(), BZAjustes: po(),
    /* (orçamento como conversa) os toques: aqui, uma conversa que já existe, sem passos fixos nem valor retido */
    BZToques: { iniciar() {}, configurar() {}, pendentes: () => null, entregues() {}, atualizar() {}, comConsultor: () => true, ativo: () => false, reterValor: () => false, liberarValor() {}, semConsultor() {}, reabrir() {}, situacao: () => [] },
    BZOrcPlanta: { atualizar(E, deps) { capturado.deps = deps; } },
    addEventListener() {}, matchMedia: undefined, BEYON: undefined, document: doc
  };
  /* (a página avisa a atividade do Zero ao radar do escopo por um CustomEvent: aqui ninguém escuta) */
  const ctx = { window: win, document: doc, location: { reload() {} }, setTimeout, clearTimeout, console, sessionStorage: undefined, CustomEvent: function (tipo, o) { this.type = tipo; this.detail = o && o.detail; } };
  vm.runInNewContext(FONTE, ctx, { filename: 'js/orcamento.js' });
  const pagina = {
    servidor, els, doc,
    caixa: () => els['o-texto'] || doc.getElementById('o-texto'),
    aviso: () => ({ visivel: !doc.getElementById('o-aviso').hidden, texto: doc.getElementById('o-aviso-texto').textContent, temAcao: !doc.getElementById('o-tentar').hidden }),
    tentarDeNovo: () => doc.getElementById('o-tentar').disparar('click'),
    /* a lista da conversa como a pessoa a vê (as falas desenhadas por msg()) */
    falas: () => doc.getElementById('o-log').children.map((li) => li.children[0] && li.children[0].textContent),
    enviar: (texto) => capturado.deps.enviar(texto),
    pronta: async () => { for (let i = 0; i < 20 && !capturado.deps; i++) await new Promise((r) => setImmediate(r)); return !!capturado.deps; }
  };
  return pagina;
}
