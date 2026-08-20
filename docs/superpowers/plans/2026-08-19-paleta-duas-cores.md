# Paleta de duas cores — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o site do monocromático dando viagem de matiz à rampa (sombra índigo, âncora ciano intocada) e um contraponto — violeta no repouso, brasa no Singular.

**Architecture:** Duas frentes independentes que não se falam. No CSS mudam só `--deep` e `--mid` (hex + par `-rgb`), e o corpo dos painéis herda a viagem de matiz de graça porque `--painel` já lê esses dois tokens. No canvas entram duas constantes de cor novas e `cor()` ganha um alvo quente opcional, para o violeta virar brasa em vez de atravessar marrom. Nenhum efeito novo, nenhum subsistema novo, nenhuma regra de CSS nova.

**Tech Stack:** HTML/CSS/JS puro. Sem build, sem dependência de runtime, sem test runner.

**Spec:** `docs/superpowers/specs/2026-08-19-paleta-duas-cores-design.md` — lê antes de começar.

## Global Constraints

- **A âncora não se mexe.** `--glow #00F5FF`, `--hi #9FF8FF`, `--core #F2FEFF` ficam exatamente como estão. Qualquer tarefa que os altere está errada.
- **`--alt` não é token de CSS.** Violeta e brasa vivem SÓ como constante em `js/field.js`. A lei do projeto é que a cor do canvas nunca passa pela folha de estilo. Não declarar no `:root`.
- **Hex e `-rgb` mudam juntos.** `--deep`/`--deep-rgb` e `--mid`/`--mid-rgb` são pares. Mudar um e esquecer o outro deixa o site com duas cores diferentes para o mesmo token.
- **Violeta nunca carrega texto.** 4.17 de contraste sobre o painel = AA só em texto grande. Ele é atmosfera, geometria e acento grande.
- **`--mid` continua proibido para texto** (2.89 de contraste). Lei antiga, segue valendo.
- **As 5 leis de performance** (`docs/HANDOFF.md` §4) valem inteiras: nada visual contínuo no CSS, nenhuma variável de CSS por frame, nenhum `B.add` novo.
- **Não há test runner.** O ciclo de teste de cada tarefa são os comandos de verificação escritos em cada passo. Rodar de verdade, não presumir.
- **Processo do dono** (`docs/HANDOFF.md` §11.7): executar → analisar → aprimorar → analisar. Cada tarefa tem um passo de análise antes do commit, e a Task 6 é a revisão de coerência do conjunto.

### Valores exatos (copiar daqui, não recalcular)

Frio (`:root`):

| token | hex | `-rgb` |
|---|---|---|
| `--deep` | `#0B1E3A` | `11 30 58` |
| `--mid` | `#0F5E78` | `15 94 120` |

Quente (`.is-singular`):

| token | hex | `-rgb` |
|---|---|---|
| deep | `#2A0E0C` | `42 14 12` |
| mid | `#8A3A16` | `138 58 22` |

Constantes do canvas (`js/field.js`, formato `'r,g,b'`):

| nome | valor | hex |
|---|---|---|
| `VIOLETA` | `'124,92,255'` | `#7C5CFF` |
| `BRASA` | `'255,107,44'` | `#FF6B2C` |

### Servidor local para verificar no navegador

`npx http-server` **não sobe** neste ambiente (sandbox). Usar node puro. O arquivo já pode existir de sessões anteriores; se não, criar:

```bash
cat > /c/Users/Irineu/AppData/Local/Temp/claude/C--Vault---Fernando-Beyon-0/e1e07a21-11af-4796-bd19-3c4b9d538ee5/scratchpad/srv.js <<'EOF'
const http=require('http'),fs=require('fs'),p=require('path');
const root='C:/Vault - Fernando/Beyon 0';
const mime={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.js':'text/javascript;charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.mp4':'video/mp4'};
http.createServer((q,r)=>{
  let u=decodeURIComponent(q.url.split('?')[0]); if(u==='/')u='/index.html';
  const f=p.join(root,u);
  fs.readFile(f,(e,d)=>{ if(e){r.writeHead(404);r.end('nf');return;}
    r.writeHead(200,{'Content-Type':mime[p.extname(f).toLowerCase()]||'application/octet-stream'}); r.end(d); });
}).listen(8899,'127.0.0.1',()=>console.log('up on 8899'));
EOF
```

Subir em background, depois abrir com `preview_start` em `http://127.0.0.1:8899/index.html` (o `navigate` direto é negado; `preview_start` com `url` funciona).

**Limite conhecido do ambiente:** a aba do agente não compõe frames. `document.hidden` é `true`, `requestAnimationFrame` não roda, screenshot falha, e valor computado de `box-shadow`/`translate` **não atualiza** em resposta a pseudo-classe. Valor computado de **custom property funciona**. Portanto: verificar tokens por `getPropertyValue`, e estado de hover/Singular por inspeção de CSSOM. Não tentar screenshot e não concluir "quebrou" a partir de opacidade 0 durante a entrada.

---

### Task 1: Rampa fria — `--deep` e `--mid` no `:root`

**Files:**
- Modify: `styles.css` (bloco `:root`, as linhas de `--deep`, `--mid`, `--deep-rgb`, `--mid-rgb`)

**Interfaces:**
- Consumes: nada.
- Produces: `--deep-rgb` = `11 30 58` e `--mid-rgb` = `15 94 120`, lidos por `--painel` (corpo dos painéis), `.wa`, `.mock__frame`, `.qa`, `.cta`, `.card`. Nenhuma assinatura de função.

- [ ] **Step 1: Medir o estado atual, para ter com o que comparar**

```bash
cd "C:/Vault - Fernando/Beyon 0" && node -e '
function hex(h){h=h.replace("#","");return [0,2,4].map(i=>parseInt(h.substr(i,2),16));}
function hue(c){const [r,g,b]=c.map(v=>v/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
 if(!d)return 0; let h; if(mx===r)h=((g-b)/d)%6; else if(mx===g)h=(b-r)/d+2; else h=(r-g)/d+4; return Math.round(((h*60)+360)%360);}
const r=["#06272B","#0F6A73","#00F5FF","#9FF8FF","#F2FEFF"].map(hex).map(hue);
console.log("matizes hoje:",r.join(", "));
console.log("varredura:",Math.max(...r)-Math.min(...r)+"graus");'
```

Esperado: `matizes hoje: 186, 185, 182, 184, 185` e `varredura: 4graus`.

- [ ] **Step 2: Trocar os quatro valores**

Em `styles.css`, no bloco `:root`, a rampa está assim:

```css
  --void: #000000;
  --deep: #06272B;
  --mid:  #0F6A73;
  --glow: #00F5FF;
```

Trocar as duas linhas do meio por:

