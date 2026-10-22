/* ==========================================================================
   O FORMULÁRIO DO MATERIAL (PR 3b-2; spec §3, passo 2): 6 blocos curtos, cada campo salvo sozinho; os limites vêm de
   BZMaterialEsquema (o servidor confere de novo). A tela é feita de uma descrição (BLOCOS) e de poucos construtores.
   • Lista vazia não vai: o campo é limpo no servidor (a captação exige ao menos 1 item em toda lista).
   • A caixa de autorização mostra o texto do esquema; o servidor grava ESSE texto.
   • Nada é lido de volta do armazém: a miniatura sai do arquivo no aparelho e some ao recarregar.
   • Tudo que vem do cliente ou do servidor entra por textContent. Celular primeiro: tudo em coluna, controles de 44 px.
   ========================================================================== */
(function () {
  'use strict';
  var ESQ = window.BZMaterialEsquema;
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  var SALVAR_MS = 1200, ESPERA_FREIO_MS = 11000, TENTATIVAS_FREIO = 5;
  var AVISO_DADOS = 'Não escreva CPF, CNPJ nem dados de outras pessoas.';
  var T = function (k, rotulo, min, max, opcional) { return { k: k, rotulo: rotulo, min: min, max: max, opcional: !!opcional }; };

  /* a descrição das telas (spec §3, passo 2): a ordem e os limites são os da spec e do esquema */
  var BLOCOS = [
    { titulo: '1 · Logo e fotos', tipo: 'arquivos' },
    { titulo: '2 · Contatos do site', campos: [
      { campo: 'whatsapp', tipo: 'tel', rotulo: 'WhatsApp dos botões (obrigatório)', dica: 'Com DDD. Ex.: (21) 99999-0000', usarNumero: true },
      { campo: 'telefone', tipo: 'tel', rotulo: 'Telefone para ligação (se quiser)', dica: 'Com DDD' },
      { campo: 'emails', tipo: 'lista', max: 2, rotulo: 'E-mails (até 2)', input: 'email', itemRotulo: 'E-mail', mais: '+ Outro e-mail' },
      { campo: 'redes', tipo: 'lista', max: 4, rotulo: 'Redes sociais (até 4, com https://)', input: 'url', itemRotulo: 'Link da rede', mais: '+ Outra rede' }] },
    { titulo: '3 · Serviços', campos: [
      { campo: 'servicos', tipo: 'objetos', max: 12, rotulo: 'Até 12 serviços', itens: [T('nome', 'Serviço', 2, 60), T('descricao', 'Uma frase (se quiser)', 2, 140, true)], mais: '+ Outro serviço', tirar: 'serviço' }] },
    { titulo: '4 · Onde e quando', campos: [
      { campo: 'negocio.cidade', tipo: 'texto', rotulo: 'Cidade do negócio', max: 80 },
      { campo: 'negocio.uf', tipo: 'uf', rotulo: 'Estado' },
      { campo: 'horario', tipo: 'objetos', max: 7, rotulo: 'Dias e horários (até 7 linhas)', itens: [T('dias', 'Dias', 2, 40), T('horas', 'Horas', 2, 40)], mais: '+ Outra linha', tirar: 'linha' },
      { campo: 'bairros', tipo: 'lista', max: 20, rotulo: 'Bairros atendidos (até 20)', input: 'text', itemRotulo: 'Bairro', mais: '+ Outro bairro' },
      { campo: 'endereco', tipo: 'endereco', rotulo: 'Endereço', max: 120 }] },
    { titulo: '5 · Provas e depoimentos', campos: [
      { campo: 'provas', tipo: 'lista', max: 4, rotulo: 'Provas (até 4)', dica: 'Ex.: garantia de 90 dias, orçamento por escrito', input: 'text', itemRotulo: 'Prova', mais: '+ Outra prova' },
      { campo: 'depoimentos', tipo: 'objetos', max: 3, rotulo: 'Depoimentos (até 3)', itens: [T('texto', 'O que o cliente disse', 5, 300), T('autor', 'Nome do cliente', 2, 60)], mais: '+ Outro depoimento', tirar: 'depoimento',
        pergunta: 'autorizacao.depoimentos_autorizados' }] },
    { titulo: '6 · Cor e envio', tipo: 'envio' }
  ];

  /* ---------- funções puras ---------- */
  function formatarTelefone(e164) {
    var d = String(e164 || '').replace(/\D/g, '').replace(/^55/, '');
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '';
  }
  /* as linhas de uma lista de textos: sem os vazios; nenhuma → null (limpa o campo) */
  function lerLista(valores) {
    var v = valores.map(function (x) { return String(x).trim(); }).filter(Boolean);
    return v.length ? v : null;
  }
  /* as linhas de uma lista de objetos: linha toda vazia sai; falta o obrigatório → false (não salva, avisa); nenhuma → null */
  function lerObjetos(linhas, def) {
    var saida = [];
    for (var i = 0; i < linhas.length; i++) {
      var obj = {}, algum = false, falta = false;
      def.itens.forEach(function (it) {
        var v = String(linhas[i][it.k] == null ? '' : linhas[i][it.k]).trim();
        if (v) { obj[it.k] = v; algum = true; } else if (!it.opcional) falta = true;
      });
      if (!algum) continue;
      if (falta) return false;
      saida.push(obj);
    }
    return saida.length ? saida : null;
  }

  /* M2 (revisão): o freio do servidor (429) não derruba o salvamento: espera 11 s e repete (até 5 vezes), com o valor guardado na própria chamada.
     Só a 429 repete; qualquer outro erro sobe como está. */
  async function repetirNo429(fazer, o) {
    var esperar = (o && o.esperar) || function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
    var vezes = (o && o.vezes) || TENTATIVAS_FREIO;
    for (var t = 0; ; t++) {
      try { return await fazer(); }
      catch (e) {
        if (!e || e.status !== 429 || t >= vezes) throw e;
        if (o && o.aoEsperar) o.aoEsperar();
        await esperar(ESPERA_FREIO_MS);
      }
    }
  }
  /* o campo mudou em relação ao que o servidor já tem? (salvar o mesmo valor de novo só gasta o freio) */
  var chaveDe = function (v) { return JSON.stringify(v === undefined ? null : v); };
  function mudouDe(atual, novo) { return chaveDe(atual) !== chaveDe(novo); }
  /* M3 (revisão): os salvamentos agendados (um por campo; o último valor vale) e os em andamento. "Enviar" chama esvaziar():
     o que está agendado sai na hora, e a promessa só resolve quando tudo terminou (true = tudo salvo) */
  function criarFilaDeSalvamento() {
    var agendados = {}, andando = new Set();
    function executar(fazer) {
      var p = Promise.resolve().then(fazer).then(function (r) { return r !== false; }, function () { return false; });
      andando.add(p); p.then(function () { andando.delete(p); });
      return p;
    }
    return {
      agendar: function (campo, fazer, ms) {
        if (agendados[campo]) clearTimeout(agendados[campo].t);
        agendados[campo] = { fazer: fazer, t: setTimeout(function () { delete agendados[campo]; executar(fazer); }, ms) };
      },
      agora: function (campo, fazer) {
        if (agendados[campo]) { clearTimeout(agendados[campo].t); delete agendados[campo]; }
        return executar(fazer);
      },
      pendentes: function () { return Object.keys(agendados).length; },
      esvaziar: function () {
        Object.keys(agendados).forEach(function (campo) { var a = agendados[campo]; clearTimeout(a.t); delete agendados[campo]; executar(a.fazer); });
        return Promise.all(Array.from(andando)).then(function (r) { return r.every(Boolean); });
      }
    };
  }

  /* ---------- a tela ---------- */
  var estado = null;   /* { id, motor, atual: { dados, negocio, autorizacao }, entrega } */
  var fila = criarFilaDeSalvamento();

  function status() { var s = el('span', 'orc-mat__salvo'); s.setAttribute('role', 'status'); s.setAttribute('aria-live', 'polite'); return s; }
  async function salvar(campo, valor, saida, extra) {
    if (valor === false) { saida.classList.add('is-erro'); saida.textContent = 'Confira esse campo.'; return false; }
    if (!extra && valor !== undefined && !mudouDe(valorAtualDe(campo), valor)) { saida.classList.remove('is-erro'); saida.textContent = 'Salvo'; return true; }   /* nada mudou: não gasta o freio */
    saida.classList.remove('is-erro'); saida.textContent = 'Salvando…';
    try {
      await repetirNo429(function () { return window.BZOrcamento.materialSalvar(campo, valor === undefined ? undefined : valor, extra); },
        { aoEsperar: function () { saida.textContent = 'Aguardando um instante…'; } });   /* M2: espera e repete, sem a pessoa tocar em nada */
      saida.textContent = 'Salvo';
      guardarLocal(campo, valor);
      atualizarEnvio();
      return true;
    } catch (e) { saida.classList.add('is-erro'); saida.textContent = (e && e.message) || 'Não foi possível salvar agora.'; return false; }
  }
  function valorAtualDe(campo) {
    var p = campo.indexOf('.') > 0 ? campo.split('.') : ['dados', campo];
    return estado && estado.atual[p[0]] ? estado.atual[p[0]][p[1]] : undefined;
  }
  function guardarLocal(campo, valor) {
    var p = campo.indexOf('.') > 0 ? campo.split('.') : ['dados', campo];
    estado.atual[p[0]] = Object.assign({}, estado.atual[p[0]]);
    if (valor === null) delete estado.atual[p[0]][p[1]]; else if (valor !== undefined) estado.atual[p[0]][p[1]] = valor;
  }
  function depois(campo, ler, saida) {
    saida.textContent = '';
    fila.agendar(campo, function () { return salvar(campo, ler(), saida); }, SALVAR_MS);
  }
  function aoSair(campo, ler, saida) { fila.agora(campo, function () { return salvar(campo, ler(), saida); }); }

  function campoBase(def) {
    var sec = el('div', 'orc-mat__campo'), id = 'o-mat-' + def.campo.replace(/\./g, '-');
    var lab = el('label', null, def.rotulo); lab.htmlFor = id;
    sec.appendChild(lab);
    if (def.dica) { var d = el('p', 'orc-mat__dica', def.dica); sec.appendChild(d); }
    return { sec: sec, id: id, saida: status() };
  }
  function simples(def, valor) {
    var b = campoBase(def), inp = def.tipo === 'uf' ? el('select') : el('input');
    inp.id = b.id;
    if (def.tipo === 'uf') {
      inp.appendChild(Object.assign(el('option', null, 'Escolha'), { value: '' }));
      ESQ.UFS.forEach(function (u) { inp.appendChild(Object.assign(el('option', null, u), { value: u })); });
      inp.value = valor || '';
    } else {
      inp.type = def.tipo === 'tel' ? 'tel' : 'text';
      if (def.tipo === 'tel') { inp.inputMode = 'tel'; inp.autocomplete = 'off'; inp.value = formatarTelefone(valor); } else { inp.value = valor || ''; inp.autocomplete = 'off'; if (def.max) inp.maxLength = def.max; }
    }
    var ler = function () {
      var v = inp.value.trim();
      if (!v) return null;
      if (def.tipo === 'tel') { var t = ESQ.telefoneE164(v); return t && ESQ.validarCampo(def.campo, t) ? t : false; }
      return ESQ.prepararPatch(def.campo, v, '').ok ? v : false;
    };
    inp.addEventListener('input', function () { inp.dataset.sujo = '1'; depois(def.campo, ler, b.saida); });
    inp.addEventListener('change', function () { aoSair(def.campo, ler, b.saida); inp.dataset.sujo = ''; });
    b.sec.appendChild(inp);
    if (def.usarNumero) {
      var cx = el('label', 'orc-mat__caixa'), c = el('input'); c.type = 'checkbox'; c.id = b.id + '-pedido';
      cx.appendChild(c); cx.appendChild(el('span', null, 'Usar o mesmo número do pedido'));
      c.addEventListener('change', async function () {
        if (!c.checked) return;
        if (await salvar(def.campo, undefined, b.saida, { usar_numero_do_pedido: true })) { await estado.recarregar(); }
        else c.checked = false;
      });
      b.sec.appendChild(cx);
    }
    b.sec.appendChild(b.saida);
    estado.simples.push({ def: def, inp: inp });
    return b.sec;
  }
  function endereco(def, valor) {
    var sec = el('div', 'orc-mat__campo'), cx = el('label', 'orc-mat__caixa'), c = el('input');
    c.type = 'checkbox'; c.checked = !!valor; cx.appendChild(c); cx.appendChild(el('span', null, 'Quero mostrar o endereço no site'));
    sec.appendChild(cx);
    var corpo = el('div'); corpo.hidden = !c.checked;
    var b = simples(def, valor); corpo.appendChild(b); sec.appendChild(corpo);
    c.addEventListener('change', function () {
      corpo.hidden = !c.checked;
      if (!c.checked) { var inp = corpo.querySelector('input'); inp.value = ''; salvar(def.campo, null, corpo.querySelector('.orc-mat__salvo')); }
    });
    return sec;
  }
  function lista(def, valores) {
    var sec = el('fieldset', 'orc-mat__lista'), lg = el('legend', null, def.rotulo), saida = status(), linhas = el('div');
    sec.appendChild(lg);
    if (def.dica) sec.appendChild(el('p', 'orc-mat__dica', def.dica));
    sec.appendChild(linhas);
    var ler = function () {
      var v = lerLista([].map.call(linhas.querySelectorAll('input'), function (i) { return i.value; }));
      return v === null ? null : ESQ.validarCampo(def.campo, v) ? v : false;
    };
    var mais = el('button', 'btn btn--ghost', def.mais); mais.type = 'button';
    function nova(v) {
      var li = el('div', 'orc-mat__linha'), inp = el('input'), tirar = el('button', 'orc-arq__tirar', '×');
      inp.type = def.input; inp.value = v || ''; inp.setAttribute('aria-label', def.itemRotulo); inp.autocomplete = 'off';
      inp.addEventListener('input', function () { depois(def.campo, ler, saida); });
      inp.addEventListener('change', function () { aoSair(def.campo, ler, saida); });
      tirar.type = 'button'; tirar.setAttribute('aria-label', 'Tirar ' + def.itemRotulo.toLowerCase());
      tirar.addEventListener('click', function () { li.remove(); mais.hidden = false; aoSair(def.campo, ler, saida); });
      li.appendChild(inp); li.appendChild(tirar); linhas.appendChild(li);
      mais.hidden = linhas.children.length >= def.max;
      return inp;
    }
    (valores && valores.length ? valores : ['']).forEach(nova);
    mais.addEventListener('click', function () { nova('').focus(); });
    sec.appendChild(mais); sec.appendChild(saida);
    return sec;
  }
  function objetos(def, valores) {
    var sec = el('fieldset', 'orc-mat__lista'), saida = status(), linhas = el('div');
    sec.appendChild(el('legend', null, def.rotulo)); sec.appendChild(linhas);
    var ler = function () {
      var v = lerObjetos([].map.call(linhas.children, function (li) { var o = {}; def.itens.forEach(function (it, i) { o[it.k] = li.querySelectorAll('input')[i].value; }); return o; }), def);
      return v === null ? null : v !== false && ESQ.validarCampo(def.campo, v) ? v : false;
    };
    var mais = el('button', 'btn btn--ghost', def.mais); mais.type = 'button';
    function nova(v) {
      var li = el('div', 'orc-mat__linha orc-mat__linha--obj');
      def.itens.forEach(function (it) {
        var inp = el('input'); inp.type = 'text'; inp.value = (v && v[it.k]) || ''; inp.setAttribute('aria-label', it.rotulo); inp.placeholder = it.rotulo; inp.maxLength = it.max; inp.autocomplete = 'off';
        inp.addEventListener('input', function () { depois(def.campo, ler, saida); });
        inp.addEventListener('change', function () { aoSair(def.campo, ler, saida); });
        li.appendChild(inp);
      });
      var tirar = el('button', 'orc-arq__tirar', '×'); tirar.type = 'button'; tirar.setAttribute('aria-label', 'Tirar ' + def.tirar);
      tirar.addEventListener('click', function () { li.remove(); mais.hidden = false; aoSair(def.campo, ler, saida); });
      li.appendChild(tirar); linhas.appendChild(li);
      mais.hidden = linhas.children.length >= def.max;
      return li.querySelector('input');
    }
    (valores && valores.length ? valores : [null]).forEach(nova);
    mais.addEventListener('click', function () { nova(null).focus(); });
    sec.appendChild(mais);
    if (def.pergunta) sec.appendChild(radios(def.pergunta, 'Esses clientes autorizaram? Só vai para o site se a resposta for Sim.', [['sim', 'Sim', true], ['nao', 'Não', false]], estado.atual.autorizacao.depoimentos_autorizados, function (v) { return v === 'sim'; }));
    sec.appendChild(saida);
    return sec;
  }
  /* escolha única (radio nativo): a resposta vai para autorizacao.* */
  function radios(campo, pergunta, opcoes, atual, paraValor) {
    var sec = el('fieldset', 'orc-mat__radios'), saida = status();
    sec.appendChild(el('legend', null, pergunta));
    opcoes.forEach(function (op) {
      var l = el('label', 'orc-mat__caixa'), r = el('input');
      r.type = 'radio'; r.name = 'o-mat-' + campo.replace(/\./g, '-'); r.value = op[0];
      r.checked = op[2] !== undefined && op[2] === atual || op[0] === atual;
      r.addEventListener('change', function () { salvar(campo, paraValor ? paraValor(op[0]) : op[0], saida); });
      l.appendChild(r); l.appendChild(el('span', null, op[1])); sec.appendChild(l);
    });
    sec.appendChild(saida);
    return sec;
  }

  /* ----- bloco 1: logo e fotos ----- */
  var TIPOS_ACEITOS = 'image/jpeg,image/png,image/webp';
  function arquivos(corpo) {
    var motor = estado.motor;
    function escolher(rotulo, papel, multiplo) {
      var b = el('button', 'btn btn--primary', rotulo), inp = el('input');
      b.type = 'button'; inp.type = 'file'; inp.accept = TIPOS_ACEITOS; inp.multiple = !!multiplo; inp.hidden = true;
      b.addEventListener('click', function () { inp.click(); });
      inp.addEventListener('change', function () { motor.adicionar([].slice.call(inp.files), papel); inp.value = ''; });
      var w = el('div', 'orc-mat__acoes'); w.appendChild(b); w.appendChild(inp); return w;
    }
    corpo.appendChild(el('p', 'orc-mat__dica', 'JPG, PNG ou WebP. As fotos grandes são reduzidas aqui no seu aparelho antes de enviar.'));
    corpo.appendChild(escolher('Escolher a logo', 'logo', false));
    var ulLogo = el('ul', 'orc-arq'); ulLogo.id = 'o-arq-logo'; corpo.appendChild(ulLogo);
    var contador = el('p', 'orc-mat__dica'); contador.id = 'o-arq-contador';
    corpo.appendChild(escolher('Escolher fotos', 'foto', true)); corpo.appendChild(contador);
    var ulFotos = el('ul', 'orc-arq'); ulFotos.id = 'o-arq-fotos'; corpo.appendChild(ulFotos);
    corpo.appendChild(radios('autorizacao.fotos_com_pessoas', 'As pessoas que aparecem nas fotos autorizaram?', [['sim', 'Sim'], ['nao_tem', 'Não tem pessoa'], ['nao_sei', 'Não sei']], estado.atual.autorizacao.fotos_com_pessoas));
  }
  /* M4 (revisão): a lista é reconciliada, não refeita. Cada linha guarda a sua "chave" (forma: estado, erro e papel); o progresso só troca o
     texto e a barra, então o foco do teclado e do leitor de tela fica onde está. A miniatura é um canvas de 96 px decodificado já reduzido
     (createImageBitmap com resizeWidth), nunca a foto original inteira; a URL é revogada quando a linha sai da lista. */
  var mb = function (n) { return Math.round(n / (1024 * 1024) * 10) / 10; };
  function chaveDaLinha(it) { return it.estado + '|' + (it.erro || '') + '|' + it.papel; }
  function textoDoEstado(it) {
    var tam = mb(it.tamanho) + ' MB';
    if (it.estado === 'erro') return it.erro || 'Não foi possível enviar.';
    if (it.estado === 'enviado') return tam + ' · enviada';
    return tam + ' · ' + (it.estado === 'enviando' ? 'enviando ' + Math.round(it.progresso * 100) + '%' : 'preparando…');
  }
  var minis = {};   /* id → URL do blob pequeno (null = já tentou e não deu) */
  var linhas = {};  /* id → { li, chave, estadoEl, bar } */
  /* uma por vez (rodada 2, Safari): 20 fotos escolhidas juntas não decodificam 20 imagens ao mesmo tempo */
  var cadeiaDeMiniaturas = Promise.resolve();
  async function fazerMiniatura(it, img) {
    if (!it.arquivo || minis[it.id] !== undefined || typeof createImageBitmap !== 'function') return;
    minis[it.id] = null;   /* já tentou: não repete a cada atualização */
    cadeiaDeMiniaturas = cadeiaDeMiniaturas.then(function () { return miniaturaDe(it, img); });
  }
  async function miniaturaDe(it, img) {
    if (!linhas[it.id]) return;   /* a linha saiu enquanto esperava a vez */
    var bmp = null;
    try {
      bmp = await createImageBitmap(it.arquivo, { resizeWidth: 96, resizeQuality: 'low' });
      var c = document.createElement('canvas'); c.width = 96; c.height = 96;
      var lado = Math.min(bmp.width, bmp.height);
      c.getContext('2d').drawImage(bmp, (bmp.width - lado) / 2, (bmp.height - lado) / 2, lado, lado, 0, 0, 96, 96);
      bmp.close(); bmp = null;
      var blob = await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.7); });
      if (!blob || !linhas[it.id]) return;   /* a linha já saiu */
      minis[it.id] = URL.createObjectURL(blob);
      img.src = minis[it.id];
    } catch (e) { if (bmp && bmp.close) bmp.close(); /* sem miniatura: a caixa fica vazia */ }
  }
  function criarLinha(it) {
    var li = el('li', 'orc-arq__item is-' + it.estado), mini = el('span', 'orc-arq__mini'), img = el('img');
    img.alt = ''; img.width = 48; img.height = 48;
    if (minis[it.id]) img.src = minis[it.id]; else if (it.arquivo) fazerMiniatura(it, img);
    if (it.arquivo) mini.appendChild(img);
    li.appendChild(mini);
    var info = el('span', 'orc-arq__info'), estadoEl = el('span', 'orc-arq__estado', textoDoEstado(it)), bar = null;
    info.appendChild(el('span', 'orc-arq__nome', it.nome)); info.appendChild(estadoEl);
    if (it.estado === 'enviando') { bar = el('progress'); bar.max = 1; bar.value = it.progresso; bar.setAttribute('aria-label', 'Envio de ' + it.nome); info.appendChild(bar); }
    li.appendChild(info);
    if (it.estado === 'erro' && it.arquivo) { var nv = el('button', 'btn btn--ghost', 'Tentar de novo'); nv.type = 'button'; nv.addEventListener('click', function () { estado.motor.tentarDeNovo(it.id); }); li.appendChild(nv); }
    var x = el('button', 'orc-arq__tirar', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Tirar ' + it.nome);
    x.disabled = it.estado !== 'enviado' && it.estado !== 'erro';
    x.addEventListener('click', function () { estado.motor.remover(it.id); });
    li.appendChild(x);
    return { li: li, chave: chaveDaLinha(it), estadoEl: estadoEl, bar: bar };
  }
  function desenharArquivos(itens) {
    var logo = $('o-arq-logo'), fotos = $('o-arq-fotos');
    if (!logo || !fotos) return;
    var n = 0, vivos = {}, indice = { logo: 0, foto: 0 };
    itens.forEach(function (it) {
      vivos[it.id] = true;
      var r = linhas[it.id], dono = it.papel === 'logo' ? logo : fotos;
      if (!r || r.chave !== chaveDaLinha(it)) {
        var nova = criarLinha(it), tinhaFoco = r && r.li.contains(document.activeElement);
        if (r) r.li.replaceWith(nova.li);
        r = linhas[it.id] = nova;
        if (tinhaFoco) { var alvo = nova.li.querySelector('button:not(:disabled)'); if (alvo) alvo.focus(); }
      } else {   /* mesma forma: só o texto e a barra */
        r.estadoEl.textContent = textoDoEstado(it);
        if (r.bar) r.bar.value = it.progresso;
      }
      var pos = indice[it.papel]++;
      if (dono.children[pos] !== r.li) dono.insertBefore(r.li, dono.children[pos] || null);
      if (it.papel === 'foto' && it.estado !== 'erro') n++;
    });
    Object.keys(linhas).forEach(function (id) {   /* linhas que saíram: some o item e a URL da miniatura é revogada */
      if (vivos[id]) return;
      linhas[id].li.remove(); delete linhas[id];
      if (minis[id]) { try { URL.revokeObjectURL(minis[id]); } catch (e) { /* já revogada */ } }
      delete minis[id];
    });
    $('o-arq-contador').textContent = n + ' de 20';
    atualizarEnvio();
  }

  /* ----- bloco 6: cor e envio ----- */
  function envio(corpo) {
    var cor = el('div', 'orc-mat__campo'), lab = el('label', null, 'Cor da marca'), inp = el('input'), nao = el('button', 'btn btn--ghost', 'Não sei: usar a cor da logo'), saida = status();
    lab.htmlFor = 'o-mat-cor'; inp.type = 'color'; inp.id = 'o-mat-cor'; inp.value = estado.atual.dados.cor || '#1a7f5a'; nao.type = 'button';
    inp.addEventListener('change', function () { salvar('cor', inp.value, saida); });
    nao.addEventListener('click', function () { salvar('cor', null, saida); });
    cor.appendChild(lab); cor.appendChild(inp); cor.appendChild(nao); cor.appendChild(saida); corpo.appendChild(cor);
    var cx = el('label', 'orc-mat__caixa'), c = el('input'), a = el('a', null, 'Como o material é guardado');
    c.type = 'checkbox'; c.id = 'o-mat-aut'; c.checked = estado.atual.autorizacao.marcada === true;
    cx.appendChild(c); cx.appendChild(el('span', null, ESQ.AUTORIZACAO.texto));
    var sa = status();
    c.addEventListener('change', function () { salvar('autorizacao.marcada', c.checked, sa); });
    corpo.appendChild(cx); corpo.appendChild(sa);
    a.setAttribute('href', '/privacidade#orcamento'); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer');
    var pa = el('p', 'orc-mat__dica'); pa.appendChild(a); corpo.appendChild(pa);
    var falta = el('p', 'orc-mat__falta'); falta.id = 'o-mat-falta'; falta.setAttribute('role', 'status'); falta.setAttribute('aria-live', 'polite'); corpo.appendChild(falta);
    var env = el('button', 'btn btn--primary', 'Enviar o material'); env.type = 'button'; env.id = 'o-mat-enviar';
    env.addEventListener('click', enviar); corpo.appendChild(env);
    var erro = el('p', 'orc-mat__salvo'); erro.id = 'o-mat-erro'; erro.setAttribute('role', 'status'); corpo.appendChild(erro);
    corpo.appendChild(el('p', 'orc-mat__dica', 'O que você não mandar fica como no modelo. Depois de enviar, mudanças entram na lista de ajustes da prévia.'));
  }
  /* o que impede o envio, em frase: os campos que faltam (com o número do bloco), arquivo em andamento e arquivo preso em vermelho (B1 da revisão) */
  function partesDoFalta(f, resumo) {
    var partes = f.map(function (x) { return x.texto + ' (' + x.bloco + ')'; });
    if (resumo.emAndamento) partes.push('esperar os arquivos terminarem de enviar');
    if (resumo.presos > 0) partes.push('tirar o arquivo que não terminou (marcado em vermelho)');
    return partes;
  }
  function atualizarEnvio() {
    var env = $('o-mat-enviar'), falta = $('o-mat-falta');
    if (!env || !estado) return;
    var partes = partesDoFalta(ESQ.faltas(estado.atual), estado.motor.resumo());
    falta.textContent = partes.length ? 'Falta: ' + partes.join(' e ') + '.' : '';
    env.setAttribute('aria-disabled', partes.length ? 'true' : 'false');
  }
  async function enviar() {
    var env = $('o-mat-enviar'), erro = $('o-mat-erro');
    if (env.getAttribute('aria-disabled') === 'true') { var f = $('o-mat-falta'); f.setAttribute('tabindex', '-1'); f.focus(); return; }   /* desligado: o foco vai ao que falta */
    env.setAttribute('aria-disabled', 'true'); erro.classList.remove('is-erro'); erro.textContent = 'Enviando…';
    try {
      /* M3 (revisão): o último campo digitado ainda pode estar agendado ou salvando: ele sai e termina ANTES de enviar */
      if (!(await fila.esvaziar())) { erro.classList.add('is-erro'); erro.textContent = 'Um campo não foi salvo. Confira o aviso ao lado dele e toque em Enviar de novo.'; atualizarEnvio(); return; }
      atualizarEnvio();
      if (env.getAttribute('aria-disabled') === 'true') { erro.textContent = ''; return; }   /* o que acabou de ser salvo mudou o "Falta:" */
      await window.BZOrcamento.materialEnviar(); erro.textContent = ''; estado.id = null; await estado.recarregar(); $('o-mat-titulo').focus(); }
    catch (e) {
      erro.classList.add('is-erro'); erro.textContent = (e && e.message) || 'Não foi possível enviar agora.';
      atualizarEnvio();
    }
  }

  /* ----- depois de enviado: só leitura ----- */
  function somenteLeitura(E, e) {
    var corpo = $('o-mat-corpo'); corpo.textContent = '';
    var m = e.material, previsao = window.BZEntrega ? window.BZEntrega.dataPorExtenso(e.entrega_ate) : '';
    corpo.appendChild(el('p', 'orc-bloco__lead', m.status === 'limpo' ? 'O seu material já foi para a produção e saiu desta página.'
      : previsao ? 'Recebido. Previsão do seu site: ' + previsao + '. Você vê a prévia aqui mesmo.' : 'Recebido. Você vê a prévia aqui mesmo.'));
    if (m.status === 'limpo') return;
    var d = m.dados || {}, ul = el('ul', 'orc-mat__resumo'), fotos = (m.arquivos || []).filter(function (a) { return a.papel === 'foto'; }).length;
    [['Logo', (m.arquivos || []).some(function (a) { return a.papel === 'logo'; }) ? 'enviada' : 'não enviada'], ['Fotos', String(fotos)],
      ['Serviços', d.servicos ? String(d.servicos.length) : '0'], ['WhatsApp dos botões', d.whatsapp ? formatarTelefone(d.whatsapp) : 'não informado']].forEach(function (p) { ul.appendChild(el('li', null, p[0] + ': ' + p[1])); });
    corpo.appendChild(ul);
  }

  /* ----- entrada: chamada por BZEntrega.atualizar(E) a cada leitura do estado ----- */
  function atualizar(E) {
    var e = E.entrega, sec = $('o-material');
    if (!e || E.conversa.etapa !== 'em_producao') { sec.hidden = true; return; }
    sec.hidden = false;
    if (e.material.status !== 'rascunho') { estado = null; somenteLeitura(E, e); return; }
    if (!estado || estado.id !== e.id) {
      estado = { id: e.id, atual: { dados: Object.assign({}, e.material.dados), negocio: Object.assign({}, e.material.negocio), autorizacao: Object.assign({}, e.material.autorizacao) },
        simples: [], recarregar: window.BZMaterialRecarregar || function () { return Promise.resolve(); }, motor: null };
      estado.motor = window.BZEnvio.criar({ API: window.BZOrcamento, aoMudar: desenharArquivos });
      desenhar(E, e);
    }
    estado.motor.hidratar(e.material.arquivos);
    /* campos simples que a pessoa não está editando seguem o servidor (o número do pedido, por exemplo) */
    estado.atual = { dados: Object.assign({}, e.material.dados), negocio: Object.assign({}, e.material.negocio), autorizacao: Object.assign({}, e.material.autorizacao) };
    estado.simples.forEach(function (s) {
      if (s.inp === document.activeElement || s.inp.dataset.sujo === '1') return;
      var v = s.def.campo.indexOf('negocio.') === 0 ? estado.atual.negocio[s.def.campo.slice(8)] : estado.atual.dados[s.def.campo];
      s.inp.value = s.def.tipo === 'tel' ? formatarTelefone(v) : v || '';
    });
    atualizarEnvio();
  }
  function desenhar(E, e) {
    var corpo = $('o-mat-corpo'); corpo.textContent = '';
    var lead = el('p', 'orc-bloco__lead', 'Passo 2 de 4. Mande o que tiver; o que faltar fica como no modelo. O prazo começa quando você enviar.');
    corpo.appendChild(lead);
    corpo.appendChild(el('p', 'orc-mat__dica', AVISO_DADOS));
    BLOCOS.forEach(function (b) {
      var sec = el('section', 'orc-mat__bloco'), h = el('h3', 'orc-mat__titulo', b.titulo);
      sec.appendChild(h);
      if (b.tipo === 'arquivos') arquivos(sec);
      else if (b.tipo === 'envio') envio(sec);
      else b.campos.forEach(function (c) {
        var nome = c.campo.indexOf('negocio.') === 0 ? e.material.negocio[c.campo.slice(8)] : e.material.dados[c.campo];
        if (c.campo === 'negocio.cidade' && !nome && E.briefing && E.briefing.negocio) nome = E.briefing.negocio.cidade;
        sec.appendChild(c.tipo === 'lista' ? lista(c, nome) : c.tipo === 'objetos' ? objetos(c, nome) : c.tipo === 'endereco' ? endereco(c, nome) : simples(c, nome));
      });
      corpo.appendChild(sec);
    });
    estado.motor.hidratar(e.material.arquivos);
  }

  window.BZMaterial = { atualizar: atualizar, blocos: BLOCOS, formatarTelefone: formatarTelefone, lerLista: lerLista, lerObjetos: lerObjetos, repetirNo429: repetirNo429, partesDoFalta: partesDoFalta, chaveDaLinha: chaveDaLinha, textoDoEstado: textoDoEstado, mudouDe: mudouDe, criarFilaDeSalvamento: criarFilaDeSalvamento };
})();
