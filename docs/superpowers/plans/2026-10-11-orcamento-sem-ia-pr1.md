# Orçamento sem IA — PR 1 (núcleo) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a pessoa responde 4 perguntas, vê o pacote recomendado com o preço calculado pelo servidor, ajusta os extras com o preço mudando na hora e grava o pacote para seguir ao contato — tudo sem IA.

**Architecture:** um contrato interno `classificador` (adaptador `regras` ativo, adaptador `jev` desligado) faz a recomendação; `api/_vendas/catalogo.mjs` monta o catálogo público da tabela ativa; três ações novas em `/api/vendas` (`catalogo`, `simular`, `confirmar-pacote`) reaproveitam o motor `estimar` e o `vendas_registrar_estimativa`; uma migration pequena grava as respostas no briefing sem turno de conversa. Na tela, um módulo novo `js/orcamento-perguntas.js` desenha as perguntas, o preço e o "Quer ajustar?"; a conversa com o consultor só aparece quando há IA.

**Tech Stack:** Node 24 (ESM `.mjs`, `node --test`), Postgres via PGlite nos testes, HTML/CSS/JS puro (IIFE, `window.BZ*`), Playwright no E2E.

**Spec:** `docs/specs/2026-10-11-orcamento-sem-ia.md` (revisão 2), seções 1, 2, 3 ("Quer ajustar?"), 7 e 8 e "Entrega" item 1.

## Global Constraints

- Branch: `orcamento-sem-ia`. Nunca mudar de branch durante o trabalho; revisores usam só `git show`/`git diff`.
- Arquivos do site são CRLF: depois de criar ou editar, normalizar (`node C:/Users/Irineu/AppData/Local/Temp/claude/C--Vault---Fernando-Beyon-Zero/8c6dcd5e-1bcc-4c97-a28a-486ff40d5334/scratchpad/crlf.mjs <arquivos>`); nunca escrever regex com `\b`, `\d` etc. por heredoc ou `node -e` (o Git Bash come as barras) — usar a ferramenta Write/Edit.
- CSP sem inline: nenhum `style=""` nem `<style>` no HTML; só classes. Todo texto que vem de fora entra por `textContent`.
- O preço NUNCA vem do navegador: o corpo traz escolhas; o servidor monta os fatores e calcula pela tabela ATIVA. `complexidade` nunca vem do corpo.
- Nenhum texto novo usa "sob medida", "consultor de IA" (enquanto não houver IA), "briefing", "direção" (na tela é "modelo"), "escopo" (na tela é "resumo do que será feito").
- Zero invenção de dado: nada de "mais escolhido", depoimento ou número não medido.
- Celular primeiro (390 px, depois 320 px, depois desktop). Texto que importa ≥ 16 px.
- Nível de risco 3 (`api/`, `supabase/`, `js/orcamento*`): PR com teste visto vermelho, revisão técnica e de segurança por agentes diferentes (`docs/PROCESSO.md`).
- Não promover este PR sozinho: os freios do banco e a confirmação pelo WhatsApp vêm no PR 2 (spec §0).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `api/_classificador/contrato.mjs` (novo) | versão do contrato, tarefas, forma do resultado |
| `api/_classificador/regras.mjs` (novo) | adaptador grátis: `recomendar_pacote` por tabela explícita |
| `api/_classificador/jev.mjs` (novo) | adaptador do JEV DESLIGADO (sem rede) |
| `api/_classificador/index.mjs` (novo) | `classificar()`: escolhe o adaptador pela configuração, tempo-limite e recuo para as regras |
| `api/_vendas/catalogo.mjs` (novo) | catálogo público (formatos com "a partir de" e `inclui`; extras com frase, valor, `requer`) e o mapa respostas → briefing |
| `api/_vendas/fluxo.mjs` (modificar) | ações `catalogo`, `simular`, `confirmarPacote` |
| `api/vendas.mjs` (modificar) | rotas novas; `sessao-config` diz se há consultor |
| `api/_ia/config.mjs` (modificar) | `modoDirecoes`: `manual` sem chave da Anthropic |
| `supabase/migrations/20261012120000_respostas_formulario.sql` (novo) | `app.vendas_registrar_respostas` |
| `js/orcamento-api.js` (modificar) | `catalogo`, `simular`, `confirmarPacote`, `sessaoConfig` |
| `js/orcamento-perguntas.js` (novo) | perguntas, tela do preço, "Quer ajustar?" |
| `orcamento.html`, `css/orcamento.css` (modificar) | marcação e estilo das telas novas; conversa escondida sem IA |
| `js/orcamento.js` (modificar) | conversa só com IA; etapas novas |
| `index.html`, `sites.html`, `privacidade.html` (modificar) | textos sem "consultor de IA" |
| `docs/testes/classificador.test.mjs`, `docs/testes/catalogo.test.mjs`, `docs/testes/formulario-api.test.mjs` (novos) | testes |
| `package.json` (modificar) | os testes novos no `testar` |
| `docs/e2e-orcamento.mjs` (modificar) | o caminho começa pelas perguntas |

---

### Task 1: Classificador — contrato, adaptador de regras e o JEV desligado

**Files:**
- Create: `api/_classificador/contrato.mjs`, `api/_classificador/regras.mjs`, `api/_classificador/jev.mjs`, `api/_classificador/index.mjs`
- Test: `docs/testes/classificador.test.mjs`
- Modify: `package.json` (script `testar`: acrescentar `docs/testes/classificador.test.mjs`)

**Interfaces:**
- Produces:
  - `RAMOS`, `OBJETIVOS`, `SITE_ATUAL`, `MATERIAL` (arrays de chaves) e `VERSAO_CONTRATO` = 1, de `contrato.mjs`
  - `validarRespostas(r) → { erros } | { dados: { ramo, outro, cidade, objetivos, site_atual, material, assumido: string[] } }`
  - `async classificar('recomendar_pacote', { respostas, formatos }) → { versao: 1, tarefa, motor: 'regras'|'jev', dados: { formato, alternativa, adicionais, sugestoes: [{ chave, qtd }], motivo, assumido } }`, de `index.mjs`; `formatos` = chaves dos formatos da tabela ativa
  - `configClassificador(env) → { jev: boolean, prazoMs: number }`

- [ ] **Step 1: Write the failing test** — `docs/testes/classificador.test.mjs`:

```js
/* O classificador (api/_classificador): a recomendação do pacote por tabela explícita (adaptador "regras") e o lugar
   do JEV, desligado, com recuo para as regras. Spec: docs/specs/2026-10-11-orcamento-sem-ia.md §2 e §8. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificar, configClassificador } from '../../api/_classificador/index.mjs';
import { validarRespostas } from '../../api/_classificador/contrato.mjs';

const TODOS = ['landing_page', 'institucional', 'sob_medida', 'loja_plataforma'];
const rec = async (respostas, formatos = TODOS) => (await classificar('recomendar_pacote', { respostas, formatos }, { cfg: { jev: false, prazoMs: 50 } })).dados;
const base = { ramo: 'saude', cidade: 'Goiânia', site_atual: 'instagram', material: 'tenho' };

test('respostas: lista fechada; "não sei" vira o padrão e fica registrado como assumido', () => {
  assert.ok(validarRespostas({ ...base, objetivos: ['inventado'] }).erros);
  assert.ok(validarRespostas({ ...base, ramo: 'x', objetivos: [] }).erros);
  const v = validarRespostas({ objetivos: [] });
  assert.deepEqual(v.dados.assumido.sort(), ['material', 'objetivos', 'ramo', 'site_atual']);
  assert.equal(validarRespostas({ ...base, outro: 'a'.repeat(200), objetivos: [] }).dados.outro.length, 60, 'texto curto');
  assert.equal(validarRespostas({ ...base, cidade: '<b>Goiânia</b>', objetivos: [] }).dados.cidade, 'bGoiânia/b', 'sem < > nem controles');
});

test('tabela explícita: um objetivo só NÃO leva à landing (a dentista que quer agendamentos)', async () => {
  const r = await rec({ ...base, objetivos: ['agendamentos'] });
  assert.equal(r.formato, 'institucional');
  assert.equal(r.alternativa, 'landing_page');
  assert.deepEqual(r.adicionais, { agendamento: 1 });
  assert.match(r.motivo, /agend/i);
  for (const o of ['pedidos_whatsapp', 'achado_google', 'apresentar'])
    assert.equal((await rec({ ...base, objetivos: [o] })).formato, 'institucional', o);
});

test('tabela explícita: só campanha → landing (institucional ao lado); vender online → loja', async () => {
  const c = await rec({ ...base, objetivos: ['campanha'] });
  assert.equal(c.formato, 'landing_page');
  assert.equal(c.alternativa, 'institucional');
  const v = await rec({ ...base, objetivos: ['vender_online', 'apresentar'] });
  assert.equal(v.formato, 'loja_plataforma');
  assert.equal(v.alternativa, null);
  /* tabela antiga sem a loja: institucional e o pedido de loja vai para "fale comigo" */
  const semLoja = await rec({ ...base, objetivos: ['vender_online'] }, ['landing_page', 'institucional', 'sob_medida']);
  assert.equal(semLoja.formato, 'institucional');
  assert.deepEqual(semLoja.fale_comigo, ['loja']);
});

test('nada de "sob medida" sugerido sozinho; sem textos → sugestão (não incluída) do tamanho do formato', async () => {
  for (const objetivos of [[], ['campanha'], ['agendamentos', 'apresentar'], ['vender_online']])
    assert.notEqual((await rec({ ...base, objetivos })).formato, 'sob_medida');
  const r = await rec({ ...base, material: 'nao', objetivos: ['apresentar'] });
  assert.deepEqual(r.sugestoes, [{ chave: 'textos', qtd: 5 }]);
  assert.equal(r.adicionais.textos, undefined, 'sugestão, não incluída');
});

test('"não sei" em tudo → institucional, com o que foi assumido', async () => {
  const r = await rec({ objetivos: [] });
  assert.equal(r.formato, 'institucional');
  assert.ok(r.assumido.includes('objetivos'));
});

test('o JEV: desligado por padrão; ligado mas indisponível ou lento → recua para as regras, sem quebrar', async () => {
  assert.equal(configClassificador({}).jev, false);
  assert.equal(configClassificador({ BZ_JEV: 'ligado' }).jev, true);
  const entrada = { respostas: { ...base, objetivos: ['agendamentos'] }, formatos: TODOS };
  const ligado = await classificar('recomendar_pacote', entrada, { cfg: { jev: true, prazoMs: 50 } });
  assert.equal(ligado.motor, 'regras', 'o adaptador real não existe: recua');
  const lento = await classificar('recomendar_pacote', entrada, { cfg: { jev: true, prazoMs: 20 },
    adaptadores: { jev: () => new Promise(r => setTimeout(() => r({ disponivel: true, dados: {} }), 200)) } });
  assert.equal(lento.motor, 'regras', 'passou do prazo: recua');
  await assert.rejects(classificar('tarefa_inventada', entrada), /tarefa/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test docs/testes/classificador.test.mjs`