```css
  --void: #000000;
  /* índigo, 216° — a sombra deixou de ser "o ciano escuro" e passou a ser uma
     COR diferente da luz. É daí que vem a profundidade: no painel do card, a
     base (216°) e o topo (195°) são matizes distintos, não o mesmo tom em dois
     brilhos. Varredura da rampa: 4° → 70°. */
  --deep: #0B1E3A;
  --mid:  #0F5E78;
```

E, mais abaixo no mesmo bloco, os pares `-rgb`:

```css
  --deep-rgb: 6 39 43;
  --mid-rgb:  15 106 115;
```

viram:

```css
  --deep-rgb: 11 30 58;
  --mid-rgb:  15 94 120;
```

- [ ] **Step 3: Verificar que hex e `-rgb` batem, e que nada mais mudou**

```bash
cd "C:/Vault - Fernando/Beyon 0" && node -e '
const s=require("fs").readFileSync("styles.css","utf8");
const g=(re)=>{const m=s.match(re);return m?m[1].trim():"NAO ENCONTRADO";};
const pares=[["--deep",/--deep:\s*(#[0-9A-Fa-f]{6})/,/--deep-rgb:\s*([\d ]+);/],
             ["--mid",/--mid:\s*(#[0-9A-Fa-f]{6})/,/--mid-rgb:\s*([\d ]+);/]];
let ok=true;
for(const [n,reH,reR] of pares){
  const h=g(reH), r=g(reR);
  const hr=h.replace("#","").match(/../g).map(x=>parseInt(x,16)).join(" ");
  const bate = hr===r.replace(/\s+/g," ");
  if(!bate) ok=false;
  console.log(n, h, "->", r, bate?"BATE":"DIVERGE (esperado "+hr+")");
}
for(const [n,re] of [["--glow",/--glow:\s*(#[0-9A-Fa-f]{6})/],["--hi",/--hi:\s*(#[0-9A-Fa-f]{6})/],["--core",/--core:\s*(#[0-9A-Fa-f]{6})/]]){
  const v=g(re), esperado={"--glow":"#00F5FF","--hi":"#9FF8FF","--core":"#F2FEFF"}[n];
  if(v.toUpperCase()!==esperado){ok=false;console.log(n,"ALTERADO INDEVIDAMENTE:",v);}
  else console.log(n,v,"intocado ok");
}
process.exit(ok?0:1);'
```

Esperado: `--deep #0B1E3A -> 11 30 58 BATE`, `--mid #0F5E78 -> 15 94 120 BATE`, e as três âncoras `intocado ok`. Exit 0.

- [ ] **Step 4: Verificar que o CSS ainda parseia e não sobrou token órfão**

```bash
cd "C:/Vault - Fernando/Beyon 0" && node -e '
const s=require("fs").readFileSync("styles.css","utf8");
let d=0,min=0; for(const c of s.replace(/\/\*[\s\S]*?\*\//g,"")){if(c==="{")d++;else if(c==="}"){d--;if(d<min)min=d;}}
console.log("chaves: saldo",d,"minimo",min);
const def=new Set([...s.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gmi)].map(m=>m[1]));
const use=new Set([...s.matchAll(/var\((--[a-z0-9-]+)/g)].map(m=>m[1]));
console.log("definidos sem uso:",[...def].filter(x=>!use.has(x)).join(", ")||"(nenhum)");
if(d!==0||min<0)process.exit(1);'
```

Esperado: `chaves: saldo 0 minimo 0` e `definidos sem uso: --mid` (o `--mid` hex é documentação da rampa, só o `-rgb` é consumido — é o estado de antes, não uma regressão). **Se aparecer `--alt` aqui, foi declarado no CSS por engano — remover.**

- [ ] **Step 5: Confirmar o contraste do texto sobre o painel novo**

```bash
cd "C:/Vault - Fernando/Beyon 0" && node -e '
function over(f,a,b){return [0,1,2].map(i=>f[i]*a+b[i]*(1-a));}
function lum(c){const f=c.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*f[0]+0.7152*f[1]+0.0722*f[2];}
function cr(a,b){const l1=Math.max(lum(a),lum(b)),l2=Math.min(lum(a),lum(b));return (l1+0.05)/(l2+0.05);}
const K=[0,0,0], deep=[11,30,58], mid=[15,94,120];
const glow=[0,245,255], hi=[159,248,255], core=[242,254,255];
const t=0.5/0.42>1?(0.5-0.42)/0.58:0, painel=over(deep,0.78+(0.40-0.78)*t,K);
let falhou=false;
for(const [n,c,a] of [["core",core,1],["hi cheio",hi,1],["hi .74",hi,0.74],["glow",glow,1]]){
  const v=cr(over(c,a,painel),painel);
  if(v<4.5)falhou=true;
  console.log(n.padEnd(10),v.toFixed(2),v>=4.5?"AA ok":"REPROVA");
}
console.log("borda ciano .30:",cr(over(glow,0.30,painel),painel).toFixed(2),"(alvo ~2.28)");
process.exit(falhou?1:0);'
```

Esperado: os quatro textos `AA ok` (core ~17.6, hi cheio ~15.0, hi .74 ~8.6, glow ~13.4) e borda ~2.28. Exit 0.

- [ ] **Step 6: Confirmar no navegador que os tokens resolveram**

Subir o servidor (ver Global Constraints), abrir com `preview_start` em `http://127.0.0.1:8899/index.html`, e rodar:

```js
(function(){var c=document.querySelector('.card'),s=getComputedStyle(c);
return JSON.stringify({deep:s.getPropertyValue('--deep-rgb').trim(),
 mid:s.getPropertyValue('--mid-rgb').trim(), glow:s.getPropertyValue('--glow-rgb').trim(),
 painel:s.backgroundImage.slice(-120)},null,1);})()
```

Esperado: `deep: "11 30 58"`, `mid: "15 94 120"`, `glow: "0 245 255"`, e o último gradiente do `backgroundImage` mostrando `rgba(15, 94, 120, 0.3)` no topo e `rgba(11, 30, 58, …)` no corpo.

- [ ] **Step 7: ANALISAR (processo do dono)**

Responder por escrito, antes de commitar:
- O painel ficou mais escuro no corpo? Se sim, a borda em `.30` ainda separa do fundo, ou precisa subir?
- `.wa` (botão do WhatsApp) usa `--mid-rgb` a 50% — o índigo/petróleo novo ainda lê como "verde WhatsApp o suficiente" ou virou azul demais?
- `.mock__frame` usa `--deep-rgb` a .95/.62 nas três molduras — as miniaturas ficaram azuis demais?

Se algum destes falhar, ajustar **agora** e repetir do Step 3.

- [ ] **Step 8: Commit**

