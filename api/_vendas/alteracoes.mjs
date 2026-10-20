/* ==========================================================================
   ALTERAÇÕES (Fase 2, etapa 8; sem IA desde o PR 3a). Quem APLICA é o código, sobre a estrutura da direção escolhida, e
   depois a direção passa de novo pela higienização (contraste, tamanhos). As operações chegam da LISTA FECHADA das opções
   prontas (opcoes.mjs: cores ou fontes de outro modelo; mover, tirar e acrescentar seção). aplicar() ainda conhece as
   operações livres do tempo da IA (cor, tema, texto, escopo), mas nenhuma ação da API as manda mais. O texto livre do
   visitante vai para a fila do dono (pedido livre), nunca para cá.
   ========================================================================== */
import { TIPOS_SECAO, FONTES, higienizar } from './direcao.mjs';
import { operacaoConhecida } from './escopo.mjs';

const PAPEIS_COR = ['fundo', 'superficie', 'texto', 'texto_suave', 'destaque', 'destaque_texto'];
const CAMPOS = ['titulo', 'subtitulo', 'texto', 'cta', 'rotulo'];
const HEX = /^#[0-9a-fA-F]{6}$/;

/* aplica as operações (o código decide; cada uma aplicada ou recusada com motivo) */
export function aplicar({ base, mudancas, direcoes }) {
  const d = JSON.parse(JSON.stringify(base));
  const resultado = [], escopo = [];
  const idx = tipo => d.secoes.findIndex(s => s.tipo === tipo);
  const recusar = (m, motivo) => resultado.push({ ...m, aplicada: false, motivo });
  const ok = m => resultado.push({ ...m, aplicada: true });
  for (const m of mudancas) {
    const outra = Number.isInteger(m.direcao) ? direcoes.find(x => x.numero === m.direcao)?.conteudo : null;
    switch (m.operacao) {
      case 'usar_paleta_de': if (!outra) { recusar(m, 'direção não encontrada'); break; } d.identidade.paleta = { ...outra.identidade.paleta }; d.identidade.estilo.tema = outra.identidade.estilo.tema; ok(m); break;
      case 'usar_tipografia_de': if (!outra) { recusar(m, 'direção não encontrada'); break; } d.identidade.tipografia = { ...outra.identidade.tipografia }; ok(m); break;
      case 'cor': if (!PAPEIS_COR.includes(m.campo) || !HEX.test(m.valor)) { recusar(m, 'cor ou papel inválido'); break; } d.identidade.paleta[m.campo] = m.valor.toUpperCase(); ok(m); break;
      case 'tipografia': if (!['titulos', 'texto'].includes(m.campo) || !FONTES.includes(m.valor)) { recusar(m, 'fonte indisponível'); break; } d.identidade.tipografia[m.campo] = m.valor; ok(m); break;
      case 'tema': if (!['claro', 'escuro'].includes(m.valor)) { recusar(m, 'tema inválido'); break; } d.identidade.estilo.tema = m.valor; ok(m); break;
      case 'mover_antes_de': case 'mover_depois_de': {
        const i = idx(m.secao), j = idx(m.referencia);
        if (i < 0 || j < 0 || i === j) { recusar(m, 'seção não existe nesta direção'); break; }
        if (m.secao === 'hero') { recusar(m, 'a abertura fica no topo'); break; }
        const [s] = d.secoes.splice(i, 1);
        const alvo = idx(m.referencia);
        d.secoes.splice(Math.max(1, m.operacao === 'mover_antes_de' ? alvo : alvo + 1), 0, s);
        ok(m); break;
      }
      case 'remover_secao': { const i = idx(m.secao); if (i < 0 || m.secao === 'hero') { recusar(m, 'seção não pode ser removida'); break; } d.secoes.splice(i, 1); ok(m); break; }
      case 'adicionar_secao': {
        if (!TIPOS_SECAO.includes(m.secao) || idx(m.secao) >= 0) { recusar(m, 'seção inválida ou já existe'); break; }
        const deOutra = direcoes.map(x => x.conteudo?.secoes?.find(s => s.tipo === m.secao)).find(Boolean);
        d.secoes.push(deOutra ? JSON.parse(JSON.stringify(deOutra)) : { tipo: m.secao, variante: 'centro', rotulo: '', titulo: '[' + m.secao + ']', subtitulo: '', texto: '', itens: [], cta: '' });
        ok(m); break;
      }
      case 'trocar_texto': { const i = idx(m.secao); if (i < 0 || !CAMPOS.includes(m.campo) || !m.valor) { recusar(m, 'texto ou seção inválidos'); break; } d.secoes[i][m.campo] = m.valor; ok(m); break; }
      case 'trocar_cta_menu': if (!m.valor) { recusar(m, 'texto vazio'); break; } d.navegacao.cta = m.valor; ok(m); break;
      case 'adicional': case 'paginas': escopo.push(m); ok(m); break;
      /* (o motivo vai para a tela: texto fixo; a descricao do modelo fica só no registro, para a equipe) */
      default: recusar({ ...m, operacao: operacaoConhecida(m.operacao) }, 'não cabe nas alterações automáticas');   /* (nome inventado vira "outro") */
    }
  }
  const h = higienizar(d, base.estrategia);
  if (h.erro) return { erro: h.erro, resultado };
  return { direcao: h.direcao, resultado, escopo };
}
