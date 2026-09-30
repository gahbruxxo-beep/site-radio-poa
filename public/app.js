name=public/js/app.js
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // Elementos do DOM
  const audio = document.getElementById('audio-stream');
  const btnPlayStop = document.getElementById('btn-play-stop');
  const iconPlay = btnPlayStop.querySelector('.icon-play');
  const iconPause = btnPlayStop.querySelector('.icon-pause');
  const playText = document.getElementById('play-text');
  const volumeRange = document.getElementById('volume-range');
  const currentTrack = document.getElementById('current-track');
  const vinylDisc = document.getElementById('vinyl-disc');
  const liveBadge = document.getElementById('live-badge');
  
  const widgetTempo = document.getElementById('widget-tempo');
  const tabs = document.querySelectorAll('.tab-btn');
  const sections = document.querySelectorAll('.tab-section');

  let configGlobal = null;
  let streamUrlGlobal = '';

  // 1. Carregar Configurações e Inicializar
  async function carregarConfig() {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('Erro ao carregar config');
      configGlobal = await res.json();
      streamUrlGlobal = configGlobal.streamUrl;
      
      // Montar categorias de notícias na UI
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
        alert('Não foi possível iniciar a reprodução automática. Tente novamente.');
        console.error(err);
      });
    } else {
      audio.pause();
      audio.src = ''; // Limpa para cortar conexão de streaming e economizar banda
      tocando = false;
      atualizarUIPlay(false);
    }
  });

  function atualizarUIPlay(estado) {
    if (estado) {
      iconPlay.style.display = 'none';
      iconPause.style.display = 'block';
      playText.textContent = 'Pausar Rádio';
      vinylDisc.classList.add('spinning');
      liveBadge.classList.add('active');
    } else {
      iconPlay.style.display = 'block';
      iconPause.style.display = 'none';
      playText.textContent = 'Ouvir Rádio';
      vinylDisc.classList.remove('spinning');
      liveBadge.classList.remove('active');
    }
  }

  volumeRange.addEventListener('input', (e) => {
    audio.volume = e.target.value;
  });
  audio.volume = volumeRange.value;

  // 3. Buscar "No ar agora" (Música atual)
  async function atualizarAoVivo() {
    try {
      const res = await fetch('/api/aovivo');
      if (!res.ok) return;
      const data = await res.json();
      if (data.musica) {
        currentTrack.textContent = data.musica;
      } else {
        currentTrack.textContent = configGlobal ? configGlobal.slogan : 'Web Rádio Zona Sul POA';
      }
    } catch (e) {
      // Silencioso em caso de falha de rede temporária
    }
  }
  setInterval(atualizarAoVivo, 15000);

  // 4. Previsão do Tempo (Open-Meteo para Porto Alegre)
  async function carregarTempo() {
    try {
      // Coordenadas aproximadas de Porto Alegre (-30.033, -51.23)
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-30.033&longitude=-51.23&current=temperature_2m,weather_code');
      if (!res.ok) return;
      const data = await res.json();
      const temp = Math.round(data.current.temperature_2m);
      const code = data.current.weather_code;
      
      let icone = '⛅';
      if (code === 0) icone = '☀️';
      else if (code >= 1 && code <= 3) icone = '⛅';
      else if (code >= 51 && code <= 67) icone = '🌧️';
      else if (code >= 95) icone = '⚡';

      widgetTempo.querySelector('.tempo-icone').textContent = icone;
      widgetTempo.querySelector('.tempo-temp').textContent = temp + '°C';
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
      document.getElementById(target).classList.add('active');
    });
  });

  // 6. Notícias e Resumo IA
  let categoriaAtual = 'todas';
  let periodoAtual = 'hoje';

  function montarCategoriasChips(categorias) {
    const container = document.getElementById('categorias-chips');
    categorias.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.setAttribute('data-cat', cat.id);
      btn.textContent = cat.nome;
      btn.addEventListener('click', () => {
        container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        categoriaAtual = cat.id;
        carregarNoticias();
      });
      container.appendChild(btn);
    });
    // Adiciona evento ao chip "Todas" que já está no HTML
    container.querySelector('[data-cat="todas"]').addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      container.querySelector('[data-cat="todas"]').classList.add('active');
      categoriaAtual = 'todas';
      carregarNoticias();
    });

    carregarNoticias();
    carregarResumoIA();
  }

  async function carregarNoticias() {
    const container = document.getElementById('news-container');
    container.innerHTML = '<div class="loading-state">Carregando notícias...</div>';

    try {
      const res = await fetch(`/api/news?cat=${categoriaAtual}&periodo=${periodoAtual}`);
      if (!res.ok) throw new Error('Erro ao buscar notícias');
      const data = await res.json();

      if (data.carregando) {
        container.innerHTML = '<div class="loading-state">Sintonizando feeds de notícias, aguarde um instante...</div>';
        setTimeout(carregarNoticias, 3000); // Tenta novamente em 3s se ainda estiver no boot
        return;
      }

      if (!data.itens || data.itens.length === 0) {
        container.innerHTML = '<div class="loading-state">Nenhuma notícia encontrada para este período.</div>';
        return;
      }

      container.innerHTML = '';
      data.itens.forEach(item => {
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
    } catch (e) {
      container.innerHTML = '<div class="loading-state">Não foi possível carregar as notícias no momento.</div>';
    }
  }

  async function carregarResumoIA() {
    const cardResumo = document.getElementById('ai-resumo-card');
    const textoResumo = document.getElementById('ai-resumo-texto');

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

  // Filtros de período (Hoje / Semana)
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      periodoAtual = e.target.getAttribute('data-periodo');
      carregarNoticias();
    });
  });

  // 7. Envio de Pedidos e Recados
  const formPedido = document.getElementById('form-pedido');
  const inputTexto = document.getElementById('input-texto');
  const charsRestantes = document.getElementById('chars-restantes');
  const pedidoFeedback = document.getElementById('pedido-feedback');

  inputTexto.addEventListener('input', () => {
    const restante = 300 - inputTexto.value.length;
    charsRestantes.textContent = restante;
  });

  formPedido.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('input-nome').value.trim();
    const tipo = formPedido.querySelector('input[name="tipo"]:checked').value;
    const texto = inputTexto.value.trim();

    if (texto.length < 3) {
      mostrarFeedback(pedidoFeedback, 'Escreva uma mensagem um pouco mais longa.', 'error');
      return;
    }

    const btnEnviar = document.getElementById('btn-enviar-pedido');
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando...';

    try {
      const res = await fetch('/api/pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, tipo, texto })
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

  // Inicialização
  carregarConfig();
  atualizarAoVivo();

  // Registro do Service Worker para PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});