```bash
cd "C:/Vault - Fernando/Beyon 0" && git add styles.css && git commit -m "feat: rampa fria ganha viagem de matiz (deep 186->216, mid 185->195)

A rampa era um matiz so (4 graus de variacao) — e disso que vinha a
sensacao monocromatica, nao de falta de saturacao. A sombra passa a ser
uma COR diferente da luz: no painel do card a base fica em 216 graus e o
topo em 195, em vez do mesmo tom em dois brilhos. Varredura 4 -> 70.

Ancora intocada: glow #00F5FF, hi e core exatamente como estavam.

Contraste do texto sobre o painel MELHOROU (hi .74 vai de 8.39 para 8.57;
todos passam AA) porque o indigo e um pouco mais escuro no corpo que o
teal. Borda dos cards fica em 2.28 vs 2.31 — a calibragem de 01c990d
segue de pe.

Spec: docs/superpowers/specs/2026-08-19-paleta-duas-cores-design.md"
```

---

### Task 2: Rampa quente — o remap do `.is-singular`

**Files:**
- Modify: `styles.css` (bloco `.is-singular`, as linhas `--mid-rgb` e `--deep-rgb`)

**Interfaces:**
- Consumes: os tokens da Task 1 (o `.is-singular` sobrescreve `--deep-rgb`/`--mid-rgb` herdados do `:root`).
- Produces: `--deep-rgb` = `42 14 12` e `--mid-rgb` = `138 58 22` dentro do estado Singular.

- [ ] **Step 1: Trocar os dois valores**

Em `styles.css`, o bloco `.is-singular` está assim:

```css
.is-singular {
  --glow: var(--gold);   --glow-rgb: var(--gold-rgb);
  --hi:  #ffe6b0;        --hi-rgb:  255 230 176;   /* ciano claro → ouro claro */
  --core: #ffffff;       --core-rgb: 255 255 255;  /* tira o leve tint ciano do core */
  --mid-rgb: 176 130 54;                            /* teal → ouro escuro */
  --deep-rgb: 34 24 8;                              /* base do card: teal escuro → marrom quente */
}
```

Trocar as duas últimas linhas por:

```css
  /* O quente era mono-ouro: marrom #221808 → ouro → branco, 4,1° de variação
     (recalculado — o mesmo problema monocromático do frio antigo, mesmo número).
     Agora ele ESPELHA a estrutura do frio — sombra, âncora, luz, contraponto.
     Brasa 4° na sombra e terracota 19° no meio; o ouro segue sendo a âncora,
     intocado. Varredura 4,1° → 37°, com faixa de leveza de 5% a 100%.
     "Zero verde" continua garantido: não sobra nenhum token teal aqui. */
  --mid-rgb: 138 58 22;                             /* teal → terracota */
  --deep-rgb: 42 14 12;                             /* base do card: teal escuro → brasa */
```

- [ ] **Step 2: Verificar os valores e o "zero verde"**

```bash
cd "C:/Vault - Fernando/Beyon 0" && node -e '
const s=require("fs").readFileSync("styles.css","utf8");
const bloco=s.match(/\.is-singular\s*\{[\s\S]*?\}/)[0];
const g=re=>{const m=bloco.match(re);return m?m[1].trim().replace(/\s+/g," "):"AUSENTE";};
const deep=g(/--deep-rgb:\s*([\d ]+);/), mid=g(/--mid-rgb:\s*([\d ]+);/);
console.log("deep quente:",deep, deep==="42 14 12"?"ok":"ERRADO");
console.log("mid quente: ",mid,  mid==="138 58 22"?"ok":"ERRADO");
function hue(c){const [r,g2,b]=c.map(v=>v/255),mx=Math.max(r,g2,b),mn=Math.min(r,g2,b),d=mx-mn;
 if(!d)return 0; let h; if(mx===r)h=((g2-b)/d)%6; else if(mx===g2)h=(b-r)/d+2; else h=(r-g2)/d+4; return Math.round(((h*60)+360)%360);}
const hs=[deep,mid].map(v=>hue(v.split(" ").map(Number)));
console.log("matizes quentes:",hs.join(", "),"— nenhum pode cair entre 60 e 300 (verde/azul)");
const verde=hs.some(h=>h>=60&&h<=300);
console.log(verde?"FALHOU: sobrou matiz frio no Singular":"zero verde ok");
process.exit((deep==="42 14 12"&&mid==="138 58 22"&&!verde)?0:1);'
```

Esperado: ambos `ok`, matizes `4, 19`, `zero verde ok`. Exit 0.

- [ ] **Step 3: Confirmar no navegador com o Singular ligado**

Com o servidor de pé e a página aberta:

```js
(function(){var c=document.querySelector('.card');
document.body.classList.add('is-singular');
var s=getComputedStyle(c);
var r={deep:s.getPropertyValue('--deep-rgb').trim(), mid:s.getPropertyValue('--mid-rgb').trim(),
 glow:s.getPropertyValue('--glow-rgb').trim(), hi:s.getPropertyValue('--hi-rgb').trim()};
document.body.classList.remove('is-singular');
return JSON.stringify(r,null,1);})()
```

Esperado: `deep: "42 14 12"`, `mid: "138 58 22"`, `glow: "255 201 107"` (o ouro), `hi: "255 230 176"`.

Lembrete do ambiente: `box-shadow` computado **não** vai atualizar aqui — isso é a aba congelada, não bug. Custom property atualiza, e é o que este passo mede.

- [ ] **Step 4: ANALISAR (processo do dono)**

- O painel do card no Singular ficou legível? `deep 42 14 12` é mais claro que o `34 24 8` antigo — o texto branco/ouro ainda separa?
- A pergunta de espelho: frio é sombra-índigo → âncora-ciano → luz-branca; quente ficou sombra-brasa → âncora-ouro → luz-branca. Bate de verdade ou o quente ficou mais raso?

Ajustar agora se falhar, e repetir do Step 2.

- [ ] **Step 5: Commit**

```bash
cd "C:/Vault - Fernando/Beyon 0" && git add styles.css && git commit -m "feat: rampa quente espelha a fria (brasa na sombra, terracota no meio)

O Singular era mono-ouro: marrom -> ouro -> branco, ~20 graus de
variacao — o mesmo problema monocromatico do repouso, em quente. Agora
tem a mesma estrutura de tres passos mais contraponto: brasa 4 graus na
sombra, terracota 19 no meio, ouro como ancora (intocado), branco na luz.
Varredura ~20 -> 37 graus, com leveza de 5% a 100%.

'Zero verde' segue garantido e agora verificado por script: nenhum token
da rampa quente cai na faixa fria.

Spec: docs/superpowers/specs/2026-08-19-paleta-duas-cores-design.md"
```

> **Correção (revisão da Task 6):** a mensagem de commit acima, reproduzida verbatim porque
> já está no histórico do git (commit `0fa45f9`) e não pode ser reescrita, cita "~20 graus"
> para a varredura do quente antigo. O valor real, recalculado dos hex originais
> (`#221808` → `#B08236` → `#FFC96B` → `#FFE6B0`), é **4,1°** — idêntico ao do frio antigo,
> não um número diferente. `docs/design-tokens.md` e o spec são a fonte da verdade para o
> número; esta página mantém o texto original do commit por fidelidade histórica.