Expected: FAIL — `Cannot find module '…/api/_classificador/index.mjs'`.

- [ ] **Step 3: Write the implementation**

`api/_classificador/contrato.mjs`:

```js
/* ==========================================================================
   O CONTRATO DO CLASSIFICADOR (spec docs/specs/2026-10-11-orcamento-sem-ia.md §8).
   O resto do sistema fala com "um classificador", nunca com um fornecedor:
   hoje o adaptador "regras" (grátis, por tabela explícita); amanhã o JEV
   (api/_classificador/jev.mjs), se tiver documentação, chave e medição.
   Entrada e saída versionadas; o classificador RECOMENDA, quem calcula o
   preço é o motor (api/_vendas/precos.mjs) e quem decide é o código.
   ========================================================================== */
export const VERSAO_CONTRATO = 1;
export const TAREFAS = ['recomendar_pacote'];

export const RAMOS = ['servicos', 'saude', 'beleza', 'alimentacao', 'comercio', 'educacao', 'associacao', 'outro'];
export const OBJETIVOS = ['pedidos_whatsapp', 'achado_google', 'agendamentos', 'vender_online', 'apresentar', 'campanha'];
export const SITE_ATUAL = ['nao', 'instagram', 'tenho_site', 'so_endereco'];
export const MATERIAL = ['tenho', 'parte', 'nao'];

const curto = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '');

/* as respostas do formulário (lista fechada). Resposta ausente = "não sei": vale o padrão e fica em `assumido` */
export function validarRespostas(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { erros: ['respostas: esperado um objeto'] };
  const erros = [], assumido = [];
  const um = (campo, lista, padrao) => {
    if (r[campo] === undefined || r[campo] === null || r[campo] === '') { assumido.push(campo); return padrao; }
    if (!lista.includes(r[campo])) { erros.push(campo + ': fora da lista'); return padrao; }
    return r[campo];
  };
  const ramo = um('ramo', RAMOS, 'servicos');
  const site_atual = um('site_atual', SITE_ATUAL, 'nao');
  const material = um('material', MATERIAL, 'parte');
  const objetivos = Array.isArray(r.objetivos) ? [...new Set(r.objetivos)] : [];
  if (objetivos.some(o => !OBJETIVOS.includes(o))) erros.push('objetivos: fora da lista');
  if (!objetivos.length) assumido.push('objetivos');
  if (erros.length) return { erros };
  return { dados: { ramo, outro: curto(r.outro, 60), cidade: curto(r.cidade, 60), objetivos, site_atual, material, assumido } };
}

export const resultado = (tarefa, motor, dados) => ({ versao: VERSAO_CONTRATO, tarefa, motor, dados });
```

`api/_classificador/regras.mjs`:

```js
/* ==========================================================================
   ADAPTADOR "REGRAS" — grátis, por TABELA EXPLÍCITA (cada caso escrito e
   testado em docs/testes/classificador.test.mjs). Nada de "um objetivo só →
   landing": a dentista que quer agendamentos precisa de várias páginas.
   ========================================================================== */
import { validarRespostas, resultado } from './contrato.mjs';

const PAGINAS = { landing_page: 1, institucional: 5, loja_plataforma: 5, sob_medida: 4 };
const NOME_OBJETIVO = { pedidos_whatsapp: 'receber pedidos pelo WhatsApp', achado_google: 'ser achado no Google', agendamentos: 'agendamentos',
  vender_online: 'vender online', apresentar: 'apresentar a empresa', campanha: 'uma campanha' };
const lista = xs => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1]);

function escolherFormato(objetivos, formatos) {
  if (objetivos.includes('vender_online')) {
    return formatos.includes('loja_plataforma') ? { formato: 'loja_plataforma', alternativa: null, fale_comigo: [] } : { formato: 'institucional', alternativa: null, fale_comigo: ['loja'] };
  }
  if (objetivos.length === 1 && objetivos[0] === 'campanha') return { formato: 'landing_page', alternativa: 'institucional', fale_comigo: [] };
  const cabeLanding = objetivos.length === 1 && objetivos[0] !== 'apresentar';
  return { formato: 'institucional', alternativa: cabeLanding ? 'landing_page' : null, fale_comigo: [] };
}

function motivo(formato, objetivos) {
  if (formato === 'loja_plataforma') return 'Você quer vender online: uma loja numa plataforma pronta, com a cara da sua marca, recebe os pedidos e os pagamentos.';
  if (formato === 'landing_page') return 'Para uma campanha, uma página só, focada no pedido, resolve e custa menos.';
  const destino = objetivos.includes('agendamentos') ? 'marcar o horário' : objetivos.includes('pedidos_whatsapp') ? 'chamar no WhatsApp' : 'entrar em contato';
  const quer = objetivos.length ? 'Você quer ' + lista(objetivos.map(o => NOME_OBJETIVO[o])) + ': u' : 'U';
  return quer + 'm site com várias páginas apresenta o seu negócio e leva o cliente até ' + destino + '.';
}

export function regras(tarefa, { respostas, formatos }) {
  const v = validarRespostas(respostas);
  if (v.erros) return resultado(tarefa, 'regras', { erros: v.erros });
  const r = v.dados;
  const f = escolherFormato(r.objetivos, formatos || []);
  const adicionais = r.objetivos.includes('agendamentos') && f.formato !== 'landing_page' ? { agendamento: 1 } : {};
  const sugestoes = r.material === 'nao' ? [{ chave: 'textos', qtd: PAGINAS[f.formato] }] : [];
  return resultado(tarefa, 'regras', { formato: f.formato, alternativa: f.alternativa, fale_comigo: f.fale_comigo, adicionais, sugestoes, motivo: motivo(f.formato, r.objetivos), assumido: r.assumido, respostas: r });
}
```

`api/_classificador/jev.mjs`:

```js
/* ==========================================================================
   ADAPTADOR DO JEV — DESLIGADO (etapa A da missão do JEV, 2026-10-11).
   Não há documentação pública acessível, chave nem medição (no Sistema SBP a
   API respondeu 403). Por isso NENHUMA chamada de rede aqui: o adaptador diz
   "indisponível" e o classificador recua para as regras. Para conectar (etapa
   C): documentação oficial, chave no ambiente do servidor (nunca no
   navegador), contrato de entrada/saída igual ao das regras, tempo-limite e
   uma medição do JEV contra as regras antes de ligar BZ_JEV=ligado.
   ========================================================================== */
export async function jev() {
  return { disponivel: false, motivo: 'jev não conectado' };
}
```

`api/_classificador/index.mjs`:

```js
/* ==========================================================================
   classificar(tarefa, entrada): o ponto único. Com o JEV desligado (padrão),
   usa as regras. Com BZ_JEV=ligado, tenta o JEV com tempo-limite e, se ele
   falhar, demorar ou disser "indisponível", recua para as regras: o site
   nunca para por causa do classificador.
   ========================================================================== */
import { TAREFAS, resultado } from './contrato.mjs';
import { regras } from './regras.mjs';
import { jev } from './jev.mjs';

export const configClassificador = (env = process.env) => ({ jev: String(env.BZ_JEV || '').trim().toLowerCase() === 'ligado', prazoMs: 1500 });

const comPrazo = (p, ms) => new Promise((ok, falha) => { const t = setTimeout(() => falha(new Error('prazo')), ms); Promise.resolve(p).then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); falha(e); }); });

export async function classificar(tarefa, entrada, { cfg = configClassificador(), adaptadores = {} } = {}) {
  if (!TAREFAS.includes(tarefa)) throw new Error('tarefa desconhecida: ' + tarefa);
  const usar = { regras, jev, ...adaptadores };
  if (cfg.jev) {
    try {
      const r = await comPrazo(usar.jev(tarefa, entrada), cfg.prazoMs);
      if (r && r.disponivel === true && r.dados) return resultado(tarefa, 'jev', r.dados);
    } catch { /* recua para as regras */ }
  }
  return usar.regras(tarefa, entrada);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test docs/testes/classificador.test.mjs`
Expected: PASS (6 testes).

- [ ] **Step 5: Add to the suite, normalize CRLF and commit**

Em `package.json`, no script `testar`, acrescentar ` docs/testes/classificador.test.mjs` antes de ` docs/testes/faq-identico.test.mjs`.

```bash
node C:/Users/Irineu/AppData/Local/Temp/claude/C--Vault---Fernando-Beyon-Zero/8c6dcd5e-1bcc-4c97-a28a-486ff40d5334/scratchpad/crlf.mjs api/_classificador/*.mjs docs/testes/classificador.test.mjs package.json
git add api/_classificador docs/testes/classificador.test.mjs package.json
git commit -m "feat(classificador): recomendação do pacote por tabela explícita, com o lugar do JEV desligado"
```

---

### Task 2: Catálogo público e o mapa respostas → briefing

**Files:**
- Create: `api/_vendas/catalogo.mjs`
- Test: `docs/testes/catalogo.test.mjs`; `package.json` (acrescentar ao `testar`)

**Interfaces:**
- Consumes: `regras` (tabela ativa no formato de `docs/fase2/regras-rascunho-v1.json`); `limparAtualizacao` de `api/_vendas/briefing.mjs`; o resultado de `classificar` (Task 1).
- Produces:
  - `catalogoPublico(regras, { formato, ramo }) → { formatos: [{ chave, nome, a_partir_de, paginas_incluidas, inclui }], extras: { principais: [Extra], mais: [Extra] }, urgencia: { acrescimo_percentual, prazo_fator } }` com `Extra = { chave, nome, frase, valor, max, requer: string[]|null, fale_comigo: boolean }`
  - `respostasParaBriefing(dadosRespostas, formato) → objeto aceito por limparAtualizacao`

