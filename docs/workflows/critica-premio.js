export const meta = {
  name: 'critica-premio',
  description: 'Painel de críticos com lentes distintas avalia o site contra o padrão de sites premiados e devolve um plano priorizado de mudanças',
  phases: [{ title: 'Crítica', detail: '4 lentes em paralelo sobre screenshots e código' }, { title: 'Síntese', detail: 'dedupe, prioriza e escreve o plano' }],
}
const CONTEXTO = `Site: C:\\Vault - Fernando\\Beyon Zero\\03 Projetos\\site (estático, HTML + CSS + scripts clássicos, GSAP vendorado, sem build). Branch rebuild-v2, versão V4.1 "Tech refinado". Direção: docs/restructure/DIRECAO-V4.md. Screenshots atuais em ${args.pasta}/ (hub-*, sites-*, automacao-*; sufixo -cel = 390px; sem sufixo = 1440px; números 0-4 = pontos de rolagem). Leia os PNGs com a ferramenta Read para VER o site. Código: css/tokens.css, css/base.css, css/componentes.css, css/motion.css, js/anima.js, index.html, sites.html, automacao.html.

META DO DONO: "só pare quando alcançar o resultado que irá realmente impressionar qualquer um que veja, nos padrões dos sites que ganham prêmios reais" (Awwwards / CSSDA / FWA), mantendo tom sério e profissional, identidade tech escura com ciano + âmbar.

RESTRIÇÕES DURAS (propostas fora disto são inúteis): sem canvas/WebGL/three nesta fase (o AI Core virá depois, há um lugar reservado em .hero__arte); sem dependência nova além do GSAP já vendorado (ScrollTrigger e SplitText disponíveis); CSP sem inline (nada de style="" ou <style>); nenhuma variável de CSS muda por frame; movimento contínuo só transform/opacity no compositor; celular primeiro (390px) e nenhuma caixa mais larga que a viewport; prefers-reduced-motion sem nada escondido; zero dado inventado (nada de "+300 projetos"); fontes locais só Sora e JetBrains Mono; sem ciano+violeta "startup de IA"; sem glow redondo atrás de texto; AA de contraste.`
const ACHADOS = { type: 'object', required: ['nota', 'veredito', 'achados'], properties: {
  nota: { type: 'number', description: 'de 0 a 10: probabilidade de impressionar um júri de prêmio de web design hoje' },
  veredito: { type: 'string', description: 'duas frases: o que já está no nível e o que falta' },
  achados: { type: 'array', items: { type: 'object', required: ['prioridade', 'area', 'problema', 'proposta', 'arquivos'], properties: {
    prioridade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
    area: { type: 'string' },
    problema: { type: 'string', description: 'o que está abaixo do padrão, com a tela/seção onde se vê' },
    proposta: { type: 'string', description: 'mudança CONCRETA e implementável: CSS/HTML/GSAP com valores, não adjetivos' },
    arquivos: { type: 'array', items: { type: 'string' } } } } } } }
const LENTES = [
  { key: 'juri', prompt: 'Você é jurado de prêmio de web design (Awwwards: design 40%, usabilidade 30%, criatividade 20%, conteúdo 10%). Julgue o site como julga os finalistas: o que o separa de um Site of the Day? Primeira impressão do hero, assinatura visual, consistência, acabamento. Seja duro e específico.' },
  { key: 'tipografia', prompt: 'Você é diretor de arte especializado em tipografia e composição editorial. Avalie escala tipográfica, hierarquia, ritmo vertical, grid, alinhamentos, peso das linhas, uso do mono, espaçamentos entre seções, equilíbrio entre texto e vazio, nas duas larguras. Proponha valores exatos (rem, clamp, letter-spacing, line-height).' },
  { key: 'motion', prompt: 'Você é diretor de motion de estúdio premiado. Avalie a coreografia de entrada do hero (js/anima.js), as revelações por seção, micro-interações (hover, foco, botões), o feixe, os planos de vidro, a varredura dos painéis, e proponha o "momento de assinatura" que falta: algo memorável, barato (transform/opacity, GSAP, SVG com stroke-dashoffset permitido), que não dependa de canvas. Detalhe easing, duração, stagger, triggers.' },
  { key: 'celular', prompt: 'Você é especialista em mobile e em detalhe de acabamento. Olhe PRIMEIRO os screenshots -cel (390px). Primeira tela, hierarquia, toque, densidade, barra fixa, espaçamentos, o que parece "desktop encolhido", o que falta de vida no celular. Depois cheque desktop em busca de desalinhamentos, bordas, sombras, cantos, inconsistências de raio/cores/espaços.' },
]
phase('Crítica')
const criticas = (await parallel(LENTES.map(l => () => agent(`${CONTEXTO}\n\nLENTE: ${l.prompt}\n\nLeia os screenshots (Read nos PNGs) e o código antes de opinar. Devolva nota, veredito e de 5 a 10 achados, os de prioridade alta primeiro, cada um com proposta implementável.`, { label: `critica:${l.key}`, phase: 'Crítica', schema: ACHADOS })))).filter(Boolean)
log(`notas: ${criticas.map(c => c.nota).join(' / ')}`)
phase('Síntese')
const PLANO = { type: 'object', required: ['nota_media', 'resumo', 'plano'], properties: {
  nota_media: { type: 'number' }, resumo: { type: 'string' },
  plano: { type: 'array', items: { type: 'object', required: ['ordem', 'impacto', 'titulo', 'como', 'arquivos'], properties: {
    ordem: { type: 'number' }, impacto: { type: 'string', enum: ['alto', 'medio', 'baixo'] }, titulo: { type: 'string' },
    como: { type: 'string', description: 'instrução concreta de implementação, com valores; cita os achados que atende' },
    arquivos: { type: 'array', items: { type: 'string' } } } } } } }
const plano = await agent(`${CONTEXTO}\n\nVocê é o diretor de criação que sintetiza o painel. Aqui estão as críticas de 4 lentes (JSON):\n${JSON.stringify(criticas, null, 1)}\n\nFaça: (1) deduplique; (2) descarte o que viola as restrições; (3) ordene por impacto no veredito do júri e por custo; (4) escreva um plano de no máximo 12 mudanças, cada uma com instrução concreta (CSS/HTML/GSAP com valores). Inclua obrigatoriamente um "momento de assinatura" se algum crítico o pediu. Não edite arquivos.`, { label: 'sintese', phase: 'Síntese', schema: PLANO })
return { rodada: args.rodada, notas: criticas.map(c => ({ nota: c.nota, veredito: c.veredito })), plano }