---

### Task 3: `cor()` ganha alvo quente opcional

**Files:**
- Modify: `js/field.js:29` (linha das constantes de cor) e `js/field.js:56-59` (a função `cor`)

**Interfaces:**
- Consumes: nada.
- Produces: duas constantes e uma assinatura nova, usadas pelas Tasks 4 e 5:
  - `VIOLETA` — string `'124,92,255'`
  - `BRASA` — string `'255,107,44'`
  - `cor(base, w, hot, alvo)` — `base` e `alvo` são strings `'r,g,b'`, `w` e `hot` são 0..1, `alvo` é opcional e cai em `OURO` quando ausente. Retorna string `'r,g,b'`. **Os 3-argumentos existentes continuam válidos sem mudança.**

- [ ] **Step 1: Contar os pontos de chamada de `cor()` antes de mexer**

```bash
cd "C:/Vault - Fernando/Beyon 0" && grep -n 'cor(' js/field.js
```

Esperado: a definição em ~l.56 e a linha ~187 com três chamadas (`cor(CIANO, …)`, `cor(ALTA, …)`, `cor(NUCLEO, …)`). Anotar o número: nenhuma delas pode mudar de comportamento nesta tarefa.

- [ ] **Step 2: Adicionar as constantes**

`js/field.js` linha 29 está assim:

```js
  var CIANO = '0,245,255', ALTA = '159,248,255', NUCLEO = '242,254,255', OURO = '255,201,107';
```

Trocar por:

```js
  var CIANO = '0,245,255', ALTA = '159,248,255', NUCLEO = '242,254,255', OURO = '255,201,107';
  /* O CONTRAPONTO da rampa, em dois estados. O ciano é a âncora e não muda; o
     violeta é a segunda cor, e é ele que tira a cena do monocromático.

     Por que ele precisa de um alvo quente PRÓPRIO: se misturasse para OURO como
     todo o resto, em warmth=1 (o reinado do Singular) ele viraria exatamente
     255,201,107 — o MESMO ouro de todas as outras cores. O contraponto
     desapareceria justo no auge do evento, e o estado quente voltaria a ser
     mono-ouro, que é o problema que esta paleta existe para resolver. Com BRASA
     ele fecha em 255,107,44 e continua sendo uma segunda cor.
     (No meio da transição, w=.6, a diferença é de saturação: 203,157,166 malva
     empoeirado pelo caminho do ouro contra 203,101,128 coral pelo da brasa.)

     Estes valores NÃO existem como token de CSS — a cor do canvas nunca passa
     pela folha de estilo. Este é o único lugar onde eles vivem. */
  var VIOLETA = '124,92,255', BRASA = '255,107,44';
```

- [ ] **Step 3: Dar o alvo opcional a `cor()`**

A função está assim:

```js
  function cor(base, w, hot) {
    var c = mistura(base, OURO, w || 0);
    return hot ? mistura(c, BRANCO, hot) : c;
  }
```

Trocar por:

```js
  /* `alvo` é o destino QUENTE da mistura, e é opcional: sem ele cai em OURO,
     então todas as chamadas de três argumentos que já existiam seguem idênticas.
     Só o violeta passa um alvo próprio (BRASA) — ver §2/§3 do tick. */
  function cor(base, w, hot, alvo) {
    var c = mistura(base, alvo || OURO, w || 0);
    return hot ? mistura(c, BRANCO, hot) : c;
  }
```

- [ ] **Step 4: Verificar que a assinatura nova não mudou o comportamento antigo**

```bash
cd "C:/Vault - Fernando/Beyon 0" && node --check js/field.js && node -e '
const OURO="255,201,107", BRANCO="255,255,255", VIOLETA="124,92,255", BRASA="255,107,44";
function mistura(base,alvo,w){ if(w<0.01)return base; if(w>0.99)return alvo;
  var a=base.split(","),b=alvo.split(",");
  return Math.round(+a[0]+(+b[0]-+a[0])*w)+","+Math.round(+a[1]+(+b[1]-+a[1])*w)+","+Math.round(+a[2]+(+b[2]-+a[2])*w);}
function corAntiga(base,w,hot){var c=mistura(base,OURO,w||0);return hot?mistura(c,BRANCO,hot):c;}
function cor(base,w,hot,alvo){var c=mistura(base,alvo||OURO,w||0);return hot?mistura(c,BRANCO,hot):c;}
let ok=true;
for(const base of ["0,245,255","159,248,255","242,254,255"])
 for(const w of [0,0.25,0.5,0.75,1])
  for(const hot of [0,0.3,0.8,1]){
   if(corAntiga(base,w,hot)!==cor(base,w,hot)){ok=false;console.log("DIVERGIU",base,w,hot);} }
console.log(ok?"3-argumentos: identico ao antigo em 60 combinacoes":"REGRESSAO");
console.log("");
console.log("w=1 (reinado do Singular) — o problema que o alvo resolve:");
console.log("  violeta->OURO :",cor(VIOLETA,1,0),  "<- igual a TODAS as outras cores");
console.log("  violeta->BRASA:",cor(VIOLETA,1,0,BRASA),"<- segue sendo uma segunda cor");
console.log("w=0.6 (meio da transicao) — diferenca de saturacao:");
console.log("  violeta->OURO :",cor(VIOLETA,0.6,0),  "malva empoeirado");
console.log("  violeta->BRASA:",cor(VIOLETA,0.6,0,BRASA),"coral quente");
process.exit(ok?0:1);'
```

Esperado, exatamente:

```
3-argumentos: identico ao antigo em 60 combinacoes

w=1 (reinado do Singular) — o problema que o alvo resolve:
  violeta->OURO : 255,201,107 <- igual a TODAS as outras cores
  violeta->BRASA: 255,107,44 <- segue sendo uma segunda cor
w=0.6 (meio da transicao) — diferenca de saturacao:
  violeta->OURO : 203,157,166 malva empoeirado
  violeta->BRASA: 203,101,128 coral quente
```

Exit 0. A linha que importa é a primeira do bloco `w=1`: sem o alvo próprio, o
contraponto **desaparece no auge do Singular** e o estado quente volta a ser
mono-ouro.

- [ ] **Step 5: ANALISAR**

Confirmar que nenhum ponto de chamada existente foi editado (`git diff js/field.js` deve mostrar só as duas constantes novas e a linha da assinatura + comentários). Se o diff tocar a linha ~187, reverter essa parte.

- [ ] **Step 6: Commit**

```bash
cd "C:/Vault - Fernando/Beyon 0" && git add js/field.js && git commit -m "refactor: cor() aceita alvo quente opcional, e entram VIOLETA e BRASA

Toda cor do canvas passa por cor(base, warmth, whiteHot), que misturava
tudo para o mesmo OURO. Violeta misturando para ouro atravessa marrom
sujo no meio da transicao do Singular, entao ele precisa do proprio alvo
quente. O parametro e opcional e cai em OURO quando ausente: verificado
que as chamadas de 3 argumentos ficam identicas em 60 combinacoes de
warmth x whiteHot.

Nenhum ponto de chamada mudou nesta etapa — so a assinatura e as
constantes. As cores entram em uso nas etapas seguintes.

Spec: docs/superpowers/specs/2026-08-19-paleta-duas-cores-design.md"
```