- [ ] **Step 1: Write the failing test** — `docs/testes/catalogo.test.mjs`:

```js
/* O catálogo público (api/_vendas/catalogo.mjs): só o que a tela mostra, nada interno; extras por ramo e formato. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { catalogoPublico, respostasParaBriefing } from '../../api/_vendas/catalogo.mjs';
import { limparAtualizacao } from '../../api/_vendas/briefing.mjs';

const REGRAS = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));

test('nada interno sai: prioridade, prazo por item, piso, limites, descontos', () => {
  const c = catalogoPublico(REGRAS, { formato: 'institucional', ramo: 'saude' });
  const texto = JSON.stringify(c);
  for (const proibido of ['prioridade', 'prazo_dias', 'piso', 'valor_max', 'descontos', 'limites']) assert.ok(!texto.includes(proibido), proibido);
  assert.ok(c.formatos.find(f => f.chave === 'institucional').inclui.length > 0, 'o que já vem no pacote');
});

test('extras: os do ramo nos principais; os da loja só com a loja; dependentes com requer; fora do automático = fale comigo', () => {
  const saude = catalogoPublico(REGRAS, { formato: 'institucional', ramo: 'saude' });
  const chaves = l => l.map(e => e.chave);
  assert.ok(chaves(saude.extras.principais).includes('agendamento'));
  assert.ok(!chaves(saude.extras.principais).includes('catalogo'));
  assert.ok(chaves(saude.extras.mais).includes('area_restrita'));
  assert.ok(!chaves([...saude.extras.principais, ...saude.extras.mais]).includes('marketplace'), 'extra da loja fora da loja');
  assert.ok(chaves(catalogoPublico(REGRAS, { formato: 'loja_plataforma', ramo: 'comercio' }).extras.principais).includes('marketplace'));
  assert.deepEqual(saude.extras.mais.find(e => e.chave === 'area_documentos').requer, ['area_restrita']);
  const fora = saude.extras.mais.find(e => e.chave === 'sistema_sob_medida');
  assert.equal(fora.fale_comigo, true);
  assert.equal(fora.valor, null);
  for (const e of [...saude.extras.principais, ...saude.extras.mais]) assert.ok(e.frase && !/sob medida/i.test(e.frase), e.chave);
});

test('urgência pública: acréscimo e prazo, sem o nome interno', () => {
  assert.deepEqual(catalogoPublico(REGRAS, { formato: 'institucional', ramo: 'saude' }).urgencia, { acrescimo_percentual: 30, prazo_fator: 0.6 });
});

test('respostas → briefing que o limparAtualizacao aceita inteiro', () => {
  const b = respostasParaBriefing({ ramo: 'saude', outro: '', cidade: 'Goiânia', objetivos: ['agendamentos', 'achado_google'], site_atual: 'instagram', material: 'nao', assumido: [] }, 'institucional');
  assert.deepEqual(limparAtualizacao(b), b);
  assert.deepEqual(b.objetivos, ['agendamentos', 'outro']);
  assert.equal(b.objetivo_detalhe, 'ser achado no Google');
  assert.equal(b.negocio.cidade, 'Goiânia');
  assert.equal(b.conteudo.textos, 'nao');
  assert.equal(b.projeto.formato, 'institucional');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test docs/testes/catalogo.test.mjs`
Expected: FAIL — `Cannot find module '…/api/_vendas/catalogo.mjs'`.

- [ ] **Step 3: Write the implementation** — `api/_vendas/catalogo.mjs`:

```js
/* ==========================================================================
   O CATÁLOGO PÚBLICO da tabela ATIVA (spec §3 e §7): o que a tela mostra no
   "Quer ajustar?" e nos formatos vizinhos. Nada interno sai (prioridade,
   prazo por item, piso, limites, descontos). As frases são texto de tela,
   revisado no PR 4 (linguagem); sem "sob medida".
   ========================================================================== */
const FRASES = {
  pagina_extra: 'Mais uma página além das que vêm no pacote.',
  textos: 'Eu escrevo os textos de cada página a partir do que você me contar.',
  imagens: 'Eu escolho as fotos e imagens que combinam com o seu negócio.',
  formulario_avancado: 'Formulário em etapas ou com envio de arquivos.',
  agendamento: 'O cliente escolhe o dia e o horário pelo site.',
  blog: 'Uma área para publicar notícias e artigos.',
  catalogo: 'Os seus produtos com foto, descrição e preço, sem venda online.',
  integracao: 'Os pedidos do site caem direto na sua planilha ou no seu sistema.',
  idioma: 'O site também em outro idioma.',
  produtos_lote_25: 'Eu cadastro mais 25 produtos na loja.',
  pagamento_extra: 'Mais uma forma de pagamento na loja.',
  frete_transportadora: 'Frete calculado por transportadora.',
  integracao_erp: 'A loja ligada ao seu sistema de nota fiscal.',
  marketplace: 'A loja ligada ao Mercado Livre ou à Shopee.',
  migracao_loja: 'Eu trago os produtos da sua loja atual.',
  loja_virtual: 'Loja feita do zero, em código próprio.',
  area_restrita: 'Uma área com login para associados, alunos ou clientes.',
  area_tela_extra: 'Mais uma tela dentro da área com login.',
  area_perfil_extra: 'Mais um tipo de acesso, como associado e diretoria.',
  area_cobranca_recorrente: 'Cobrança de mensalidade ou anuidade pela área com login.',
  area_documentos: 'Documentos e certificados para cada pessoa da área com login.',
  area_importar_usuarios: 'Eu importo a sua lista de pessoas para a área com login.',
  sistema_sob_medida: 'Um sistema ou painel feito para o seu caso.'
};
const SEMPRE = ['pagina_extra', 'textos', 'imagens', 'formulario_avancado', 'idioma'];
const POR_RAMO = { agendamento: ['saude', 'beleza', 'servicos', 'educacao'], catalogo: ['comercio', 'alimentacao'], blog: ['saude', 'educacao', 'associacao', 'servicos'], integracao: ['servicos', 'comercio', 'associacao'] };

function extra(chave, def) {
  return { chave, nome: def.nome, frase: FRASES[chave] || def.nome, valor: def.fora_do_automatico ? null : def.valor, max: def.fora_do_automatico ? null : def.max,
    requer: Array.isArray(def.requer) ? def.requer : null, fale_comigo: def.fora_do_automatico === true };
}

export function catalogoPublico(regras, { formato, ramo }) {
  const formatos = Object.entries(regras.formatos || {}).map(([chave, f]) => ({ chave, nome: f.nome, a_partir_de: f.base, paginas_incluidas: f.paginas_incluidas, inclui: f.inclui || [] }));
  const principais = [], mais = [];
  for (const [chave, def] of Object.entries(regras.adicionais || {})) {
    if (Array.isArray(def.requer) && def.requer.includes('loja_plataforma') && formato !== 'loja_plataforma') continue;   /* (os da loja só com a loja) */
    const doRamo = SEMPRE.includes(chave) || (POR_RAMO[chave] || []).includes(ramo) || (formato === 'loja_plataforma' && Array.isArray(def.requer) && def.requer.includes('loja_plataforma'));
    (doRamo && !def.fora_do_automatico ? principais : mais).push(extra(chave, def));
  }
  const u = regras.multiplicadores?.urgencia;
  return { formatos, extras: { principais, mais }, urgencia: u ? { acrescimo_percentual: Math.round((u.fator - 1) * 100), prazo_fator: u.prazo_fator } : null };
}

const OBJETIVO_BRIEFING = { pedidos_whatsapp: 'gerar_leads', agendamentos: 'agendamentos', vender_online: 'vender', apresentar: 'apresentar_empresa', campanha: 'lancar_produto' };
const NOME_RAMO = { servicos: 'serviços', saude: 'saúde', beleza: 'beleza', alimentacao: 'alimentação', comercio: 'comércio', educacao: 'educação', associacao: 'associação', outro: 'outro' };
const POSSE = { tenho: 'tem', parte: 'parcial', nao: 'nao' };

/* as respostas viram o começo do briefing (o mesmo formato que o consultor monta), para a fila de modelos */
export function respostasParaBriefing(r, formato) {
  const objetivos = [...new Set(r.objetivos.map(o => OBJETIVO_BRIEFING[o] || 'outro'))];
  const b = {
    negocio: { segmento: r.ramo === 'outro' && r.outro ? r.outro : NOME_RAMO[r.ramo], ...(r.cidade ? { cidade: r.cidade } : {}) },
    objetivos,
    conteudo: { textos: POSSE[r.material] },
    identidade_visual: { tem_logo: r.material === 'tenho' },
    projeto: { formato }
  };
  if (r.objetivos.includes('achado_google')) b.objetivo_detalhe = 'ser achado no Google';
  return b;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test docs/testes/catalogo.test.mjs`
Expected: PASS (4 testes). Se `limparAtualizacao` descartar algum campo (ex.: `negocio.cidade`), ajustar o mapa para o que o esquema aceita — o teste exige igualdade.

- [ ] **Step 5: Commit**

```bash
node C:/Users/Irineu/AppData/Local/Temp/claude/C--Vault---Fernando-Beyon-Zero/8c6dcd5e-1bcc-4c97-a28a-486ff40d5334/scratchpad/crlf.mjs api/_vendas/catalogo.mjs docs/testes/catalogo.test.mjs package.json
git add api/_vendas/catalogo.mjs docs/testes/catalogo.test.mjs package.json
git commit -m "feat(orcamento): catálogo público da tabela ativa e o mapa das respostas para o briefing"
```

---

### Task 3: Banco — gravar as respostas sem turno de conversa

**Files:**
- Create: `supabase/migrations/20261012120000_respostas_formulario.sql`
- Test: `docs/testes/vendas-banco.test.mjs` (acrescentar 1 teste)

**Interfaces:**
- Produces: `app.vendas_registrar_respostas(p jsonb) → jsonb { ok: true }` com `p = { conversa_id, visitante_id, briefing, confianca }`; só nas etapas `descoberta` e `estimativa`; só `service_role` executa.

- [ ] **Step 1: Write the failing test** — no fim de `docs/testes/vendas-banco.test.mjs`:

```js
test('respostas do formulário: gravam o briefing sem turno (sem mensagem, sem custo), só antes do contato', async () => {
  const ids = await conversaAte(V1, 'iniciada');
  const base = { conversa_id: ids.conversa, visitante_id: V1 };
  await rpc('vendas_registrar_respostas', { ...base, briefing: { negocio: { segmento: 'saúde', cidade: 'Goiânia' }, projeto: { formato: 'institucional' } }, confianca: 0.4 });
  const c = (await db.query('select briefing, confianca, turnos, custo_ia_usd from app.conversas where id = $1', [ids.conversa])).rows[0];
  assert.equal(c.briefing.negocio.cidade, 'Goiânia');
  assert.equal(Number(c.confianca), 0.4);
  assert.equal(c.turnos, 0, 'não conta turno');
  assert.equal((await db.query('select count(*)::int n from app.mensagens where conversa_id = $1', [ids.conversa])).rows[0].n, 0, 'nenhuma mensagem');
  const depois = await conversaAte(V1, 'contato');
  assert.equal((await erroDe(rpc('vendas_registrar_respostas', { conversa_id: depois.conversa, visitante_id: V1, briefing: {}, confianca: 0 })))?.codigo, ETAPA, 'depois do contato: recusado');
  assert.equal((await erroDe(rpc('vendas_registrar_respostas', { conversa_id: ids.conversa, visitante_id: V2, briefing: {}, confianca: 0 })))?.codigo, NAO_ACHOU, 'conversa de outro visitante');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test --test-name-pattern="respostas do formulário" docs/testes/vendas-banco.test.mjs`
Expected: FAIL — `function app.vendas_registrar_respostas(jsonb) does not exist`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261012120000_respostas_formulario.sql`:

```sql
-- ==========================================================================
-- ORÇAMENTO SEM IA (spec docs/specs/2026-10-11-orcamento-sem-ia.md, PR 1):
-- as respostas do formulário gravam o começo do briefing SEM turno de
-- conversa (sem mensagens, sem custo, sem contar turno). Só antes do contato
-- (descoberta, estimativa): depois disso o briefing é o que gerou os modelos.
-- ==========================================================================
create function app.vendas_registrar_respostas(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);   -- (FOR UPDATE; de outro visitante: P0002)
  perform privado.exigir_etapa(c, array['descoberta', 'estimativa']);
  if jsonb_typeof(p -> 'briefing') is distinct from 'object' then raise exception 'briefing inválido' using errcode = '22023'; end if;
  update app.conversas set
    briefing = coalesce(briefing, '{}') || (p -> 'briefing'),
    confianca = least(1, greatest(0, coalesce((p ->> 'confianca')::numeric, confianca))),
    ultima_atividade = now()
  where id = c.id;
  perform privado.evento(c.org_id, c.id, 'respostas_formulario');
  return jsonb_build_object('ok', true);
end $$;

