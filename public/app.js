(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } };
  const ler = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const el = (tag, cls, texto) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto !== undefined) e.textContent = texto;
    return e;
  };
  async function api(url, opcoes) {
  const URL_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000' : window.location.origin;
    const r = await fetch(url.startsWith('http') ? url : URL_BASE + url, opcoes);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
    return j;
  }

  let CFG = { nomeRadio: 'Rádio', slogan: '', streamUrl: '' };
  let musicaAtual = null;

  /* ============================================================== */
  /* Player                                                          */
  /* ============================================================== */
  const audio = new Audio();
  audio.preload = 'none';
  let estado = 'parado';
  let candidatos = [];
  let indice = 0;
  let timerConexao = null;
  let religacoes = 0;

  function montarCandidatos(url) {
    const limpo = String(url || '').trim();
    const m = limpo.match(/^(https?:\/\/[^\/]+)(\/.*)?$/);
    if (!m) return [];
    const lista = [];
    if (m[2] && m[2] !== '/') lista.push(limpo);
    ['/;', '/stream', '/;stream.mp3', '/live', ''].forEach((c) => {
      const u = m[1] + c;
      if (!lista.includes(u)) lista.push(u);
    });
    const salvo = ler('sr_stream_ok');
    if (salvo && lista.includes(salvo)) {
      lista.splice(lista.indexOf(salvo), 1);
      lista.unshift(salvo);
    }
    return lista;
  }

  function atualizarTextosRadio() {
    const nome = CFG.nomeRadio;
    let hero, estadoTxt, musicaTxt;
    if (estado === 'tocando') {
      hero = musicaAtual ? 'No ar: ' + musicaAtual : 'No ar agora';
      estadoTxt = 'No ar';
      musicaTxt = musicaAtual || nome;
    } else if (estado === 'conectando') {
      hero = 'Conectando à rádio…';
      estadoTxt = 'Conectando…';
      musicaTxt = nome;
    } else if (estado === 'erro') {
      hero = 'Sem sinal por enquanto';
      estadoTxt = 'Sem sinal';
      musicaTxt = 'Toque para tentar de novo';
    } else {
      hero = 'Toque no sol para ouvir';
      estadoTxt = 'Parada';
      musicaTxt = 'Toque para ouvir';
    }
    $('#agoraTexto').textContent = hero;
    $('#playerEstado').textContent = estadoTxt;
    $('#playerMusica').textContent = musicaTxt;
    const rotulo = estado === 'tocando' ? 'Pausar a rádio' : estado === 'conectando' ? 'Conectando' : 'Ouvir a rádio';
    $('#solBtn').setAttribute('aria-label', rotulo);
    $('#playerBtn').setAttribute('aria-label', rotulo);
    $('#heroAviso').textContent =
      estado === 'erro' ? 'Não foi possível conectar. Confira sua internet ou tente de novo em instantes.' : '';
    atualizarMediaSession();
  }

  function definirEstado(novo) {
    estado = novo;
    document.body.dataset.radio = novo;
    atualizarTextosRadio();
  }

  function tentar(i) {
    indice = i;
    clearTimeout(timerConexao);
    audio.src = candidatos[i];
    audio.load();
    const p = audio.play();
    if (p && p.catch) p.catch(() => { /* o evento "error" cuida disso */ });
    timerConexao = setTimeout(proximo, 9000);
  }

  function proximo() {
    if (estado !== 'conectando') return;
    if (indice + 1 < candidatos.length) tentar(indice + 1);
    else falhar();
  }

  function falhar() {
    clearTimeout(timerConexao);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    definirEstado('erro');
  }

  function tocar() {
    if (!candidatos.length) candidatos = montarCandidatos(CFG.streamUrl);
    if (!candidatos.length) return falhar();
    religacoes = 0;
    definirEstado('conectando');
    tentar(0);
  }

  function parar() {
    clearTimeout(timerConexao);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    definirEstado('parado');
  }

  function alternar() {
    if (estado === 'tocando' || estado === 'conectando') parar();
    else tocar();
  }

  audio.addEventListener('playing', () => {
    clearTimeout(timerConexao);
    religacoes = 0;
    guardar('sr_stream_ok', candidatos[indice]);
    definirEstado('tocando');
  });
  audio.addEventListener('error', () => {
    if (estado === 'conectando') proximo();
    else if (estado === 'tocando') {
      if (religacoes < 3) {
        religacoes++;
        definirEstado('conectando');
        tentar(indice);
      } else falhar();
    }
  });
  audio.addEventListener('ended', () => {
    if (estado === 'tocando') {
      definirEstado('conectando');
      tentar(indice);
    }
  });

  function atualizarMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: musicaAtual || CFG.nomeRadio,
        artist: CFG.nomeRadio,
        artwork: [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
      });
      navigator.mediaSession.setActionHandler('play', tocar);
      navigator.mediaSession.setActionHandler('pause', parar);
    } catch (e) { /* recurso opcional */ }
  }

  $('#solBtn').addEventListener('click', alternar);
  $('#playerBtn').addEventListener('click', alternar);

  const vol = $('#volume');
  const volSalvo = parseFloat(ler('sr_volume'));
  if (!isNaN(volSalvo)) vol.value = volSalvo;
  audio.volume = parseFloat(vol.value);
  vol.addEventListener('input', () => {
    audio.volume = parseFloat(vol.value);
    guardar('sr_volume', vol.value);
  });

  /* "No ar agora" e ouvintes */
  async function atualizarAoVivo() {
    if (document.hidden) return;
    try {
      const d = await api('/api/aovivo');
      musicaAtual = d.musica || null;
      const box = $('#playerOuvintes');
      if (d.ouvintes !== null && d.ouvintes !== undefined) {
        box.textContent = d.ouvintes + (d.ouvintes === 1 ? ' ouvinte' : ' ouvintes');
        box.hidden = false;
      } else box.hidden = true;
      atualizarTextosRadio();
    } catch (e) { /* mantém o que já está na tela */ }
  }

  /* ============================================================== */
  /* Notícias                                                        */
  /* ============================================================== */
  let catAtual = 'todas';
  let periodoAtual = 'hoje';

  function haQuanto(iso) {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 2) return 'agora mesmo';
    if (min < 60) return 'há ' + min + ' min';
    const h = Math.round(min / 60);
    if (h < 24) return 'há ' + h + (h === 1 ? ' hora' : ' horas');
    const d = Math.round(h / 24);
    if (d === 1) return 'ontem';
    return 'há ' + d + ' dias';
  }

  function criarNoticia(n, tipo) {
    const a = el('a', tipo);
    a.href = n.link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.appendChild(el('span', 'tit', n.titulo));
    const meta = el('span', 'meta');
    if (n.fonte) meta.appendChild(el('span', 'fonte', n.fonte));
    meta.appendChild(el('span', 'tempo', haQuanto(n.data)));
    a.appendChild(meta);
    return a;
  }

  async function carregarNoticias(forcar) {
    const lista = $('#listaNoticias');
    const nota = $('#notaNoticias');
    lista.setAttribute('aria-busy', 'true');
    try {
      const q = '/api/news?cat=' + encodeURIComponent(catAtual) + '&periodo=' + periodoAtual + (forcar ? '&forcar=1' : '');
      const d = await api(q);
      lista.replaceChildren();
      if (!d.itens.length) {
        const msg = d.falha
          ? 'Não consegui buscar as notícias agora. Confira se o computador que hospeda o site está com internet.'
          : d.atualizadoEm
          ? 'Nenhuma notícia deste assunto ' + (periodoAtual === 'hoje' ? 'nas últimas 24 horas' : 'na última semana') + '. Experimente outro assunto ou o período "Semana".'
          : 'As notícias ainda estão sendo buscadas. Volte em alguns instantes ou toque em "Atualizar".';
        lista.appendChild(el('p', 'vazio', msg));
      } else {
        lista.appendChild(criarNoticia(d.itens[0], 'manchete'));
        const resto = el('div', 'lista-not');
        d.itens.slice(1, 15).forEach((n) => resto.appendChild(criarNoticia(n, 'noticia')));
        lista.appendChild(resto);
      }
      nota.textContent = d.atualizadoEm ? 'Atualizado às ' + new Date(d.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.' : '';
    } catch (e) {
      lista.replaceChildren(el('p', 'vazio', 'Não consegui carregar as notícias agora. Tente novamente em instantes.'));
    } finally {
      lista.removeAttribute('aria-busy');
    }
  }

  function montarChips(categorias) {
    const box = $('#chips');
    const todas = [{ id: 'todas', nome: 'Tudo' }].concat(categorias);
    todas.forEach((c) => {
      const b = el('button', 'chip', c.nome);
      b.type = 'button';
      b.dataset.cat = c.id;
      b.setAttribute('aria-pressed', c.id === catAtual ? 'true' : 'false');
      b.addEventListener('click', () => {
        catAtual = c.id;
        $$('.chip').forEach((x) => x.setAttribute('aria-pressed', x.dataset.cat === catAtual ? 'true' : 'false'));
        carregarNoticias();
      });
      box.appendChild(b);
    });
  }

  $$('.segmento button').forEach((b) =>
    b.addEventListener('click', () => {
      periodoAtual = b.dataset.periodo;
      $$('.segmento button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      carregarNoticias();
    })
  );
  $('#btnAtualizar').addEventListener('click', () => {
    const b = $('#btnAtualizar');
    b.disabled = true;
    b.textContent = 'Atualizando…';
    carregarNoticias(true).finally(() => {
      b.disabled = false;
      b.textContent = 'Atualizar';
    });
  });

  async function carregarResumo() {
    try {
      const d = await api('/api/resumo');
      if (d.ativo && d.texto) {
        $('#resumoTexto').textContent = d.texto;
        $('#resumo').hidden = false;
      }
    } catch (e) { /* resumo é opcional */ }
  }

  /* ============================================================== */
  /* Horóscopo                                                       */
  /* ============================================================== */
  const SIGNOS = [
    { id: 'aries', nome: 'Áries', s: '♈', ini: 321, fim: 419, datas: '21/03 a 19/04', traco: 'Sua coragem natural abre portas hoje.' },
    { id: 'touro', nome: 'Touro', s: '♉', ini: 420, fim: 520, datas: '20/04 a 20/05', traco: 'Sua paciência é o seu maior trunfo hoje.' },
    { id: 'gemeos', nome: 'Gêmeos', s: '♊', ini: 521, fim: 620, datas: '21/05 a 20/06', traco: 'Sua curiosidade traz boas conversas hoje.' },
    { id: 'cancer', nome: 'Câncer', s: '♋', ini: 621, fim: 722, datas: '21/06 a 22/07', traco: 'Sua sensibilidade guia você com precisão hoje.' },
    { id: 'leao', nome: 'Leão', s: '♌', ini: 723, fim: 822, datas: '23/07 a 22/08', traco: 'Seu brilho próprio chama atenção hoje.' },
    { id: 'virgem', nome: 'Virgem', s: '♍', ini: 823, fim: 922, datas: '23/08 a 22/09', traco: 'Seu olhar atento resolve os detalhes hoje.' },
    { id: 'libra', nome: 'Libra', s: '♎', ini: 923, fim: 1022, datas: '23/09 a 22/10', traco: 'Seu senso de equilíbrio evita atritos hoje.' },
    { id: 'escorpiao', nome: 'Escorpião', s: '♏', ini: 1023, fim: 1121, datas: '23/10 a 21/11', traco: 'Sua intuição está afiada hoje.' },
    { id: 'sagitario', nome: 'Sagitário', s: '♐', ini: 1122, fim: 1221, datas: '22/11 a 21/12', traco: 'Seu otimismo contagia quem está por perto hoje.' },
    { id: 'capricornio', nome: 'Capricórnio', s: '♑', ini: 1222, fim: 119, datas: '22/12 a 19/01', traco: 'Sua disciplina rende frutos hoje.' },
    { id: 'aquario', nome: 'Aquário', s: '♒', ini: 120, fim: 218, datas: '20/01 a 18/02', traco: 'Sua originalidade ganha espaço hoje.' },
    { id: 'peixes', nome: 'Peixes', s: '♓', ini: 219, fim: 320, datas: '19/02 a 20/03', traco: 'Sua imaginação encontra boas saídas hoje.' },
  ];

  const TEXTOS = {
    geral: [
      'O dia pede calma para tomar decisões. Quem respira fundo antes de responder sai na frente.',
      'Uma boa notícia pode chegar por onde você menos espera. Fique de olho nas mensagens.',
      'É um bom momento para terminar aquilo que ficou pela metade. A sensação de dever cumprido vem rápido.',
      'Pequenos gestos fazem diferença hoje. Um elogio sincero muda o clima de um ambiente inteiro.',
      'Você pode receber um convite inesperado. Vale considerar com carinho antes de dizer não.',
      'A energia está boa para recomeços. Comece pela tarefa mais simples e deixe o ritmo crescer.',
      'Evite comparar o seu passo com o dos outros. Cada um chega no seu tempo.',
      'Um assunto antigo volta à tona e pode ser resolvido com uma conversa franca.',
      'O dia favorece a criatividade. Anote as ideias que surgirem, mesmo as que parecerem malucas.',
      'Você merece uma pausa. Uma música boa e uma bebida quente ajudam a recarregar as energias.',
    ],
    amor: [
      'No amor, o diálogo vale mais que qualquer presente. Diga o que sente com leveza.',
      'Quem está sozinho pode se surpreender com um reencontro ou um papo interessante.',
      'Cuide de quem está perto. Uma ligação rápida aquece o coração de alguém especial.',
      'Evite discussões por bobagem. Um pouco de humor resolve muito mais.',
      'O clima é de carinho e cumplicidade. Aproveite para fazer um programa a dois, mesmo que simples.',
      'Ouça mais do que fale e você vai entender melhor o que o outro precisa.',
      'Uma amizade pode ganhar um novo significado. Vá sem pressa.',
      'Não guarde mágoas. Perdoar alivia o peso, principalmente para você.',
      'Bom dia para matar a saudade de alguém que anda distante.',
      'Demonstre gratidão pelas pessoas que caminham ao seu lado.',
    ],
    trabalho: [
      'No trabalho, organização é a palavra do dia. Uma lista curta de prioridades evita dor de cabeça.',
      'Sua dedicação pode ser notada por alguém importante. Faça o seu melhor sem alarde.',
      'Se surgir um imprevisto, encare como aprendizado. A solução aparece quando você mantém a calma.',
      'Trabalhar em equipe rende mais que ir sozinho. Peça ajuda sem receio.',
      'Um assunto financeiro pede atenção. Confira os números antes de fechar qualquer compra.',
      'Boa hora para estudar algo novo ou reforçar uma habilidade que você já tem.',
      'Evite prometer mais do que pode entregar. Prazos realistas trazem tranquilidade.',
      'Uma conversa com um colega pode abrir um caminho que você ainda não tinha visto.',
      'Não deixe para amanhã o e-mail ou o telefonema que está te incomodando.',
      'Seu esforço constante começa a aparecer. Continue firme.',
    ],
    bemestar: [
      'Beba mais água e faça uma caminhada curta. O corpo agradece.',
      'Tente dormir um pouco mais cedo hoje. O descanso ajuda a clarear as ideias.',
      'Reserve alguns minutos para respirar fundo, longe das telas.',
      'Capriche numa refeição colorida e sem pressa.',
      'Alongue os ombros e o pescoço de vez em quando, principalmente se passar muito tempo sentado.',
      'Ficar ao ar livre, ao sol da tarde, ajuda a recuperar o bom humor.',
      'Converse com alguém de confiança sobre o que está pesando. Dividir alivia.',
      'Um chimarrão ou um chá, tomado com calma, é um ótimo ritual para desacelerar.',
    ],
    dica: [
      'Comece o dia agradecendo por algo simples.',
      'Se estiver em dúvida, escolha o caminho mais honesto.',
      'Guarde um tempinho só para você.',
      'Sorria para um desconhecido. Você vai se surpreender com a resposta.',
      'Ouça uma música que te lembre de um bom momento.',
      'Anote uma coisa boa que aconteceu hoje antes de dormir.',
      'Não responda no calor do momento. Espere dez minutos.',
      'Ligue para alguém que você gosta e não fala há tempos.',
      'Arrume uma gaveta ou uma prateleira. Organizar por fora ajuda por dentro.',
      'Aproveite o pôr do sol, se der. Ele é de graça e sempre vale a pena.',
    ],
    cores: ['azul Guaíba', 'verde erva-mate', 'laranja pôr do sol', 'rosa crepúsculo', 'branco nuvem', 'amarelo girassol', 'vinho', 'cinza chuva'],
  };

  function hashTexto(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function gerador(sementeTxt) {
    let a = hashTexto(sementeTxt)();
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const sorteia = (rnd, lista) => lista[Math.floor(rnd() * lista.length)];

  function dataHoje() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function montarHoroscopo(signo) {
    const rnd = gerador(dataHoje() + '|' + signo.id);
    return {
      geral: sorteia(rnd, TEXTOS.geral),
      amor: sorteia(rnd, TEXTOS.amor),
      trabalho: sorteia(rnd, TEXTOS.trabalho),
      bemestar: sorteia(rnd, TEXTOS.bemestar),
      dica: sorteia(rnd, TEXTOS.dica),
      cor: sorteia(rnd, TEXTOS.cores),
      numero: 1 + Math.floor(rnd() * 60),
    };
  }

  function mostrarHoroscopo(signo) {
    const h = montarHoroscopo(signo);
    const box = $('#horoscopoBox');
    box.replaceChildren();
    const cab = el('div', 'horo-cab');
    cab.appendChild(el('span', 'horo-simb', signo.s));
    const t = el('div');
    t.appendChild(el('h3', '', signo.nome));
    t.appendChild(el('p', '', signo.datas + ' - previsão de ' + new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })));
    cab.appendChild(t);
    box.appendChild(cab);

    const corpo = el('div', 'horo-corpo');
    const secao = (titulo, txt) => {
      const d = el('div');
      d.appendChild(el('h4', '', titulo));
      d.appendChild(el('p', '', txt));
      corpo.appendChild(d);
    };
    secao('O dia', signo.traco + ' ' + h.geral);
    secao('Amor', h.amor);
    secao('Trabalho e dinheiro', h.trabalho);
    secao('Bem-estar', h.bemestar);
    box.appendChild(corpo);

    const ex = el('div', 'horo-extras');
    const item = (rot, val) => {
      const p = el('p');
      p.appendChild(el('strong', '', rot + ': '));
      p.appendChild(document.createTextNode(val));
      ex.appendChild(p);
    };
    item('Cor do dia', h.cor);
    item('Número da sorte', String(h.numero));
    item('Dica', h.dica);
    box.appendChild(ex);
    box.hidden = false;
  }

  function selecionarSigno(id, rolar) {
    const s = SIGNOS.find((x) => x.id === id);
    if (!s) return;
    $$('.signo').forEach((b) => b.setAttribute('aria-pressed', b.dataset.id === id ? 'true' : 'false'));
    guardar('sr_signo', id);
    mostrarHoroscopo(s);
    if (rolar) $('#horoscopoBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function iniciarHoroscopo() {
    const box = $('#signos');
    SIGNOS.forEach((s) => {
      const b = el('button', 'signo');
      b.type = 'button';
      b.dataset.id = s.id;
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(el('span', 'simb', s.s));
      b.appendChild(el('span', 'nome', s.nome));
      b.appendChild(el('span', 'datas', s.datas));
      b.addEventListener('click', () => selecionarSigno(s.id, true));
      box.appendChild(b);
    });

    const dias = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    for (let d = 1; d <= 31; d++) $('#selDia').appendChild(new Option(d, d));
    meses.forEach((m, i) => $('#selMes').appendChild(new Option(m, i + 1)));

    $('#btnDescobrir').addEventListener('click', () => {
      const d = parseInt($('#selDia').value, 10);
      const m = parseInt($('#selMes').value, 10);
      const resp = $('#descobrirResp');
      if (d > dias[m - 1]) {
        resp.textContent = 'Essa data não existe. Confira o dia e o mês.';
        return;
      }
      const v = m * 100 + d;
      const s = SIGNOS.find((x) => (x.ini <= x.fim ? v >= x.ini && v <= x.fim : v >= x.ini || v <= x.fim));
      resp.textContent = 'Seu signo é ' + s.nome + '.';
      selecionarSigno(s.id, true);
    });

    const salvo = ler('sr_signo');
    if (salvo) selecionarSigno(salvo, false);
  }

  /* ============================================================== */
  /* Clima                                                           */
  /* ============================================================== */
  /* ============================================================== */
  /* Clima com Pesquisa de Cidades                                  */
  /* ============================================================== */
  function descreverClima(cod) {
    if (cod === 0) return ['☀️', 'Céu limpo'];
    if (cod === 1) return ['🌤️', 'Poucas nuvens'];
    if (cod === 2) return ['⛅', 'Parcialmente nublado'];
    if (cod === 3) return ['☁️', 'Nublado'];
    if (cod === 45 || cod === 48) return ['🌫️', 'Neblina'];
    if (cod >= 51 && cod <= 57) return ['🌦️', 'Garoa'];
    if (cod >= 61 && cod <= 67) return ['🌧️', 'Chuva'];
    if (cod >= 71 && cod <= 77) return ['❄️', 'Frio intenso'];
    if (cod >= 80 && cod <= 82) return ['🌧️', 'Pancadas de chuva'];
    if (cod >= 95) return ['⛈️', 'Tempestade'];
    return ['🌡️', 'Tempo instável'];
  }

  let cidadeAtual = ler('sr_clima_cidade') || 'Porto Alegre';
  let latAtual = parseFloat(ler('sr_clima_lat')) || -30.0331;
  let lonAtual = parseFloat(ler('sr_clima_lon')) || -51.23;

  async function buscarCoordenadas(nomeCidade) {
    try {
      console.log('Buscando coordenadas para:', nomeCidade);
      let geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nomeCidade)}&count=5&language=pt&format=json`;
      let r = await fetch(geoUrl);
      let j = await r.json();
      console.log('Resposta da API (tentativa 1):', j);

      if (!j.results || j.results.length === 0) {
        const nomeLimpo = nomeCidade.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (nomeLimpo !== nomeCidade) {
          console.log('Tentando sem acentos:', nomeLimpo);
          geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nomeLimpo)}&count=5&language=pt&format=json`;
          r = await fetch(geoUrl);
          j = await r.json();
          console.log('Resposta da API (tentativa sem acentos):', j);
        }
      }

      if (j.results && j.results.length > 0) {
        return {
          lat: j.results[0].latitude,
          lon: j.results[0].longitude,
          nome: `${j.results[0].name}${j.results[0].admin1 ? ' - ' + j.results[0].admin1 : ''}`
        };
      }
    } catch (e) {
      console.error('Erro na requisição da API de geocodificação:', e);
    }
    return null;
  }

  async function carregarClima(nomeParaBuscar) {
    const box = $('#clima') || $('#tempo') || $('.tempo-container');
    if (!box) return;

    if (nomeParaBuscar) {
      const coords = await buscarCoordenadas(nomeParaBuscar);
      if (coords) {
        cidadeAtual = coords.nome;
        latAtual = coords.lat;
        lonAtual = coords.lon;
        guardar('sr_clima_cidade', cidadeAtual);
        guardar('sr_clima_lat', latAtual);
        guardar('sr_clima_lon', lonAtual);
      } else {
        alert('Cidade não encontrada. Verifique o nome e tente novamente.');
        return;
      }
    }

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latAtual}&longitude=${lonAtual}` +
        '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
        '&timezone=America%2FSao_Paulo&forecast_days=5';
      
      const r = await fetch(url);
      if (!r.ok) throw new Error('clima');
      const j = await r.json();
      const [emoji, desc] = descreverClima(j.current.weather_code);

      // Cria a barra de pesquisa apenas uma vez para não perder o foco ao atualizar
      let conteudoClima = $('#conteudoClimaDados');
      if (!conteudoClima) {
        box.replaceChildren();
        
        const barraBusca = el('div', 'clima-busca');
        barraBusca.style.cssText = 'display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; justify-content: center;';
        
        const input = el('input', 'input-cidade');
        input.type = 'text';
        input.id = 'inputCidadeSearch';
        input.placeholder = 'Digite outra cidade...';
        input.value = cidadeAtual;
        input.style.cssText = 'padding: 8px 12px; border-radius: 6px; border: 1px solid #ccc; font-size: 14px; flex: 1; max-width: 250px;';

        const btn = el('button', 'btn-busca-cidade', 'Pesquisar');
        btn.type = 'button';
        btn.style.cssText = 'padding: 8px 16px; border-radius: 6px; border: none; background: #0f172a; color: #fff; cursor: pointer; font-weight: bold;';

        const executarBusca = () => {
          const val = $('#inputCidadeSearch').value.trim();
          if (val) {
            btn.textContent = 'Buscando...';
            btn.disabled = true;
            carregarClima(val).finally(() => {
              btn.textContent = 'Pesquisar';
              btn.disabled = false;
            });
          }
        };

        btn.addEventListener('click', executarBusca);
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') executarBusca();
        });

        barraBusca.appendChild(input);
        barraBusca.appendChild(btn);
        box.appendChild(barraBusca);

        conteudoClima = el('div');
        conteudoClima.id = 'conteudoClimaDados';
        box.appendChild(conteudoClima);
      } else {
        const input = $('#inputCidadeSearch');
        if (input && document.activeElement !== input) {
          input.value = cidadeAtual;
        }
        conteudoClima.replaceChildren();
      }

      // Exibe o local atual
      const pLocal = el('p', 'clima-local');
      pLocal.style.cssText = 'font-weight: bold; font-size: 1.1rem; margin-bottom: 12px; text-align: center;';
      pLocal.textContent = `📍 Previsão para: ${cidadeAtual}`;
      conteudoClima.appendChild(pLocal);

      const agora = el('div', 'clima-agora');
      agora.appendChild(el('span', 'emoji', emoji));
      const info = el('div');
      info.appendChild(el('p', 'grau', Math.round(j.current.temperature_2m) + '°'));
      info.appendChild(el('p', 'desc', desc));
      info.appendChild(el('p', 'detalhe', 'Sensação de ' + Math.round(j.current.apparent_temperature) + '°, umidade ' + j.current.relative_humidity_2m + '%, vento de ' + Math.round(j.current.wind_speed_10m) + ' km/h'));
      agora.appendChild(info);
      conteudoClima.appendChild(agora);

      const dias = el('div', 'clima-dias');
      j.daily.time.forEach((t, i) => {
        const d = new Date(t + 'T12:00:00');
        const dia = el('div', 'dia');
        dia.appendChild(el('p', 'nome', i === 0 ? 'Hoje' : d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')));
        dia.appendChild(el('p', 'emoji', descreverClima(j.daily.weather_code[i])[0]));
        dia.appendChild(el('p', 'max', Math.round(j.daily.temperature_2m_max[i]) + '°'));
        dia.appendChild(el('p', 'min', Math.round(j.daily.temperature_2m_min[i]) + '°'));
        dia.appendChild(el('p', 'chuva', 'chuva ' + (j.daily.precipitation_probability_max[i] ?? 0) + '%'));
        dias.appendChild(dia);
      });
      conteudoClima.appendChild(dias);
    } catch (e) {
      const conteudoClima = $('#conteudoClimaDados');
      if (conteudoClima) {
        conteudoClima.replaceChildren(el('p', 'nota', 'Não consegui carregar a previsão agora. Tente novamente em instantes.'));
      }
    }
  }

  /* ============================================================== */
  /* Passatempo                                                      */
  /* ============================================================== */
  const embaralhar = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /* Gauchês do dia */
  const GAUCHES = [
    ['Bah', 'Expressão de surpresa, espanto ou admiração. Serve para quase tudo.'],
    ['Tchê', 'Jeito de chamar alguém, parecido com "cara" ou "amigo".'],
    ['Guri / Guria', 'Menino e menina.'],
    ['Bergamota', 'O que no resto do Brasil se chama tangerina ou mexerica.'],
    ['Cuia', 'A vasilha onde se prepara e se serve o chimarrão.'],
    ['Pila', 'Dinheiro. "Custou vinte pila" quer dizer vinte reais.'],
    ['Capaz', 'Pode significar "de jeito nenhum" ou "imagina, não foi nada", dependendo do tom.'],
    ['Tri', 'Muito, super. "Tri legal" é muito legal.'],
    ['Barbaridade', 'Expressão de admiração ou de espanto diante de algo.'],
    ['Buenacho', 'Bom, legal, agradável.'],
    ['Vivente', 'Pessoa, criatura. "Esse vivente" é "essa pessoa".'],
    ['Cacetinho', 'O pão francês.'],
    ['Sinaleira', 'O semáforo.'],
    ['Gurizada', 'A criançada ou a turma de jovens.'],
  ];
  let gIdx = 0;
  function mostrarGauches() {
    const g = GAUCHES[gIdx % GAUCHES.length];
    $('#gTermo').textContent = g[0];
    $('#gSig').textContent = g[1];
  }
  function iniciarGauches() {
    const dia = Math.floor(Date.now() / 86400000);
    gIdx = dia % GAUCHES.length;
    mostrarGauches();
    $('#gOutra').addEventListener('click', () => { gIdx++; mostrarGauches(); });
  }

  /* Quiz */
  const PERGUNTAS = [
    { p: 'Qual é o nome das águas que banham Porto Alegre e são famosas pelo pôr do sol?', o: ['Guaíba', 'Rio Uruguai', 'Rio Taquari', 'Lagoa Mirim'], c: 0 },
    { p: 'Qual bebida é símbolo da cultura gaúcha?', o: ['Chimarrão', 'Guaraná', 'Caipirinha', 'Sidra'], c: 0 },
    { p: 'No Rio Grande do Sul, o que é uma "bergamota"?', o: ['Tangerina', 'Limão', 'Pera', 'Goiaba'], c: 0 },
    { p: 'Como é chamado o clássico entre Grêmio e Internacional?', o: ['Gre-Nal', 'Ba-Vi', 'Fla-Flu', 'Dérbi Paulista'], c: 0 },
    { p: 'Qual é o nome oficial do parque conhecido como Redenção?', o: ['Parque Farroupilha', 'Parque Harmonia', 'Parque Germânia', 'Parque Marinha'], c: 0 },
    { p: 'Em que dia da semana acontece o tradicional Brique da Redenção?', o: ['Domingo', 'Sábado à noite', 'Quarta-feira', 'Segunda-feira'], c: 0 },
    { p: 'No gauchês, o que significa "pila"?', o: ['Dinheiro', 'Cavalo', 'Pão', 'Chuva'], c: 0 },
    { p: 'Qual destes lugares de Porto Alegre é um dos mais tradicionais para ver o pôr do sol?', o: ['Usina do Gasômetro', 'Aeroporto Salgado Filho', 'Estádio Beira-Rio (interno)', 'Rodoviária'], c: 0 },
    { p: 'Qual é a cor principal da camisa do Internacional?', o: ['Vermelha', 'Azul', 'Verde', 'Amarela'], c: 0 },
  ];
  let quiz = null;

  function novoQuiz() {
    const perguntas = embaralhar(PERGUNTAS).slice(0, 6).map((q) => {
      const opcoes = embaralhar(q.o.map((t, i) => ({ t, certa: i === q.c })));
      return { p: q.p, opcoes };
    });
    quiz = { perguntas, atual: 0, pontos: 0 };
    desenharQuiz();
  }

  function desenharQuiz() {
    const box = $('#quizCorpo');
    box.replaceChildren();
    if (quiz.atual >= quiz.perguntas.length) {
      const n = quiz.pontos;
      const total = quiz.perguntas.length;
      const frase = n === total ? 'Gaúcho de coração! Gabaritou.' : n >= total - 2 ? 'Tri bem! Você conhece a cidade.' : 'Bom começo! Que tal tentar de novo?';
      box.appendChild(el('p', 'quiz-pergunta', 'Você acertou ' + n + ' de ' + total + '.'));
      box.appendChild(el('p', '', frase));
      const rod = el('div', 'quiz-rodape');
      const b = el('button', 'btn-sec', 'Jogar de novo');
      b.type = 'button';
      b.addEventListener('click', novoQuiz);
      rod.appendChild(b);
      box.appendChild(rod);
      return;
    }
    const q = quiz.perguntas[quiz.atual];
    box.appendChild(el('p', 'quiz-pergunta', q.p));
    const ops = el('div', 'quiz-opcoes');
    const rod = el('div', 'quiz-rodape');
    const prog = el('span', 'quiz-prog', 'Pergunta ' + (quiz.atual + 1) + ' de ' + quiz.perguntas.length);
    rod.appendChild(prog);
    q.opcoes.forEach((o) => {
      const b = el('button', '', o.t);
      b.type = 'button';
      b.addEventListener('click', () => {
        $$('button', ops).forEach((x) => (x.disabled = true));
        if (o.certa) { b.classList.add('certa'); quiz.pontos++; }
        else {
          b.classList.add('errada');
          const i = q.opcoes.findIndex((x) => x.certa);
          $$('button', ops)[i].classList.add('certa');
        }
        const prox = el('button', 'btn-sec', quiz.atual + 1 >= quiz.perguntas.length ? 'Ver resultado' : 'Próxima');
        prox.type = 'button';
        prox.addEventListener('click', () => { quiz.atual++; desenharQuiz(); });
        rod.appendChild(prox);
        prox.focus();
      });
      ops.appendChild(b);
    });
    box.appendChild(ops);
    box.appendChild(rod);
  }

  /* Forca */
  const PALAVRAS = [
    ['CHIMARRAO', 'Bebida símbolo do Rio Grande do Sul'],
    ['BERGAMOTA', 'Fruta que vira "tangerina" em outros estados'],
    ['GUAIBA', 'Águas que banham Porto Alegre'],
    ['CHURRASCO', 'Tradição de domingo no sul'],
    ['FARROUPILHA', 'Nome do parque da Redenção'],
    ['GASOMETRO', 'Usina à beira do Guaíba, ótima para o pôr do sol'],
    ['REDENCAO', 'Parque onde acontece o Brique aos domingos'],
    ['CUIA', 'Vasilha do chimarrão'],
    ['BOMBA', 'Peça de metal usada para tomar chimarrão'],
    ['PAMPA', 'Paisagem de campos do sul'],
    ['ERVAMATE', 'Planta usada no chimarrão'],
    ['GAUCHO', 'Quem nasce no Rio Grande do Sul'],
  ];
  const MAX_ERROS = 6;
  let forca = null;

  function novaForca() {
    const [palavra, dica] = PALAVRAS[Math.floor(Math.random() * PALAVRAS.length)];
    forca = { palavra, dica, usadas: new Set(), erros: 0 };
    desenharForca();
  }

  function desenharForca() {
    const box = $('#forcaCorpo');
    box.replaceChildren();
    const f = forca;
    const ganhou = [...f.palavra].every((l) => f.usadas.has(l));
    const perdeu = f.erros >= MAX_ERROS;

    const info = el('div', 'forca-info');
    info.appendChild(el('span', '', 'Dica: ' + f.dica));
    box.appendChild(info);

    const pal = el('div', 'forca-palavra');
    pal.setAttribute('aria-label', 'Palavra com ' + f.palavra.length + ' letras');
    [...f.palavra].forEach((l) => pal.appendChild(el('span', '', f.usadas.has(l) || perdeu ? l : '')));
    box.appendChild(pal);

    const vidas = el('p', 'forca-info');
    vidas.appendChild(el('span', '', 'Chances:'));
    const cor = el('span', 'vidas', '♥'.repeat(MAX_ERROS - f.erros) + '♡'.repeat(f.erros));
    cor.setAttribute('aria-label', (MAX_ERROS - f.erros) + ' chances restantes');
    vidas.appendChild(cor);
    box.appendChild(vidas);

    const tec = el('div', 'teclado');
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((l) => {
      const b = el('button', '', l);
      b.type = 'button';
      const usada = f.usadas.has(l);
      b.disabled = usada || ganhou || perdeu;
      if (usada && f.palavra.includes(l)) b.classList.add('acerto');
      b.addEventListener('click', () => {
        f.usadas.add(l);
        if (!f.palavra.includes(l)) f.erros++;
        desenharForca();
      });
      tec.appendChild(b);
    });
    box.appendChild(tec);

    const msg = el('p', 'forca-msg', ganhou ? 'Acertou! Bah, que tri!' : perdeu ? 'Foi por pouco. A palavra era ' + f.palavra + '.' : '');
    msg.setAttribute('role', 'status');
    box.appendChild(msg);

    const nova = el('button', 'btn-sec', ganhou || perdeu ? 'Jogar outra' : 'Trocar palavra');
    nova.type = 'button';
    nova.id = 'forcaNova';
    nova.addEventListener('click', novaForca);
    box.appendChild(nova);
  }

  /* ============================================================== */
  /* Pedidos                                                         */
  /* ============================================================== */
  $('#formPedido').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const resp = $('#pResp');
    resp.className = '';
    const texto = $('#pTexto').value.trim();
    if (texto.length < 3) {
      resp.className = 'erro';
      resp.textContent = 'Escreva a música ou o recado antes de enviar.';
      return;
    }
    try {
      await api('/api/pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: $('#pNome').value,
          texto,
          tipo: $('input[name="tipo"]:checked').value,
        }),
      });
      resp.textContent = 'Enviado! Sua mensagem chegou para a equipe da rádio.';
      $('#pTexto').value = '';
    } catch (e) {
      resp.className = 'erro';
      resp.textContent = e.message;
    }
  });

  /* ============================================================== */
  /* Início                                                          */
  /* ============================================================== */
    async function iniciar() {
    iniciarHoroscopo();
    iniciarGauches();
    novoQuiz();
    novaForca();

    try {
      CFG = await api('/api/config');
    } catch (e) { /* usa o padrão */ }
    document.title = CFG.nomeRadio + ' - rádio online, notícias e horóscopo';
    if ($('#marca')) $('#marca').textContent = CFG.nomeRadio;
    if ($('#hNome')) $('#hNome').textContent = CFG.nomeRadio;
    if ($('#hSlogan')) $('#hSlogan').textContent = CFG.slogan || '';
    if ($('#rodapeNome')) $('#rodapeNome').textContent = CFG.nomeRadio;
    atualizarTextosRadio();

    if (CFG.categorias) montarChips(CFG.categorias);
    
    // Pequena pausa inteligente de 1.5 segundos para a Render acordar o banco de dados antes de listar as notícias
    setTimeout(() => {
        carregarNoticias(false);
        carregarClima();
        carregarResumo();
        atualizarAoVivo();
    }, 1500);

    setInterval(atualizarAoVivo, 20000);
    setInterval(() => carregarNoticias(false), 10 * 60000);
    setInterval(carregarClima, 30 * 60000);
  }

  iniciar();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* opcional */ });
  }
})();