---

### Task 4: Violeta na atmosfera — partículas fracas, brumas, aurora profunda

**Files:**
- Modify: `js/field.js` — a linha de resolução de cores (~l.187), §1 partículas (~l.215-222), §2 brumas (~l.226-230), §2b aurora do Singular (~l.236-246)

**Interfaces:**
- Consumes: `VIOLETA`, `BRASA`, `cor(base, w, hot, alvo)` da Task 3.
- Produces: variável local `vio` no escopo de `tick()`, disponível para a Task 5.

- [ ] **Step 1: Resolver o violeta uma vez por frame, junto com as outras cores**

A linha ~187 está assim:

```js
    var cy = cor(CIANO, w, hot * .55), alta = cor(ALTA, w, hot * .8), nuc = cor(NUCLEO, w, hot);
```

Trocar por:

```js
    var cy = cor(CIANO, w, hot * .55), alta = cor(ALTA, w, hot * .8), nuc = cor(NUCLEO, w, hot);
    /* o contraponto, resolvido UMA vez por frame como os outros. Alvo quente
       próprio: no Singular ele vira brasa, não ouro. Ganho de branco igual ao
       do ciano (.55) — ele é uma cor de base, não a fonte de luz. */
    var vio = cor(VIOLETA, w, hot * .55, BRASA);
```

- [ ] **Step 2: Partículas — a faixa mais fraca vira violeta**

O bloco §1 tem esta linha (~l.215-217):

```js
      var br = (.18 + p.f * .3) * lum;
      ctx.fillStyle = 'rgba(' + cy + ',' + a1(br).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + sing * .5), 0, TAU); ctx.fill();
```

Trocar por:

```js
      var br = (.18 + p.f * .3) * lum;
      /* DUAS FAIXAS. `p.f` é a fase própria da partícula (.3 a 1.0) e já decide
         o brilho; agora decide também a cor. As fracas são violeta, as fortes
         ciano — então o campo tem profundidade cromática em vez de ser uma só
         cor em brilhos diferentes. O corte é o MESMO .55 que o núcleo branco do
         Singular já usava logo abaixo: nenhum dado novo por partícula. */
      ctx.fillStyle = 'rgba(' + (p.f > .55 ? cy : vio) + ',' + a1(br).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + sing * .5), 0, TAU); ctx.fill();
```

- [ ] **Step 3: Brumas — a camada mais profunda da cena vira violeta**

O bloco §2 está assim:

```js
    if (orc > .8) {
      var t = S.t * .001;
      halo(W * .5 + Math.cos(t * .21) * W * .2, H * .38 + Math.sin(t * .17) * H * .15,
           Math.min(W, H) * .5, cy, .022 * lum);
    }
```

Trocar o `cy` por `vio`:

```js
    if (orc > .8) {
      var t = S.t * .001;
      /* a bruma é a camada mais profunda e difusa da cena — é o lugar natural do
         contraponto: tinge o fundo sem competir com nada que precise ser lido. */
      halo(W * .5 + Math.cos(t * .21) * W * .2, H * .38 + Math.sin(t * .17) * H * .15,
           Math.min(W, H) * .5, vio, .022 * lum);
    }
```

- [ ] **Step 4: Aurora do Singular — a cortina de baixo vira o contraponto**

O bloco §2b tem duas cortinas. A de cima usa `alta`, a de baixo usa `cy`. A de baixo é a banda profunda:

```js
      var gb = ctx.createLinearGradient(0, H, 0, H * .45);
      gb.addColorStop(0, 'rgba(' + cy + ',' + (.12 * au).toFixed(3) + ')');
      gb.addColorStop(1, 'rgba(' + cy + ',0)');
      ctx.fillStyle = gb; ctx.fillRect(0, H * .45, W, H * .55);
```

Trocar por (nota: a variável foi renomeada para `gBaixo` — havia um `var gb`
diferente, um número, no bloco de overdrive mais abaixo na MESMA função; os dois
não colidiam por sorte de ordem de execução, e um nome próprio remove a
armadilha):

```js
      var gBaixo = ctx.createLinearGradient(0, H, 0, H * .45);
      gBaixo.addColorStop(0, 'rgba(' + vio + ',' + (.12 * au).toFixed(3) + ')');
      gBaixo.addColorStop(1, 'rgba(' + vio + ',0)');
      ctx.fillStyle = gBaixo; ctx.fillRect(0, H * .45, W, H * .55);
```

- [ ] **Step 5: Verificar sintaxe e que a colisão de nome sumiu**

```bash
cd "C:/Vault - Fernando/Beyon 0" && node --check js/field.js && echo "sintaxe ok" && echo "--- ocorrencias de gb (deve sobrar so o overdrive) ---" && grep -n '\bgb\b' js/field.js && echo "--- gBaixo (a aurora renomeada) ---" && grep -c '\bgBaixo\b' js/field.js && echo "--- usos de vio ---" && grep -n '\bvio\b' js/field.js
```

Esperado: `sintaxe ok`; `gb` aparecendo **só** nas duas linhas do overdrive (a declaração
`var NB = 12, gb = S.t * .008;` e o uso em `var ab = gb + …`); `gBaixo` **4** vezes; e `vio`
na declaração + 4 usos (partícula, bruma, e os dois `addColorStop` da aurora).

**Não use `grep -c 'var gb'` aqui.** O `gb` do overdrive é declarado numa lista de vírgulas
(`var NB = 12, gb = …`), então o literal `var gb` não casa com ele — o check daria 0 e pareceria
falha quando está tudo certo. Casar a palavra (`\bgb\b`) é o que funciona.

- [ ] **Step 6: ANALISAR (processo do dono)**

- **A pergunta de ecoar:** o violeta responde ao organismo? Ele passa por `cor(…, w, hot*.55, BRASA)`, então no Singular ele esquenta junto com todo o resto — sim. Confirmar que `w` e `hot` estão sendo passados (não zerados).
- **No celular:** a bruma é a camada mais visível num aparelho pequeno e é agora 100% violeta. Isso puxou a cena para o violeta mais do que devia? Se sim, o ajuste é baixar a alfa da bruma (`.022` → `.016`) ou dividi-la em duas (uma violeta, uma ciano).
- **As partículas:** com o corte em `.55`, quantas ficam violeta? Com `p.f` uniforme em .3–1.0, o corte cai em ~36% violeta / 64% ciano. Parece equilibrado ou o violeta domina?

Ajustar agora se falhar, e repetir do Step 5.

- [ ] **Step 7: Commit**

