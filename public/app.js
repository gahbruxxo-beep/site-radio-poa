'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const $ = (s, r = document) => r.querySelector(s);   const $$ = (s, r = document) => r.querySelectorAll(s);

  // Detecção do modo TV
  const urlParams = new URLSearchParams(window.location.search);
  const ua = navigator.userAgent || '';
  const isTv = urlParams.get('tv') === '1' || ua.includes('WebRadioZonaSulTV') || /Android TV|AFT|SmartTV|GoogleTV|BRAVIA/i.test(ua);
  if (isTv) {
    document.body.classList.add('tv');
  }

  // Listener focusin com scrollIntoView válido APENAS no modo TV
  document.addEventListener('focusin', (e) => {
    if (document.body.classList.contains('tv')) {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  // Elementos do DOM
  const audio = $('#audio-stream');
  const btnPlayStop = $('#btn-play-stop');
  const iconPlay = $('.icon-play', btnPlayStop);
  const iconPause = $('.icon-pause', btnPlayStop);
  const playText = $('#play-text');
  const currentTrack = $('#current-track');
  const vinylDisc = $('#vinyl-disc');
  const liveBadge = $('#live-badge');
  const widgetTempo = $('#widget-tempo');
  const tabs = $$('.tab-btn');   const sections = $$('.tab-section');

  let configGlobal = null;
  let streamUrlGlobal = '';

  // 1. Carregar Configurações e Inicializar
  async function carregarConfig() {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('Erro ao carregar config');
      configGlobal = await res.json();
      streamUrlGlobal = configGlobal.streamUrl;
      montarCategoriasChips(configGlobal.categorias);
    } catch (e) {
      console.error('Erro config:', e);
    }
  }

  // 2. Controle do Player de Áudio
  let tocando = false;

  btnPlayStop.addEventListener('click', () => {
    if (!tocando) {
      if (!audio.src || audio.src === window.location.href) {
        audio.src = streamUrlGlobal;
      }
      audio.play().then(() => {
        tocando = true;
        atualizarUIPlay(true);
      }).catch(err => {
        console.error(err);
      });
    } else {
      audio.pause();
      audio.src = '';
      tocando = false;
      atualizarUIPlay(false);
    }
  });

  function atualizarUIPlay(estado) {
    if (estado) {
      if (iconPlay) iconPlay.style.display = 'none';
      if (iconPause) iconPause.style.display = 'block';
      if (playText) playText.textContent = 'Pausar Rádio';
      if (vinylDisc) vinylDisc.classList.add('spinning');
    } else {
      if (iconPlay) iconPlay.style.display = 'block';
      if (iconPause) iconPause.style.display = 'none';
      if (playText) playText.textContent = 'Ouvir Rádio';
      if (vinylDisc) vinylDisc.classList.remove('spinning');
    }
  }

  // 3. Buscar "No ar agora" e estado online/offline
  async function atualizarAoVivo() {
    try {
      const res = await fetch('/api/aovivo');
      if (!res.ok) return;
      const data = await res.json();
      if (data.musica) {
        currentTrack.textContent = data.musica;
      } else if (configGlobal) {
        currentTrack.textContent = configGlobal.slogan;
      }

      if (data.online === true) {
        liveBadge.innerHTML = '<span class="pulse-dot"></span> AO VIVO';
        liveBadge.classList.remove('offline');
        liveBadge.classList.add('active');
      } else if (data.online === false) {
        liveBadge.textContent = 'FORA DO AR';
        liveBadge.classList.remove('active', 'pulse-dot');
        liveBadge.classList.add('offline');
      } else {
        liveBadge.textContent = 'AO VIVO';
      }
    } catch (e) {
      // Silencioso em caso de falha de rede temporária
    }
  }
  setInterval(atualizarAoVivo, 15000);

  // 4. Previsão do Tempo (Open-Meteo para Porto Alegre)
  async function carregarTempo() {
    try {
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-30.033&longitude=-51.23&current=temperature_2m,weather_code');
      if (!res.ok) return;
      const data = await res.json();
      const temp = Math.round(data.current.temperature_2m);
      const code = data.current.weather_code;
      
      let icone = '⛅';
      if (code === 0) icone = '☀️️';
      else if (code >= 1 && code <= 3) icone = '⛅';
      else if (code >= 51 && code <= 67) icone = '🌧️';
      else if (code >= 95) icone = '⚡';

      const iconeEl = $('.tempo-icone', widgetTempo);
      const tempEl = $('.tempo-temp', widgetTempo);
      if (iconeEl) iconeEl.textContent = icone;
      if (tempEl) tempEl.textContent = temp + '°C';
    } catch (e) {
      // Mantém padrão caso falhe
    }
  }
  carregarTempo();

  // 5. Sistema de Abas
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      tab.classList.add('active');
      const target = tab.getAttribute('data-target');
      $('#' + target).classList.add('active');
    });
  });

  // 6. Notícias, Resumo IA e Paginação ("Ver mais" - 15 iniciais, +10 por clique)
  let categoriaAtual = 'todas';
  let periodoAtual = 'hoje';
  let listaItensNoticias = [];
  let limiteNoticiasVisiveis = 15;

  function montarCategoriasChips(categorias) {
    const container = $('#categorias-chips');
    categorias.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.setAttribute('data-cat', cat.id);
      btn.textContent = cat.nome;
      btn.addEventListener('click', () => {
        container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        categoriaAtual = cat.id;
        limiteNoticiasVisiveis = 15; // Reset ao trocar assunto
        carregarNoticias();
      });
      container.appendChild(btn);
    });
    
    const chipTodas = $('[data-cat="todas"]', container);
    if (chipTodas) {
      chipTodas.addEventListener('click', () => {
        container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chipTodas.classList.add('active');
        categoriaAtual = 'todas';
        limiteNoticiasVisiveis = 15; // Reset ao trocar assunto
        carregarNoticias();
      });
    }

    carregarNoticias();
    carregarResumoIA();
  }

  async function carregarNoticias() {
    const container = $('#news-container');
    const btnVerMais = $('#btn-ver-mais-noticias');
    container.innerHTML = '<div class="loading-state">Carregando notícias...</div>';
    if (btnVerMais) btnVerMais.style.display = 'none';

    try {
      const res = await fetch(`/api/news?cat=${categoriaAtual}&periodo=${periodoAtual}`);
      if (!res.ok) throw new Error('Erro ao buscar notícias');
      const data = await res.json();

      if (data.carregando) {
        container.innerHTML = '<div class="loading-state">Sintonizando feeds de notícias, aguarde um instante...</div>';
        setTimeout(carregarNoticias, 3000);
        return;
      }

      if (!data.itens || data.itens.length === 0) {
        container.innerHTML = '<div class="loading-state">Nenhuma notícia encontrada para este período.</div>';
        return;
      }

      listaItensNoticias = data.itens;
      renderizarFatiaNoticias();
    } catch (e) {
      container.innerHTML = '<div class="loading-state">Não foi possível carregar as notícias no momento.</div>';
    }
  }

  function renderizarFatiaNoticias() {
    const container = $('#news-container');
    const btnVerMais = $('#btn-ver-mais-noticias');
    container.innerHTML = '';

    const fatia = listaItensNoticias.slice(0, limiteNoticiasVisiveis);
    fatia.forEach(item => {
      const card = document.createElement('article');
      card.className = 'news-card';
      
      const dataFormatada = new Date(item.data).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });

      card.innerHTML = `
        <div class="news-meta">
          <span class="news-fonte">${escapeHtml(item.fonte || 'Notícia')}</span>
          <span class="news-data">${dataFormatada}</span>
        </div>
        <h3 class="news-titulo"><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.titulo)}</a></h3>
        <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="news-link">Ler matéria completa &rarr;</a>
      `;
      container.appendChild(card);
    });

    if (btnVerMais) {
      if (limiteNoticiasVisiveis < listaItensNoticias.length) {
        btnVerMais.style.display = 'block';
      } else {
        btnVerMais.style.display = 'none';
      }
    }
  }

  const btnVerMaisNoticias = $('#btn-ver-mais-noticias');
  if (btnVerMaisNoticias) {
    btnVerMaisNoticias.addEventListener('click', () => {
      limiteNoticiasVisiveis += 10;
      renderizarFatiaNoticias();
    });
  }

  async function carregarResumoIA() {
    const cardResumo = $('#ai-resumo-card');
    const textoResumo = $('#ai-resumo-texto');

    try {
      const res = await fetch('/api/resumo');
      if (!res.ok) return;
      const data = await res.json();
      if (data.ativo && data.texto) {
        textoResumo.textContent = data.texto;
        cardResumo.style.display = 'block';
      }
    } catch (e) {
      // Oculto em caso de erro
    }
  }

  $$('.filter-btn').forEach(btn => {     btn.addEventListener('click', (e) => {       $$
('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      periodoAtual = e.target.getAttribute('data-periodo');
      limiteNoticiasVisiveis = 15; // Reset ao trocar período
      carregarNoticias();
    });
  });

  // 7. Envio de Pedidos, Recados e Honeypot
  const formPedido = $('#form-pedido');
  const inputTexto = $('#input-texto');
  const charsRestantes = $('#chars-restantes');
  const pedidoFeedback = $('#pResp');

  inputTexto.addEventListener('input', () => {
    const restante = 300 - inputTexto.value.length;
    charsRestantes.textContent = restante;
  });

  formPedido.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = $('#input-nome').value.trim();
    const tipo = $('input[name="tipo"]:checked', formPedido).value;
    const texto = inputTexto.value.trim();
    const siteHoneypot = $('#input-site').value;

    if (texto.length < 3) {
      mostrarFeedback(pedidoFeedback, 'Escreva uma mensagem um pouco mais longa.', 'error');
      return;
    }

    const btnEnviar = $('#btn-enviar-pedido');
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando…';

    try {
      const res = await fetch('/api/pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, tipo, texto, site: siteHoneypot })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao enviar pedido');
      }

      mostrarFeedback(pedidoFeedback, 'Pedido enviado com sucesso para o estúdio!', 'success');
      formPedido.reset();
      charsRestantes.textContent = '300';
    } catch (err) {
      mostrarFeedback(pedidoFeedback, err.message, 'error');
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Enviar para o Locutor';
    }
  });

  function mostrarFeedback(el, msg, tipo) {
    el.textContent = msg;
    el.className = 'form-feedback ' + tipo;
    el.style.display = 'block';
    setTimeout(() => {
      el.style.display = 'none';
    }, 5000);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  carregarConfig();
  atualizarAoVivo();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});