revoke all on function app.vendas_registrar_respostas(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_registrar_respostas(jsonb) to service_role;
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test docs/testes/vendas-banco.test.mjs`
Expected: PASS (todos, inclusive o novo). Se `privado.evento` exigir tipo numa lista fechada de eventos, acrescentar `'respostas_formulario'` à restrição na mesma migration (conferir `app.eventos_funil` em `20261007120000_vendas_tabelas.sql`).

- [ ] **Step 5: Commit**

```bash
node C:/Users/Irineu/AppData/Local/Temp/claude/C--Vault---Fernando-Beyon-Zero/8c6dcd5e-1bcc-4c97-a28a-486ff40d5334/scratchpad/crlf.mjs supabase/migrations/20261012120000_respostas_formulario.sql docs/testes/vendas-banco.test.mjs
git add supabase/migrations/20261012120000_respostas_formulario.sql docs/testes/vendas-banco.test.mjs
git commit -m "feat(banco): respostas do formulário gravam o briefing sem turno de conversa"
```

---

### Task 4: API — `catalogo`, `simular`, `confirmar-pacote`, e o modo dos modelos sem chave

**Files:**
- Modify: `api/_vendas/fluxo.mjs` (três ações, perto de `estado`), `api/vendas.mjs` (rotas e `sessao-config`), `api/_ia/config.mjs` (`modoDirecoes`)
- Test: `docs/testes/formulario-api.test.mjs` (novo); `package.json`

**Interfaces:**
- Consumes: `classificar` (Task 1), `catalogoPublico`/`respostasParaBriefing` (Task 2), `app.vendas_registrar_respostas` (Task 3), `estimar` e `cartao` (existentes), `regrasAtivas` (existente em `fluxo.mjs`).
- Produces (HTTP, todas com o token do visitante):
  - `GET ?acao=catalogo&conversa=<id>&formato=<f>&ramo=<r>` → `{ versao, formatos, extras, urgencia }`
  - `POST ?acao=simular` corpo `{ conversa_id, respostas, formato?, extras?: {chave: qtd}, urgencia?: boolean }` → `{ versao, recomendacao: { formato, alternativa, fale_comigo, sugestoes, motivo, assumido }, estimativa: cartao | null, diagnostico: { itens } | null }` — NÃO grava
  - `POST ?acao=confirmar-pacote` mesmo corpo + `versao` → `{ estimativa: cartao }`; 409 `{ erro, versao_nova }` se a tabela mudou; 409 se a etapa não for `descoberta`/`estimativa`
  - `GET ?acao=sessao-config` → `{ turnstile, consultor: boolean }`

- [ ] **Step 1: Write the failing test** — `docs/testes/formulario-api.test.mjs`:

```js
/* O orçamento sem IA pela API (/api/vendas), com o banco real (PGlite + migrations) e SEM IA (deps.ia = null).
   Spec: docs/specs/2026-10-11-orcamento-sem-ia.md §1–§3 e §7. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { modoDirecoes } from '../../api/_ia/config.mjs';

let local, deps, ipSeq = 0;
const BASE = 'http://127.0.0.1:8899';
before(async () => { local = await montarLocal({ base: BASE }); deps = { banco: local.rpc, visitantes: local.auth, ia: null }; });

function navegador() {
  const ip = '198.51.100.' + (200 + (++ipSeq));
  let token = null;
  const chamar = async (metodo, acao, corpo, query = '') => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + query, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) } }), {}, metodo, deps);
    return { status: r.status, corpo: await r.json() };
  };
  return { chamar, async iniciar() { const r = await chamar('POST', 'sessao', {}); token = r.corpo.token; return r.corpo.conversa_id; } };
}
const RESP = { ramo: 'saude', cidade: 'Goiânia', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'tenho' };

test('sem IA: simular recomenda e calcula pelo motor, sem gravar nada', async () => {
  const n = navegador(), c = await n.iniciar();
  const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });
  assert.equal(s.status, 200, JSON.stringify(s.corpo));
  assert.equal(s.corpo.recomendacao.formato, 'institucional');
  assert.equal(s.corpo.estimativa.valor_total, 3950, 'institucional 3500 + agendamento 450, pela tabela');
  assert.ok(s.corpo.versao);
  assert.equal((await local.db.query('select count(*)::int n from app.estimativas where conversa_id = $1', [c])).rows[0].n, 0, 'simular não grava');
});

test('o navegador não manda preço nem complexidade: valores do corpo são ignorados ou recusados', async () => {
  const n = navegador(), c = await n.iniciar();
  const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP, valor_total: 1, complexidade: 'normal', extras: { agendamento: 1 } });
  assert.equal(s.corpo.estimativa.valor_total, 3950);
  const alta = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP, fatores: { complexidade: 'alta' } });
  assert.equal(alta.corpo.estimativa.valor_total, 3950, 'complexidade nunca vem do corpo');
  const dep = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP, extras: { area_documentos: 1 } });
  assert.equal(dep.status, 400, 'dependente sem o item de que depende: recusado com motivo');
  assert.match(dep.corpo.erro, /área restrita/i);
  const fora = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP, extras: { sistema_sob_medida: 1 } });
  assert.equal(fora.status, 200);
  assert.equal(fora.corpo.estimativa, null);
  assert.ok(fora.corpo.diagnostico, 'fora do automático: fale comigo, sem preço');
});

test('confirmar-pacote grava uma vez, com a versão da tabela; versão velha → 409 com a nova; depois do contato → 409', async () => {
  const n = navegador(), c = await n.iniciar();
  const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });
  const velha = await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: '00000000-0000-4000-8000-000000000000' });
  assert.equal(velha.status, 409);
  assert.equal(velha.corpo.versao_nova, s.corpo.versao);
  const ok = await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: s.corpo.versao });
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  assert.equal(ok.corpo.estimativa.valor_total, 3950);
  const conv = (await local.db.query('select etapa, briefing, turnos from app.conversas where id = $1', [c])).rows[0];
  assert.equal(conv.etapa, 'estimativa');
  assert.equal(conv.briefing.negocio.cidade, 'Goiânia');
  assert.equal(conv.turnos, 0);
  assert.equal((await n.chamar('POST', 'contato', { conversa_id: c, nome: 'Ana', telefone: '(62) 99999-0000', aceite: true })).status, 200);
  assert.equal((await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: s.corpo.versao })).status, 409, 'depois do contato o pacote não muda por aqui');
});

test('catálogo com sessão e sem nada interno; sessao-config diz se há consultor', async () => {
  const n = navegador(), c = await n.iniciar();
  const cat = await n.chamar('GET', 'catalogo', undefined, '&conversa=' + c + '&formato=institucional&ramo=saude');
  assert.equal(cat.status, 200);
  assert.ok(!JSON.stringify(cat.corpo).includes('prioridade'));
  const semToken = await atender(new Request(BASE + '/api/vendas?acao=catalogo&conversa=' + c), {}, 'GET', deps);
  assert.equal(semToken.status, 401);
  const cfg = await atender(new Request(BASE + '/api/vendas?acao=sessao-config'), {}, 'GET', deps);
  assert.equal((await cfg.json()).consultor, false);
});

test('sem chave da Anthropic, os modelos saem sempre pela fila manual', () => {
  assert.equal(modoDirecoes({}), 'manual');
  assert.equal(modoDirecoes({ BZ_DIRECOES: 'api' }), 'manual', 'sem chave, mesmo pedindo api');
  assert.equal(modoDirecoes({ ANTHROPIC_API_KEY: 'x', BZ_DIRECOES: 'api' }), 'api');
  assert.equal(modoDirecoes({ ANTHROPIC_API_KEY: 'x', BZ_DIRECOES: 'manual' }), 'manual');
  assert.equal(modoDirecoes({ BZ_IA: 'simulada' }), 'api', 'o simulador local segue gerando');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test docs/testes/formulario-api.test.mjs`
Expected: FAIL — `simular` responde 404 "Ação inválida." e `modoDirecoes({})` devolve `'api'`.

- [ ] **Step 3: Implement**

`api/_ia/config.mjs`, trocar a linha de `modoDirecoes`:

```js
/* sem chave da Anthropic os modelos saem SEMPRE pela fila manual (spec do orçamento sem IA §7); o simulador local
   (BZ_IA=simulada / BZ_LOCAL=1) continua gerando para os testes e o servidor local */
export const modoDirecoes = (env = process.env) => {
  if (String(env.BZ_DIRECOES || '').trim().toLowerCase() === 'manual') return 'manual';
  const simulada = String(env.BZ_IA || '').trim().toLowerCase() === 'simulada' || env.BZ_LOCAL === '1';
  return env.ANTHROPIC_API_KEY || simulada ? 'api' : 'manual';
};
```

`api/vendas.mjs`:
- em `ACOES.GET` acrescentar `catalogo: 'catalogo'`; em `ACOES.POST` acrescentar `simular: 'simular', 'confirmar-pacote': 'confirmarPacote'`;
- trocar a linha do `sessaoConfig` por:

```js
  if (acao === 'sessaoConfig') return responder({ turnstile: cfgTurnstile.siteKey, consultor: deps ? !!deps.ia : !!(await criarIA(env)) });
```

`api/_vendas/fluxo.mjs`:
- imports no topo:

```js
import { classificar } from '../_classificador/index.mjs';
import { catalogoPublico, respostasParaBriefing } from './catalogo.mjs';
import { criarFreio } from '../_freio.mjs';
```

- dentro de `criarFluxo`, antes do `return {`, as funções de apoio:

```js
  /* o ORÇAMENTO SEM IA (spec docs/specs/2026-10-11-orcamento-sem-ia.md): as escolhas viram fatores AQUI; o navegador
     nunca manda preço, fator nem complexidade */
  const freioSimular = criarFreio({ max: 60, janelaMs: 60 * 60e3 });   /* por conversa (o freio no banco vem no PR 2) */
  const ETAPAS_PACOTE = ['descoberta', 'estimativa'];
  async function pacote(corpo) {
    const regras = await regrasAtivas(banco);
    exigir(regras, 503, 'A tabela de valores está em atualização. Fale com a Beyon Zero pelo WhatsApp.');
    const rec = (await classificar('recomendar_pacote', { respostas: corpo?.respostas, formatos: Object.keys(regras.regras.formatos) })).dados;
    exigir(!rec.erros, 400, 'Respostas inválidas.');
    const formato = typeof corpo?.formato === 'string' && Object.hasOwn(regras.regras.formatos, corpo.formato) ? corpo.formato : rec.formato;
    const extras = {};
    for (const [k, q] of Object.entries(corpo?.extras && typeof corpo.extras === 'object' ? corpo.extras : {})) if (/^[a-z_]{2,40}$/.test(k) && Number.isInteger(q)) extras[k] = q;
    const fatores = { formato, adicionais: { ...(formato === rec.formato ? rec.adicionais : {}), ...extras }, urgencia: corpo?.urgencia === true };
    const e = estimar(fatores, regras.regras);
    if (e.erros) throw new Recusa(400, e.erros[0]);
    return { regras, rec, e, formato };
  }
  const publicaRec = rec => ({ formato: rec.formato, alternativa: rec.alternativa, fale_comigo: rec.fale_comigo, sugestoes: rec.sugestoes, motivo: rec.motivo, assumido: rec.assumido });
```

- no objeto retornado, junto das outras ações:

```js
    async catalogo({ request, query }) {
      const vid = await visitante(request);
      exigir(ehUuid(query.get('conversa')), 400, 'Conversa inválida.');
      await estado(vid, query.get('conversa'));   /* (a conversa é deste visitante) */
      const regras = await regrasAtivas(banco);
      exigir(regras, 503, 'A tabela de valores está em atualização. Fale com a Beyon Zero pelo WhatsApp.');
      return { versao: regras.id, ...catalogoPublico(regras.regras, { formato: query.get('formato'), ramo: query.get('ramo') }) };
    },

    /* o preço ao vivo: calcula, NÃO grava (spec §3) */
    async simular({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      exigir(!freioSimular(corpo.conversa_id), 429, 'Muitas simulações seguidas. Espere um pouco ou fale pelo WhatsApp.');
      await estado(vid, corpo.conversa_id);
      const { regras, rec, e } = await pacote(corpo);
      if (e.encaminhar_diagnostico) return { versao: regras.id, recomendacao: publicaRec(rec), estimativa: null, diagnostico: { itens: e.itens_diagnostico.map(i => i.nome) } };
      return { versao: regras.id, recomendacao: publicaRec(rec), estimativa: cartao(e), diagnostico: null };
    },

    /* grava o pacote UMA vez, com a versão da tabela que a pessoa viu (spec §3 e §7) */
    async confirmarPacote({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      const est = await estado(vid, corpo.conversa_id);
      exigir(ETAPAS_PACOTE.includes(est.conversa.etapa), 409, 'O pacote já foi fechado. Para mudar, fale com a Beyon Zero pelo WhatsApp.');
      const { regras, rec, e, formato } = await pacote(corpo);
      if (corpo?.versao !== regras.id) throw new Recusa(409, 'A tabela de valores mudou enquanto você montava o orçamento. Confira o valor novo.', { versao_nova: regras.id });
      exigir(!e.encaminhar_diagnostico, 409, 'Esse pacote precisa de uma conversa. Fale com a Beyon Zero pelo WhatsApp.');
      await banco('vendas_registrar_respostas', { conversa_id: corpo.conversa_id, visitante_id: vid, briefing: limparAtualizacao(respostasParaBriefing(rec.respostas, formato)), confianca: 0.4 });
      await banco('vendas_registrar_estimativa', { conversa_id: corpo.conversa_id, visitante_id: vid, regras_id: regras.id, fatores: e.fatores,
        valor_total: e.valor_total, sinal: e.sinal, prazo_dias: e.prazo_dias, fase: e.fase, detalhes: e });
      return { estimativa: cartao(e) };
    },
```

- acrescentar `limparAtualizacao` ao import de `./briefing.mjs` se ainda não estiver importado em `fluxo.mjs`.
- Conferir que `Recusa` com `extra` responde com o campo extra no corpo (como `whatsapp`): o teste espera `versao_nova` no corpo.

Em `package.json`, acrescentar ` docs/testes/formulario-api.test.mjs` ao `testar`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test docs/testes/formulario-api.test.mjs` → PASS (5 testes).
Run: `npm run testar` → todos passam (os testes antigos usam `direcoes: 'api'` explícito ou o simulador; se algum dependia de `modoDirecoes()` sem chave, passar `direcoes: 'api'` no `criarFluxo` dele).

- [ ] **Step 5: Commit**

```bash
node C:/Users/Irineu/AppData/Local/Temp/claude/C--Vault---Fernando-Beyon-Zero/8c6dcd5e-1bcc-4c97-a28a-486ff40d5334/scratchpad/crlf.mjs api/_vendas/fluxo.mjs api/vendas.mjs api/_ia/config.mjs docs/testes/formulario-api.test.mjs package.json
git add api/_vendas/fluxo.mjs api/vendas.mjs api/_ia/config.mjs docs/testes/formulario-api.test.mjs package.json
git commit -m "feat(orcamento): simular, confirmar-pacote e catálogo sem IA; modelos pela fila manual sem chave"
```

---

### Task 5: A tela — perguntas, preço e "Quer ajustar?"

**Files:**
- Create: `js/orcamento-perguntas.js`
- Modify: `js/orcamento-api.js` (métodos novos), `orcamento.html` (marcação e script), `css/orcamento.css` (estilos), `js/orcamento.js` (conversa só com consultor; etapas)
- Test: `docs/e2e-orcamento.mjs` (o caminho começa pelas perguntas)

**Interfaces:**
- Consumes: as ações HTTP da Task 4.
- Produces: `window.BZOrcamento.simular(dados)`, `.confirmarPacote(dados)`, `.catalogo(formato, ramo)`, `.sessaoConfig()`; `window.BZPerguntas = { iniciar(opcoes) }` com `opcoes = { aoConfirmar: function (estimativa) }`; evento no `document`: `bz:pacote-confirmado` com `detail.estimativa`.

- [ ] **Step 1: Write the failing E2E steps** — em `docs/e2e-orcamento.mjs`, no lugar do 1º turno de conversa (o que hoje escreve "Tenho uma clínica…" na caixa e espera o cartão), inserir:

```js
  /* orçamento sem IA (spec 2026-10-11): 4 perguntas → preço → ajustar → quero os três modelos */
  await page.waitForSelector('#o-perguntas:not([hidden])');
  ok(await page.locator('#o-conversa').isHidden(), 'sem IA: a conversa com o consultor não aparece');
  await page.click('[data-ramo="saude"]');
  await page.fill('#o-p-cidade', 'Goiânia');
  await page.click('#o-p-seguir');
  await page.click('[data-objetivo="agendamentos"]');
  await page.click('#o-p-seguir');
  await page.click('[data-site-atual="instagram"]');
  await page.click('[data-material="tenho"]');
  await page.click('#o-p-ver-preco');
  await page.waitForSelector('#o-est-cheio:not([hidden])', { timeout: 15000 });
  ok((await page.textContent('#o-est-valor')).includes('3.950'), 'preço pela tabela: R$ 3.950');
  ok(/agend/i.test(await page.textContent('#o-est-motivo')), 'o motivo da recomendação, nas palavras da pessoa');
  ok(await page.locator('#o-vizinhos [data-formato="landing_page"]').isVisible(), 'o formato vizinho ao lado (âncora honesta)');
  ok(/não paga nada/i.test(await page.textContent('#o-est-sem-risco')), 'sem risco até confirmar');
  await page.click('#o-ajustar-abrir');
  await page.check('#o-x-blog');
  await page.waitForFunction(() => document.getElementById('o-est-valor').textContent.includes('4.850'));
  ok(true, 'ajustar: o preço muda na hora pelo servidor (3.950 + blog 900)');
  await page.uncheck('#o-x-blog');
  await page.waitForFunction(() => document.getElementById('o-est-valor').textContent.includes('3.950'));
  await page.click('#o-quero-modelos');
  await page.waitForSelector('#o-contato:not([hidden])');
  ok(true, 'pacote gravado: segue para o contato');
```

Ajustar o restante do E2E que dependia das mensagens do consultor (ex.: contagem de `#o-log .msg`, "Enter repetido", "texto com HTML vira texto" na conversa): essas checagens passam a valer só quando o consultor existe; com o simulador local ligado (`BZ_LOCAL=1`), `sessao-config` diz `consultor: true` — então rodar o E2E com o consultor DESLIGADO: no servidor local, exportar `BZ_SEM_CONSULTOR=1` e fazer `sessaoConfig` devolver `consultor: false` quando essa variável existir (só em `BZ_LOCAL`). Mover as checagens da conversa para um bloco que só roda com `CONSULTOR=1`.

- [ ] **Step 2: Run to verify it fails**

Run (servidor local ligado, `BZ_SEM_CONSULTOR=1`): `node docs/e2e-orcamento.mjs`
Expected: FALHA em `waitForSelector('#o-perguntas:not([hidden])')` (timeout).

- [ ] **Step 3: Implement**

`js/orcamento-api.js`, no objeto `window.BZOrcamento`:

```js
    sessaoConfig: function () { return http('GET', 'sessao-config'); },
    catalogo: async function (formato, ramo) { await garantirSessao(); return chamar('GET', 'catalogo', undefined, '&conversa=' + encodeURIComponent(sessao.conversa_id) + '&formato=' + encodeURIComponent(formato || '') + '&ramo=' + encodeURIComponent(ramo || '')); },
    simular: async function (dados) { await garantirSessao(); return chamar('POST', 'simular', comConversa(dados)); },
    confirmarPacote: function (dados) { return chamar('POST', 'confirmar-pacote', comConversa(dados)); },
```

`orcamento.html`:
- o `orc-lead` passa a: `Quatro perguntas rápidas e você vê o preço na hora, sem cadastro. Depois, se quiser, eu desenho três modelos de site para o seu negócio. Você não paga nada até escolher um deles e confirmar.`
- as etapas (`#o-etapas`) passam a: `Perguntas`, `Preço`, `Modelos`, `Ajustes`, `Resumo`, `Entrada` (mesmos `data-passo` de hoje, só o texto);
- a seção `orc-conversa` ganha `id="o-conversa"` e `hidden`, e acima dela um botão `<button class="btn btn--ghost btn--sm" type="button" id="o-conversar" hidden>Prefere conversar? Fale com o consultor</button>`;
- antes de `<div class="orc-mesa">`, a seção das perguntas:

```html
    <!-- AS PERGUNTAS (orçamento sem IA, spec 2026-10-11 §2): uma por tela, botões grandes -->
    <section class="orc-perguntas" id="o-perguntas" aria-labelledby="o-p-titulo" hidden>
      <p class="orc-perguntas__passo" id="o-p-passo">Passo 1 de 3</p>
      <div class="orc-p" data-p="1">
        <h2 id="o-p-titulo">O que o seu negócio faz?</h2>
        <div class="orc-opcoes" role="group" aria-labelledby="o-p-titulo">
          <button type="button" class="orc-op" data-ramo="servicos">Serviços<small>oficina, assistência técnica, advocacia…</small></button>
          <button type="button" class="orc-op" data-ramo="saude">Saúde<small>clínica, consultório, fisioterapia…</small></button>
          <button type="button" class="orc-op" data-ramo="beleza">Beleza<small>salão, barbearia, estética…</small></button>
          <button type="button" class="orc-op" data-ramo="alimentacao">Alimentação<small>restaurante, lanchonete, padaria…</small></button>
          <button type="button" class="orc-op" data-ramo="comercio">Comércio<small>loja, mercado, distribuidora…</small></button>
          <button type="button" class="orc-op" data-ramo="educacao">Educação<small>escola, curso, aulas…</small></button>
          <button type="button" class="orc-op" data-ramo="associacao">Associação ou entidade</button>
          <button type="button" class="orc-op" data-ramo="outro">Outro</button>
        </div>
        <label class="orc-p__campo" for="o-p-outro" id="o-p-outro-rotulo" hidden>Qual? <input id="o-p-outro" maxlength="60" autocomplete="off" /></label>
        <label class="orc-p__campo" for="o-p-cidade">Em qual cidade? <input id="o-p-cidade" maxlength="60" autocomplete="address-level2" /></label>
        <button type="button" class="btn btn--primary orc-p__seguir" id="o-p-seguir">Seguir</button>
        <button type="button" class="orc-p__naosei" data-naosei="1">Não sei, escolha por mim</button>
      </div>
      <div class="orc-p" data-p="2" hidden>
        <h2 id="o-p2-titulo">O que o site precisa trazer para você?</h2>
        <p class="orc-p__nota">Pode marcar mais de um.</p>
        <div class="orc-opcoes" role="group" aria-labelledby="o-p2-titulo">
          <button type="button" class="orc-op" aria-pressed="false" data-objetivo="pedidos_whatsapp">Receber pedidos e orçamentos pelo WhatsApp</button>
          <button type="button" class="orc-op" aria-pressed="false" data-objetivo="achado_google">Ser achado no Google e no mapa</button>
          <button type="button" class="orc-op" aria-pressed="false" data-objetivo="agendamentos">Agendamentos</button>
          <button type="button" class="orc-op" aria-pressed="false" data-objetivo="vender_online">Vender online</button>
          <button type="button" class="orc-op" aria-pressed="false" data-objetivo="apresentar">Apresentar a empresa</button>
          <button type="button" class="orc-op" aria-pressed="false" data-objetivo="campanha">Uma campanha ou lançamento</button>
        </div>
        <button type="button" class="btn btn--primary orc-p__seguir" data-seguir="2">Seguir</button>
        <button type="button" class="orc-p__naosei" data-naosei="2">Não sei, escolha por mim</button>
      </div>
      <div class="orc-p" data-p="3" hidden>
        <h2 id="o-p3-titulo">Já tem site ou endereço próprio?</h2>
        <div class="orc-opcoes" role="group" aria-labelledby="o-p3-titulo">
          <button type="button" class="orc-op" data-site-atual="nao">Não</button>
          <button type="button" class="orc-op" data-site-atual="instagram">Só o Instagram</button>
          <button type="button" class="orc-op" data-site-atual="tenho_site">Tenho site</button>
          <button type="button" class="orc-op" data-site-atual="so_endereco">Tenho só o endereço (.com.br)</button>
        </div>
        <h2 id="o-p4-titulo">Já tem logo e textos?</h2>
        <div class="orc-opcoes" role="group" aria-labelledby="o-p4-titulo">
          <button type="button" class="orc-op" data-material="tenho">Tenho</button>
          <button type="button" class="orc-op" data-material="parte">Tenho uma parte</button>
          <button type="button" class="orc-op" data-material="nao">Não tenho</button>
        </div>
        <button type="button" class="btn btn--primary orc-p__seguir" id="o-p-ver-preco">Ver o preço</button>
      </div>
      <p class="orc-erro" id="o-p-erro" role="alert"></p>
    </section>
```

(A 1ª tela usa `id="o-p-seguir"`; a 2ª `data-seguir="2"`. O E2E clica `#o-p-seguir` duas vezes: o módulo move o id `o-p-seguir` para o botão da tela atual ao trocar de tela — ou trocar o E2E para `[data-p]:not([hidden]) .orc-p__seguir`. Escolher a 2ª opção e ajustar o E2E: substituir os dois `page.click('#o-p-seguir')` por `page.click('.orc-p:not([hidden]) .orc-p__seguir')`.)

- dentro do `aside` do investimento, logo depois de `#o-est-valor`: `<p class="orc-est__motivo" id="o-est-motivo"></p>`; depois da `dl`: `<p class="orc-est__assumido" id="o-est-assumido" hidden></p>`, `<div class="orc-est__inclui"><p class="orc-rotulo">Já vem no pacote</p><ul id="o-est-inclui"></ul></div>`, `<p class="orc-est__sem-risco" id="o-est-sem-risco">Você não paga nada até escolher um modelo e confirmar o resumo.</p>`, `<div class="orc-vizinhos" id="o-vizinhos"></div>`, e os botões `<button class="btn btn--primary" type="button" id="o-quero-modelos">Quero os três modelos</button>` e `<button class="btn btn--ghost" type="button" id="o-ajustar-abrir" aria-expanded="false" aria-controls="o-ajustar">Quer ajustar?</button>`;
- trocar o texto de `#o-est-vazio` por `O preço aparece aqui assim que você responder as perguntas. Ele vem da tabela da Beyon Zero.`;
- depois do `aside`, a seção do ajuste: `<section class="orc-ajustar" id="o-ajustar" aria-labelledby="o-ajustar-titulo" hidden><h2 id="o-ajustar-titulo">Quer ajustar?</h2><fieldset id="o-ajustar-principais"><legend class="sr-only">Extras para o seu negócio</legend></fieldset><details class="orc-ajustar__mais"><summary>Ver mais opções</summary><fieldset id="o-ajustar-mais"><legend class="sr-only">Outras opções</legend></fieldset></details><label class="orc-check" for="o-x-urgencia"><input type="checkbox" id="o-x-urgencia" /> <span id="o-x-urgencia-texto">Preciso antes do prazo</span></label></section>`;
- trocar "Para quem vamos desenhar?" e o `#o-contato-lead` por `Para quem vou desenhar?` / `Com o seu contato, eu desenho três modelos de site para o seu negócio: um feito para trazer pedidos, um que passa confiança e um mais moderno e chamativo.`;
- trocar os dois "Pergunte ao consultor" do escopo e do pagamento: o link `data-perguntar` só aparece quando houver consultor (o módulo tira `hidden` de `.orc-perguntar` quando `consultor` for verdadeiro); envolver cada `<p class="orc-nota">…data-perguntar…</p>` com a classe `orc-perguntar` e `hidden`;
- acrescentar `<script src="js/orcamento-perguntas.js" defer></script>` ANTES de `js/orcamento.js`.

`js/orcamento-perguntas.js` (novo, completo):

```js
/* ==========================================================================
   AS PERGUNTAS DO ORÇAMENTO SEM IA (spec docs/specs/2026-10-11-orcamento-sem-ia.md §2–§3).
   Uma pergunta por tela → o preço (do servidor, nunca calculado aqui) →
   "Quer ajustar?" com o preço ao vivo (simular, que não grava) → "Quero os
   três modelos" grava o pacote (confirmar-pacote) e entrega a vez ao resto
   da página (evento bz:pacote-confirmado). Todo texto por textContent.
   ========================================================================== */
(function () {
  'use strict';
  var API = window.BZOrcamento;
  var $ = function (id) { return document.getElementById(id); };
  if (!API || !$('o-perguntas')) return;
  var r = { objetivos: [] }, formato = null, extras = {}, urgencia = false, versao = null, catalogo = null, pedindo = 0;
  var dinheiro = function (n) { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 }); };
  var telas = [].slice.call(document.querySelectorAll('#o-perguntas .orc-p'));
  var NOMES = { landing_page: 'Site de uma página', institucional: 'Site com várias páginas', sob_medida: 'Site com visual exclusivo', loja_plataforma: 'Loja virtual' };
  var ASSUMIDO = { ramo: 'o seu ramo', objetivos: 'o que o site precisa trazer', site_atual: 'se já tem site', material: 'se já tem logo e textos' };

  function irPara(n) {
    telas.forEach(function (t) { t.hidden = t.getAttribute('data-p') !== String(n); });
    $('o-p-passo').textContent = 'Passo ' + n + ' de 3';
    var h = telas[n - 1].querySelector('h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: false }); }
  }
  function marcarUm(attr, valor, grupo) {
    [].forEach.call(document.querySelectorAll('[' + attr + ']'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === valor)); });
    r[grupo] = valor;
  }
  [].forEach.call(document.querySelectorAll('[data-ramo]'), function (b) {
    b.addEventListener('click', function () { marcarUm('data-ramo', b.getAttribute('data-ramo'), 'ramo'); $('o-p-outro-rotulo').hidden = r.ramo !== 'outro'; });
  });
  [].forEach.call(document.querySelectorAll('[data-objetivo]'), function (b) {
    b.addEventListener('click', function () {
      var o = b.getAttribute('data-objetivo'), i = r.objetivos.indexOf(o);
      if (i >= 0) r.objetivos.splice(i, 1); else r.objetivos.push(o);
      b.setAttribute('aria-pressed', String(i < 0));
    });
  });
  [].forEach.call(document.querySelectorAll('[data-site-atual]'), function (b) { b.addEventListener('click', function () { marcarUm('data-site-atual', b.getAttribute('data-site-atual'), 'site_atual'); }); });
  [].forEach.call(document.querySelectorAll('[data-material]'), function (b) { b.addEventListener('click', function () { marcarUm('data-material', b.getAttribute('data-material'), 'material'); }); });
  [].forEach.call(document.querySelectorAll('.orc-p__seguir'), function (b, i) {
    if (b.id === 'o-p-ver-preco') return;
    b.addEventListener('click', function () { irPara(i + 2); });
  });
  [].forEach.call(document.querySelectorAll('[data-naosei]'), function (b) {
    b.addEventListener('click', function () { var n = Number(b.getAttribute('data-naosei')); if (n === 1) delete r.ramo; else r.objetivos = []; irPara(n + 1); });
  });

  function respostas() {
    return { ramo: r.ramo, outro: $('o-p-outro').value, cidade: $('o-p-cidade').value, objetivos: r.objetivos.slice(), site_atual: r.site_atual, material: r.material };
  }
  function lista(ul, itens) { ul.textContent = ''; itens.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }); }

  function desenhar(res) {
    versao = res.versao;
    var rec = res.recomendacao;
    if (!formato) formato = rec.formato;
    $('o-est-motivo').textContent = formato === rec.formato ? rec.motivo : '';
    var assumidos = (rec.assumido || []).map(function (k) { return ASSUMIDO[k]; }).filter(Boolean);
    $('o-est-assumido').hidden = !assumidos.length;
    $('o-est-assumido').textContent = assumidos.length ? 'Escolhi por você: ' + assumidos.join(', ') + '. Dá para trocar nas perguntas.' : '';
    document.dispatchEvent(new CustomEvent('bz:preco', { detail: { estimativa: res.estimativa, diagnostico: res.diagnostico } }));
    vizinhos(rec);
  }
  function vizinhos(rec) {
    var caixa = $('o-vizinhos');
    caixa.textContent = '';
    if (!catalogo) return;
    [rec.alternativa, formato !== rec.formato ? rec.formato : null].filter(Boolean).forEach(function (k) {
      var f = catalogo.formatos.filter(function (x) { return x.chave === k; })[0];
      if (!f || k === formato) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'orc-vizinho'; b.setAttribute('data-formato', k);
      b.textContent = (NOMES[k] || f.nome) + ' · a partir de ' + dinheiro(f.a_partir_de);
      b.addEventListener('click', function () { formato = k; extras = {}; simular(); });
      caixa.appendChild(b);
    });
    var atual = catalogo.formatos.filter(function (x) { return x.chave === formato; })[0];
    lista($('o-est-inclui'), atual ? atual.inclui : []);
  }
  function extrasNaTela() {
    if (!catalogo) return;
    [['o-ajustar-principais', catalogo.extras.principais], ['o-ajustar-mais', catalogo.extras.mais]].forEach(function (par) {
      var caixa = $(par[0]);
      [].slice.call(caixa.querySelectorAll('.orc-extra')).forEach(function (n) { n.remove(); });
      par[1].forEach(function (x) {
        var rotulo = document.createElement('label'); rotulo.className = 'orc-check orc-extra';
        var c = document.createElement('input'); c.type = 'checkbox'; c.id = 'o-x-' + x.chave;
        c.disabled = x.fale_comigo;
        var t = document.createElement('span');
        t.textContent = x.nome + (x.valor != null ? ' · ' + dinheiro(x.valor) : ' · fale comigo') + ' — ' + x.frase;
        rotulo.setAttribute('for', c.id);
        rotulo.appendChild(c); rotulo.appendChild(t);
        if (x.requer) rotulo.hidden = !x.requer.some(function (q) { return q === formato || extras[q] > 0; });
        c.checked = extras[x.chave] > 0;
        c.addEventListener('change', function () {
          if (c.checked) extras[x.chave] = 1; else {
            delete extras[x.chave];
            par[1].concat(catalogo.extras.principais, catalogo.extras.mais).forEach(function (d) { if (d.requer && d.requer.indexOf(x.chave) >= 0) delete extras[d.chave]; });   /* (desmarcar o pai desmarca os dependentes) */
          }
          extrasNaTela(); simular();
        });
        caixa.appendChild(rotulo);
      });
    });
    if (catalogo.urgencia) $('o-x-urgencia-texto').textContent = 'Preciso antes do prazo: +' + catalogo.urgencia.acrescimo_percentual + '% no valor';
  }

  async function simular() {
    var meu = ++pedindo;
    $('o-p-erro').textContent = '';
    try {
      var res = await API.simular({ respostas: respostas(), formato: formato, extras: extras, urgencia: urgencia });
      if (meu !== pedindo) return;   /* (só a resposta mais nova vale) */
      if (!catalogo) { catalogo = await API.catalogo(formato || res.recomendacao.formato, r.ramo); }
      desenhar(res);
    } catch (e) { if (meu === pedindo) $('o-p-erro').textContent = (e && e.message) || 'Não consegui calcular agora. Tente de novo ou fale pelo WhatsApp.'; }
  }

  $('o-p-ver-preco').addEventListener('click', async function () { await simular(); $('o-perguntas').hidden = true; });
  $('o-ajustar-abrir').addEventListener('click', function () {
    var abrir = $('o-ajustar').hidden;
    $('o-ajustar').hidden = !abrir;
    this.setAttribute('aria-expanded', String(abrir));
    if (abrir) extrasNaTela();
  });
  $('o-x-urgencia').addEventListener('change', function () { urgencia = this.checked; simular(); });
  $('o-quero-modelos').addEventListener('click', async function () {
    $('o-p-erro').textContent = '';
    try {
      var res = await API.confirmarPacote({ respostas: respostas(), formato: formato, extras: extras, urgencia: urgencia, versao: versao });
      document.dispatchEvent(new CustomEvent('bz:pacote-confirmado', { detail: { estimativa: res.estimativa } }));
    } catch (e) {
      if (e && e.status === 409 && e.extra && e.extra.versao_nova) { versao = null; simular(); }
      $('o-p-erro').textContent = (e && e.message) || 'Não consegui guardar agora. Tente de novo.';
    }
  });

  window.BZPerguntas = { iniciar: function () { $('o-perguntas').hidden = false; irPara(1); } };
})();
```

(Antes de escrever, conferir em `js/orcamento-api.js` como a classe `Falha` expõe status, mensagem e o corpo extra; ajustar `e.status`, `e.message` e `e.extra` para os nomes reais.)

`js/orcamento.js`:
- no início, depois de `var API = …`, ler a configuração e decidir o modo:

```js
  /* orçamento sem IA (spec 2026-10-11): as perguntas são o núcleo; a conversa só existe quando há consultor */
  var temConsultor = false;
  API.sessaoConfig().then(function (cfg) {
    temConsultor = !!(cfg && cfg.consultor);
    mostrar('o-conversar', temConsultor);
    [].forEach.call(document.querySelectorAll('.orc-perguntar'), function (p) { p.hidden = !temConsultor; });
  }).catch(function () { /* sem configuração: segue sem consultor */ });
  $('o-conversar').addEventListener('click', function () { mostrar('o-conversa', true); $('o-texto').focus(); });
  document.addEventListener('bz:preco', function (ev) { if (ev.detail.estimativa) investimento(ev.detail.estimativa, true); mostrar('o-diagnostico', !!ev.detail.diagnostico); });
  document.addEventListener('bz:pacote-confirmado', function () { recarregar(); });
```

- no `render()`, quando não houver mensagens nem estimativa (conversa nova), chamar `window.BZPerguntas && window.BZPerguntas.iniciar()` uma vez; quando houver estimativa, manter as perguntas escondidas; a seção `#o-conversa` só fica visível se `temConsultor` e a pessoa tiver aberto "Prefere conversar?" ou já houver mensagens na conversa.

`css/orcamento.css` (no fim, seguindo os tokens existentes; nada de blur):

```css
/* AS PERGUNTAS (orçamento sem IA): botões grandes, celular primeiro; texto que importa ≥ 16px */
.orc-perguntas { margin-block: var(--s-6, 2rem); }
.orc-perguntas__passo { font-size: var(--fs-s); color: var(--t2); }
.orc-p h2 { font-size: clamp(1.4rem, 5vw, 1.9rem); margin-block: .6rem 1rem; }
.orc-opcoes { display: grid; gap: .6rem; grid-template-columns: 1fr; }
@media (min-width: 640px) { .orc-opcoes { grid-template-columns: 1fr 1fr; } }
.orc-op { min-height: 3.25rem; padding: .8rem 1rem; text-align: left; font: inherit; font-size: 1rem; color: var(--t1); background: var(--surface, #0b0d0d); border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.orc-op small { display: block; margin-top: .2rem; font-size: .875rem; color: var(--t2); }
.orc-op[aria-pressed="true"] { border-color: var(--ac); }
.orc-op:focus-visible { outline: 2px solid var(--ac); outline-offset: 2px; }
.orc-p__campo { display: grid; gap: .3rem; margin-top: 1rem; font-size: 1rem; }
.orc-p__campo input { min-height: 3rem; font: inherit; font-size: 1rem; }
.orc-p__seguir { margin-top: 1.2rem; width: 100%; font-size: 1rem; text-transform: none; letter-spacing: normal; }
.orc-p__naosei { margin-top: .6rem; background: none; border: 0; color: var(--t2); text-decoration: underline; font: inherit; font-size: 1rem; cursor: pointer; }
.orc-est__motivo, .orc-est__sem-risco, .orc-est__assumido { font-size: 1rem; color: var(--t2); }
.orc-vizinhos { display: grid; gap: .5rem; margin-top: 1rem; }
.orc-vizinho { padding: .7rem 1rem; text-align: left; font: inherit; font-size: 1rem; color: var(--t1); background: none; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.orc-ajustar { margin-block: 1.5rem; }
.orc-ajustar .orc-extra { display: flex; gap: .6rem; align-items: flex-start; padding-block: .5rem; font-size: 1rem; }
```

(Conferir em `css/tokens.css` os nomes reais dos tokens — `--t1`, `--t2`, `--ac`, `--line`, `--fs-s`, `--s-6`, `--surface` — e trocar pelos que existem; não criar cor nova.)

- [ ] **Step 4: Run to verify it passes**

Run, com o servidor local reiniciado (`node docs/servidor.mjs . 8899`, com `BZ_SEM_CONSULTOR=1`):
- `node docs/e2e-orcamento.mjs` → todas as linhas `OK`, nenhuma `FALHA`;
- `npm run acessibilidade` e `npm run verificar` → "Tudo certo";
- abrir as capturas do E2E no celular (`docs/olhar-orcamento/1-inicio-cel.png` e uma nova `1b-preco-cel.png` — acrescentar `await foto(page, '1b-preco-cel')` logo depois do preço) e OLHAR: botões legíveis, nada cortado a 390 px e a 320 px.

- [ ] **Step 5: Commit**

```bash
node C:/Users/Irineu/AppData/Local/Temp/claude/C--Vault---Fernando-Beyon-Zero/8c6dcd5e-1bcc-4c97-a28a-486ff40d5334/scratchpad/crlf.mjs js/orcamento-perguntas.js js/orcamento-api.js js/orcamento.js orcamento.html css/orcamento.css docs/e2e-orcamento.mjs docs/servidor.mjs api/vendas.mjs
git add js/orcamento-perguntas.js js/orcamento-api.js js/orcamento.js orcamento.html css/orcamento.css docs/e2e-orcamento.mjs docs/servidor.mjs api/vendas.mjs
git commit -m "feat(orcamento): as perguntas, o preço com o motivo e os vizinhos, e o Quer ajustar com o preço ao vivo"
```

---

### Task 6: Os textos que prometem o consultor de IA

**Files:**
- Modify: `index.html` (linhas ~204 e ~291), `sites.html` (FAQ visível ~266, JSON-LD FAQPage ~62, e ~283), `privacidade.html` (~37), `orcamento.html` (comentários e notas restantes)
- Test: `docs/testes/faq-identico.test.mjs` (existente; deve continuar passando), mais uma checagem nova abaixo

**Interfaces:** nenhuma de código; o FAQ visível e o JSON-LD precisam continuar idênticos (o teste `faq-identico` compara).

- [ ] **Step 1: Write the failing check** — acrescentar ao fim de `docs/testes/faq-identico.test.mjs`:

```js
test('nenhuma página promete o consultor de IA enquanto o orçamento é sem IA (spec 2026-10-11 §1)', () => {
  for (const pagina of ['index.html', 'sites.html', 'orcamento.html', 'privacidade.html']) {
    const html = fs.readFileSync(new URL('../../' + pagina, import.meta.url), 'utf8').replace(/<!--[^]*?-->/g, '');
    assert.ok(!/consultor de IA/i.test(html), pagina + ' ainda fala em "consultor de IA"');
    assert.ok(!/sob medida/i.test(html.replace(/sistema_sob_medida|sob_medida/g, '')), pagina + ' usa "sob medida"');
  }
});
```

(Conferir que `fs` e `assert` já estão importados no arquivo; se não, importar.)

- [ ] **Step 2: Run to verify it fails**

Run: `node --test docs/testes/faq-identico.test.mjs`
Expected: FAIL — `index.html ainda fala em "consultor de IA"`.

- [ ] **Step 3: Trocar os textos**
- `index.html` ~204: `Não sabe qual site é o seu caso? Quatro perguntas rápidas no orçamento mostram o formato e o preço, sem cadastro.`
- `index.html` ~291: `Responda quatro perguntas aqui no site e veja o preço na hora. Com o seu contato, eu desenho três modelos de site para o seu negócio, e você só paga se escolher um deles.`
- `sites.html` ~266 e o JSON-LD ~62 (mesmo texto nos dois): trocar o trecho "o consultor de IA entende o que você precisa e calcula…" por `quatro perguntas no orçamento mostram o formato e o preço pela tabela, na hora e sem cadastro.` (manter o resto da resposta igual nos dois lugares).
- `sites.html` ~283: `Não precisa chegar com o projeto pronto. Quatro perguntas mostram o formato e o preço antes de você fechar.`
- `privacidade.html` ~37: trocar `(orçamento com IA, página /orcamento): o que você escreve na conversa fica guardado…` por `(página /orcamento): as suas respostas e o que você escrever ficam guardados…`, mantendo o restante do parágrafo; onde o texto citar a Anthropic, acrescentar "quando a conversa com o consultor estiver ligada".
- `orcamento.html`: o comentário do `#o-voz` passa a citar "o preço, os modelos prontos".

- [ ] **Step 4: Run to verify it passes**

Run: `npm run testar` → todos passam (inclusive `faq-identico`).
Run: `npm run verificar` → "Tudo certo".

- [ ] **Step 5: Commit**

```bash
node C:/Users/Irineu/AppData/Local/Temp/claude/C--Vault---Fernando-Beyon-Zero/8c6dcd5e-1bcc-4c97-a28a-486ff40d5334/scratchpad/crlf.mjs index.html sites.html privacidade.html orcamento.html docs/testes/faq-identico.test.mjs
git add index.html sites.html privacidade.html orcamento.html docs/testes/faq-identico.test.mjs
git commit -m "fix(textos): o site para de prometer o consultor de IA enquanto o orçamento é sem IA"
```

---

### Task 7: Verificação final e o PR

**Files:** nenhum novo; `docs/revisoes/pr1-pendencias.md` (acrescentar a migration nova à lista do dono).

- [ ] **Step 1:** `npm run testar` (todos) e `npm run testar:mutacao` (12 de 12).
- [ ] **Step 2:** servidor local reiniciado; `node docs/e2e-orcamento.mjs` duas vezes (0 FALHA); `npm run acessibilidade`; `npm run verificar`.
- [ ] **Step 3:** acrescentar em `docs/revisoes/pr1-pendencias.md`: `| PR36 | aplicar 20261012120000_respostas_formulario.sql no banco real antes de promover; NÃO promover sem o PR 2 (freios no banco e confirmação pelo WhatsApp) | dono |`.
- [ ] **Step 4:** `node scripts/processo/nivel-de-risco.mjs origin/main HEAD` (nível 3); push; PR para a `main` com o modelo do repositório (especificação = o spec; visto rodando = capturas do celular; teste visto vermelho = as falhas dos Steps 2; regressão = os números).
- [ ] **Step 5:** revisão técnica (`code-reviewer`) e de segurança (`security-reviewer`) por agentes diferentes, SEM mudar de branch; publicar no PR; corrigir; ler os checks um a um; mesclar só com tudo verde.

---

## Self-review

- Spec §1 (núcleo, preço do servidor, IA como complemento, textos do consultor, classificador): Tasks 1, 4, 5, 6.
- Spec §2 (perguntas, tabela explícita, tela do preço com motivo, vizinhos, inclui, assumido, sem risco): Tasks 1, 2, 5. Data concreta do prazo dos modelos e o exemplo de modelo: ficam para o PR 2 (dependem da fila e da confirmação). Hospedagem por mês: dado do dono (§10), não entra até ele responder.
- Spec §3 ("Quer ajustar?": extras por ramo, ver mais, requer, fale comigo, urgência, simular sem gravar, versão da tabela): Tasks 2, 4, 5. Detalhes e confirmação: PR 2.
- Spec §7 (catalogo com sessão e sem nada interno, simular, confirmar-pacote, etapas, migration): Tasks 2, 3, 4.
- Spec §8 (JEV: contrato, adaptador desligado, liga/desliga, prazo, recuo, testes com dublê): Task 1.
- Nomes conferidos entre tarefas: `classificar`, `validarRespostas`, `catalogoPublico`, `respostasParaBriefing`, `vendas_registrar_respostas`, `simular`, `confirmarPacote`, `BZPerguntas.iniciar`, eventos `bz:preco` e `bz:pacote-confirmado`.