```bash
cd "C:/Vault - Fernando/Beyon 0" && git add js/field.js && git commit -m "feat: violeta na atmosfera do campo (particulas fracas, brumas, aurora)

O contraponto entra onde nao compete com nada legivel: as particulas de
faixa fraca (corte no mesmo p.f > .55 que o nucleo branco do Singular ja
usava — nenhum dado novo por particula), a bruma profunda e a cortina de
baixo da aurora do Singular.

O violeta ECOA o organismo como manda a lei 4 do HANDOFF: passa por
cor(VIOLETA, warmth, whiteHot*.55, BRASA), entao esquenta junto com o
resto no Singular, virando brasa em vez de marrom.

Higiene no caminho: a cortina de baixo da aurora usava 'var gb', mesmo
nome de um numero declarado no bloco de overdrive na MESMA funcao. Nao
colidiam por sorte de ordem de execucao; virou gBaixo.

Spec: docs/superpowers/specs/2026-08-19-paleta-duas-cores-design.md"
```

---

### Task 5: Violeta no núcleo do reator e no mini AI Core

**Files:**
- Modify: `js/field.js` — §3 núcleo poligonal (~l.363-373) e §3c mini AI Core (~l.382-421)

**Interfaces:**
- Consumes: `vio` (Task 4), `VIOLETA`/`BRASA`/`cor()` (Task 3).
- Produces: nada para tarefas seguintes.

- [ ] **Step 1: Núcleo poligonal do reator — violeta na geometria, branco no centro**

O bloco §3 está assim:

```js
      /* --- NÚCLEO POLIGONAL: hexágono + triângulo contra-rotativos + plasma --- */
      poligono(cx, cyy, R * .20 * resp, S.t * .006, 6);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + alta + ',' + a1(.4 * lum).toFixed(3) + ')';
      ctx.stroke();
      poligono(cx, cyy, R * .13 * resp, -S.t * .009, 3);
      ctx.strokeStyle = 'rgba(' + nuc + ',' + a1(.3 * lum).toFixed(3) + ')';
      ctx.stroke();
      halo(cx, cyy, R * .18 * (1 + pulso + sing), nuc, (.3 + pulso * .4 + sing * .6) * lum);
      ctx.fillStyle = 'rgba(' + nuc + ',' + a1(.9 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cyy, R * (.045 + sing * .03) * resp, 0, TAU); ctx.fill();
```

Trocar por:

```js
      /* --- NÚCLEO POLIGONAL: hexágono + triângulo contra-rotativos + plasma ---
         AQUI mora a leitura semântica da paleta: o núcleo queima VIOLETA e a
         estrutura em volta (bezel, grade, raios, giroscópio) fica CIANO. A
         inteligência é a segunda cor; a interface é a âncora. O ponto central
         segue BRANCO — é a fonte de luz, e fonte de luz satura ao branco. Por
         isso o hero continua lendo ciano de longe: só o miolo é violeta. */
      poligono(cx, cyy, R * .20 * resp, S.t * .006, 6);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + vio + ',' + a1(.55 * lum).toFixed(3) + ')';
      ctx.stroke();
      poligono(cx, cyy, R * .13 * resp, -S.t * .009, 3);
      ctx.strokeStyle = 'rgba(' + vio + ',' + a1(.42 * lum).toFixed(3) + ')';
      ctx.stroke();
      halo(cx, cyy, R * .18 * (1 + pulso + sing), vio, (.34 + pulso * .4 + sing * .6) * lum);
      ctx.fillStyle = 'rgba(' + nuc + ',' + a1(.9 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cyy, R * (.045 + sing * .03) * resp, 0, TAU); ctx.fill();
```

As alfas subiram um pouco (`.4`→`.55`, `.3`→`.42`, `.3`→`.34`) porque o violeta é mais escuro que `alta`/`nuc` e no valor antigo desapareceria.

- [ ] **Step 2: Mini AI Core — nó violeta**

No bloco §3c, o nó é desenhado assim:

```js
      var resp2 = 1 + Math.sin(S.t * .03) * .05 + pulso * .12;
      halo(hx, hy, hr * 1.5, cy, (.08 + e * .06 + pulso * .16) * lum);
      ctx.strokeStyle = 'rgba(' + cy + ',' + a1(.4 * lum).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hx, hy, hr * .6 * resp2, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + alta + ',' + a1(.28 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(hx, hy, hr * .9, hr * .26, S.t * .01, 0, TAU); ctx.stroke();
      halo(hx, hy, hr * .3 * (1 + pulso), nuc, (.4 + pulso * .4 + S.singular * .4) * lum);
      ctx.fillStyle = 'rgba(' + nuc + ',' + a1(.8 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(hx, hy, hr * .09 * resp2, 0, TAU); ctx.fill();
```

Trocar por:

```js
      var resp2 = 1 + Math.sin(S.t * .03) * .05 + pulso * .12;
      /* o mini AI Core repete a lógica do reator: o NÓ é violeta (é AI Core),
         o ponto central é branco (é luz). Os elos chegando são ciano — a
         transição acontece no Step 3. */
      halo(hx, hy, hr * 1.5, vio, (.10 + e * .06 + pulso * .16) * lum);
      ctx.strokeStyle = 'rgba(' + vio + ',' + a1(.5 * lum).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hx, hy, hr * .6 * resp2, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + vio + ',' + a1(.34 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(hx, hy, hr * .9, hr * .26, S.t * .01, 0, TAU); ctx.stroke();
      halo(hx, hy, hr * .3 * (1 + pulso), nuc, (.4 + pulso * .4 + S.singular * .4) * lum);
      ctx.fillStyle = 'rgba(' + nuc + ',' + a1(.8 * lum).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(hx, hy, hr * .09 * resp2, 0, TAU); ctx.fill();
```

- [ ] **Step 3: Os elos saem ciano e acendem para violeta na chegada ao nó**

O elo hoje é um traço de cor única. Este é o bloco (~l.383-393):

```js
        var sn = servNos[L];
        var pl = prox(S, sn.cx, sn.cy, 300);
        var aL = .06 + e * .05 + pl * .55 + pulso * .3;
        ctx.strokeStyle = 'rgba(' + cy + ',' + a1(Math.min(.6, aL)).toFixed(3) + ')';
        ctx.lineWidth = 1;
        /* curva com controle em (sn.cx, hy): sai do núcleo na horizontal e
           ENCAIXA vertical na base do card — cabo plugado, não linha cruzando. */
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(sn.cx, hy, sn.cx, sn.cy);
        ctx.stroke();
```

Trocar por:

```js
        var sn = servNos[L];
        var pl = prox(S, sn.cx, sn.cy, 300);
        var aL = .06 + e * .05 + pl * .55 + pulso * .3;
        var aLim = a1(Math.min(.6, aL));
        /* O ELO CONTA A HISTÓRIA DA PALETA: sai do card em CIANO (é interface) e
           acende para VIOLETA ao chegar no nó (é AI Core). Um gradiente linear
           do card até o nó — não é um traço de cor única, é a transição entre as
           duas cores da rampa acontecendo no lugar onde ela significa algo. */
        var gElo = ctx.createLinearGradient(sn.cx, sn.cy, hx, hy);
        gElo.addColorStop(0, 'rgba(' + cy + ',' + aLim.toFixed(3) + ')');
        gElo.addColorStop(1, 'rgba(' + vio + ',' + aLim.toFixed(3) + ')');
        ctx.strokeStyle = gElo;
        ctx.lineWidth = 1;
        /* curva com controle em (sn.cx, hy): sai do núcleo na horizontal e
           ENCAIXA vertical na base do card — cabo plugado, não linha cruzando. */
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(sn.cx, hy, sn.cx, sn.cy);
        ctx.stroke();
```

**Nota de custo:** isto troca uma string de cor por um `createLinearGradient` por elo, por frame — até 6 elos. O `docs/HANDOFF.md` §4 já mediu gradientes em ~1ms para 64 halos, então 6 gradientes é ruído. Ainda assim, medir no Step 5.

- [ ] **Step 4: Verificar sintaxe e que a estrutura do reator NÃO virou violeta**

Este é o check crítico da tarefa: prova que a estrutura do reator continua ciano.

```bash
cd "C:/Vault - Fernando/Beyon 0" && node --check js/field.js && echo "sintaxe ok" && node -e '
const L=require("fs").readFileSync("js/field.js","utf8").split(/\r?\n/);
const idx=t=>L.findIndex(l=>l.includes(t));
const bezel=idx("BEZEL GRADUADO"), nucleo=idx("POLIGONAL");
const estrutura=L.slice(bezel,nucleo);
const usos=estrutura.map((l,i)=>({n:bezel+i+1,l:l.trim()})).filter(x=>/\bvio\b/.test(x.l));
console.log("estrutura do reator: linhas "+(bezel+1)+" a "+nucleo);
console.log("usos de vio na estrutura: "+usos.length+"  "+(usos.length===0?"CORRETO":"VIOLACAO"));
usos.forEach(u=>console.log("   l."+u.n+": "+u.l));
console.log("linhas com vio no arquivo: "+L.filter(l=>/\bvio\b/.test(l)).length);
process.exit(usos.length===0?0:1);'
```

Esperado: `sintaxe ok`, `usos de vio na estrutura: 0  CORRETO`, e 12 linhas com `vio` no
arquivo (1 declaração + 4 da atmosfera + 3 do núcleo + 1 do gradiente do elo + 3 do nó do mini
core). Exit 0.

**Não use `sed -n '/BEZEL GRADUADO/,/NUCLEO POLIGONAL/p'` aqui.** O cabeçalho no arquivo é
`NÚCLEO POLIGONAL` **com acento**, e em Git Bash o padrão sem acento não casa: o range do `sed`
vaza até o fim do arquivo e o check retorna 5 em vez de 0 — parece violação com tudo correto.
Casar por `POLIGONAL` (sem a palavra acentuada) em node resolve.

- [ ] **Step 5: Medir o custo de frame**

Com o servidor de pé, abrir `http://127.0.0.1:8899/index.html?perf=1` e rodar:

```js
JSON.stringify(window.__frame(300), null, 1)
```

Esperado: `msPorFrame` na mesma ordem de grandeza de antes (o campo custava ~1ms para a cena inteira). Se passar de ~2ms, os 6 gradientes dos elos são o suspeito — trocar por cor única no elo e manter o gradiente só quando `pl > 0` (elo sob o cursor).

Registrar o número medido no commit.

- [ ] **Step 6: ANALISAR (processo do dono)**

- **O hero ainda lê ciano de longe?** Essa era a condição da escolha do dono. Se o núcleo violeta dominar a peça, reduzir as alfas do Step 1.
- **O núcleo conversa com a estrutura ou briga?** Violeta 252° contra ciano 182° são 70° — é para conversar. Se estiver brigando, o meio-termo é puxar o violeta para ~235° (mais azul, menos roxo).
- **O elo lê como transição ou como "duas linhas de cor diferente"?** Se ficou abrupto, mover o `addColorStop` de meio (ex.: ciano em 0, ciano em .45, violeta em 1) para o violeta aparecer só perto do nó.
- **No Singular:** o núcleo violeta virou brasa e o ponto central branco — ou ficou marrom? Se marrom, o `alvo` não está chegando em `cor()`.

Ajustar agora se falhar, e repetir do Step 4.

- [ ] **Step 7: Commit**

```bash
cd "C:/Vault - Fernando/Beyon 0" && git add js/field.js && git commit -m "feat: nucleo do reator e mini AI Core queimam violeta, estrutura fica ciano

A leitura semantica da paleta: a inteligencia e a segunda cor, a
interface e a ancora. O nucleo poligonal e o plasma do reator viram
violeta; bezel, grade concentrica, raios e os tres aneis do giroscopio
seguem ciano — verificado por script que nenhum deles usa a cor nova.
O ponto central de ambos os nucleos segue BRANCO, porque fonte de luz
satura ao branco. Por isso o hero continua lendo ciano de longe.

Os elos do mini core agora sao um gradiente: saem CIANO no card e acendem
para VIOLETA no no. A transicao entre as duas cores da rampa acontece
exatamente onde ela significa algo.

Alfas do nucleo subiram (.4->.55, .3->.42) porque o violeta e mais escuro
que alta/nuc e desapareceria nos valores antigos.

Spec: docs/superpowers/specs/2026-08-19-paleta-duas-cores-design.md"
```

---

### Task 6: Revisão de coerência e fechamento

Esta tarefa é o segundo "analisar" do processo do dono. Não adiciona nada — verifica o conjunto e corrige o que a análise achar.

**Files:**
- Modify: `docs/design-tokens.md`, `docs/HANDOFF.md` (registrar a paleta nova e as duas leis revisadas)
- Possivelmente: `styles.css`, `js/field.js` (correções que a revisão achar)

**Interfaces:**
- Consumes: tudo das Tasks 1-5.
- Produces: documentação alinhada com o código.

- [ ] **Step 1: Rodar a bateria completa de verificação**

```bash
cd "C:/Vault - Fernando/Beyon 0" && echo "=== JS ===" && for f in js/*.js; do node --check "$f" || echo "FALHOU $f"; done && echo "todos ok" && echo "" && echo "=== CSS chaves ===" && node -e '
const s=require("fs").readFileSync("styles.css","utf8").replace(/\/\*[\s\S]*?\*\//g,"");
let d=0,min=0; for(const c of s){if(c==="{")d++;else if(c==="}"){d--;if(d<min)min=d;}}
console.log("saldo",d,"minimo",min); if(d!==0||min<0)process.exit(1);' && echo "" && echo "=== tokens ===" && node -e '
const s=require("fs").readFileSync("styles.css","utf8");
const def=new Set([...s.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gmi)].map(m=>m[1]));
const use=new Set([...s.matchAll(/var\((--[a-z0-9-]+)/g)].map(m=>m[1]));
console.log("def sem uso:",[...def].filter(x=>!use.has(x)).join(", ")||"(nenhum)");
console.log("uso sem def:",[...use].filter(x=>!def.has(x)).join(", ")||"(nenhum)");' && echo "" && echo "=== nenhum hex de violeta/brasa vazou para o CSS ===" && (grep -niE '7C5CFF|FF6B2C|124, ?92, ?255|255, ?107, ?44' styles.css && echo "VAZOU — remover" || echo "ok, nenhum")
```

Esperado: JS todos ok; chaves saldo 0 mínimo 0; `def sem uso: --mid`; `uso sem def` só os de `@property`/JS (`--nrg`, `--nrg2`, `--nrg3`, `--i`, `--sp-top`, `--sp-bottom`, `--rd`); e nenhum hex de violeta/brasa no CSS.

- [ ] **Step 2: A pergunta de coerência — "tudo ecoa entre si?"**

Responder por escrito, item por item:

1. **O violeta ecoa o organismo?** Lei 4 do HANDOFF: todo efeito contínuo novo tem que ecoar `.is-pulse`/`.is-singular`. O violeta passa por `cor(VIOLETA, w, hot*.55, BRASA)` — esquenta no Singular. E no Pulso? O `pulso` entra nas alfas do núcleo e dos elos. Confirmar que sim nos dois estados, ou corrigir.
2. **A rampa quente espelha a fria de verdade?** Frio: índigo 216 → ciano 182 → branco, contraponto violeta 252. Quente: brasa 4 → ouro 38 → branco, contraponto brasa 18. Conferir que os dois têm três passos + contraponto e que nada ficou órfão.
3. **A âncora sobreviveu?** `--glow`, `--hi`, `--core` byte-a-byte iguais ao que eram antes desta série de commits: `git diff 01c990d..HEAD -- styles.css | grep -E '^\+.*--(glow|hi|core):'` deve sair vazio.
4. **O painel dos três componentes continua igual entre si?** `.card`, `.qa` e `.cta` leem o mesmo `--painel`. Confirmar que nenhuma tarefa quebrou isso.

- [ ] **Step 3: Atualizar `docs/design-tokens.md`**

Adicionar no topo do arquivo, acima do bloco "REV 2", um bloco novo:

```markdown
> **REV 3 (2026-08-19, decisão do dono): a rampa deixa de ser de matiz único.**
> O diagnóstico foi que a rampa tinha 4° de variação de matiz — era isso que
> lia monocromático, não falta de saturação. Agora ela tem uma ÂNCORA e um
> CONTRAPONTO.
>
> Repouso: `--void #000000 · --deep #0B1E3A (216°) · --mid #0F5E78 (195°) ·`
> `--glow #00F5FF (182°, âncora, INTOCADA) · --hi #9FF8FF · --core #F2FEFF`
> Contraponto: **violeta `#7C5CFF` (252°)**. Varredura 4° → 70°.
>
> Singular: `deep #2A0E0C (4°) · mid #8A3A16 (19°) · glow #FFC96B (38°, âncora)`
> `· hi #FFE6B0 · core #FFFFFF`. Contraponto: **brasa `#FF6B2C` (18°)** — é
> nela que o violeta se transforma. Varredura 4,1° → 37° — o quente antigo tinha
> exatamente o mesmo problema que o frio antigo (4,1° nos dois), não um número diferente.
>
> **Violeta e brasa NÃO são tokens de CSS.** A cor do canvas nunca passa pela
> folha de estilo; eles vivem como constantes em `js/field.js`.
> **Violeta nunca carrega texto** (4.17 sobre o painel = AA só em texto grande).
> `--mid` segue reprovando para texto (2.89) e segue proibido.
> Spec: `docs/superpowers/specs/2026-08-19-paleta-duas-cores-design.md`.
```

> Nota (revisão da Task 6): o template acima, escrito antes do recálculo, dizia "~20°".
> O valor executado em `docs/design-tokens.md` já foi corrigido para 4,1° — ver aquele
> arquivo, que é a fonte da verdade.

- [ ] **Step 4: Atualizar `docs/HANDOFF.md` §5**

O §5 diz "Rampa ciano, matiz único. Nenhum hex fora dela em repouso." e lista a rampa antiga. Atualizar a lista para os valores novos e acrescentar, no padrão das exceções já registradas ali:

```markdown
**EXCEÇÃO do dono (2026-08-19): "matiz único" foi revogado.** A rampa passa a ter
uma âncora (ciano `#00F5FF`, intocada) mais um contraponto (violeta `#7C5CFF` no
repouso, brasa `#FF6B2C` no Singular). O motivo: com 4° de variação de matiz a
identidade lia monocromática. Varredura agora 70° no frio, 37° no quente.
O **"zero verde" do Singular continua valendo** e agora é verificado por script.
Violeta/brasa vivem em `js/field.js`, não como token de CSS.
Spec: `docs/superpowers/specs/2026-08-19-paleta-duas-cores-design.md`.
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Vault - Fernando/Beyon 0" && git add docs/design-tokens.md docs/HANDOFF.md && git commit -m "docs: REV 3 da paleta — ancora mais contraponto, e as duas leis revisadas

design-tokens.md ganha o bloco REV 3 com a rampa nova nos dois estados e
as regras duras (violeta nunca carrega texto; violeta/brasa nao sao token
de CSS porque a cor do canvas nao passa pela folha de estilo).

HANDOFF §5 registra a excecao do dono no mesmo padrao da excecao do vidro
nos cards: 'matiz unico' foi revogado, 'zero verde' segue valendo."
```

- [ ] **Step 6: Entregar para o olho do dono**

O que só ele pode julgar, e que o ambiente do agente **não** consegue verificar (aba não compõe frames, sem screenshot, sem rAF):

- O hero ainda lê ciano de longe?
- O núcleo violeta conversa com a estrutura ciano ou briga?
- A bruma violeta puxou a cena demais no celular?
- O Singular ficou rico ou sujo?
- `?perf` + `__frame()` no aparelho dele — o custo de frame mudou?

Listar os números medidos e dizer explicitamente o que ficou sem verificação visual.

---

## Ordem e dependências

Tasks 1 e 2 (CSS) são independentes das Tasks 3-5 (canvas) — podem ir em qualquer ordem entre si. Dentro do canvas a ordem é obrigatória: **3 antes de 4 antes de 5** (a 4 usa `cor()` da 3 e declara o `vio` que a 5 consome). Task 6 é última.

## Rollback

Cada tarefa é um commit próprio e nenhuma muda comportamento — só cor. `git revert <sha>` de qualquer uma delas devolve o estado anterior sem tocar nas outras. A Task 5 é a mais provável de precisar ajuste fino; a Task 1 é a de maior alcance visual.
