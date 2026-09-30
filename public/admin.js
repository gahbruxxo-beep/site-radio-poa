(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  async function chamar(url, opcoes = {}) {
    const r = await fetch(url, { credentials: 'same-origin', ...opcoes });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro');
    return j;
  }
  function mostrarLogin(mensagem = '') {
    $('#login').hidden = false;
    $('#area').hidden = true;
    $('#erro').textContent = mensagem;
  }

  async function carregarOuvintesAdmin() {
    if (document.hidden) return;
    try {
      const d = await chamar('/api/admin/ouvintes');
      const box = $('#adminOuvintes');
      if (box) {
        box.textContent = (d.ouvintes !== null && d.ouvintes !== undefined) ? d.ouvintes : '0';
      }
    } catch (e) {
      if (e.message && (e.message.includes('401') || e.message.includes('Sua sessão'))) {
        mostrarLogin('Sua sessão terminou. Entre novamente.');
      }
    }
  }

  async function carregar() {
    const d = await chamar('/api/admin/pedidos');
    $('#login').hidden = true;
    $('#area').hidden = false;
    $('#contagem').textContent = d.pedidos.length + (d.pedidos.length === 1 ? ' mensagem' : ' mensagens');
    const lista = $('#lista');
    lista.replaceChildren();
    if (!d.pedidos.length) lista.appendChild(Object.assign(document.createElement('p'), { textContent: 'Nenhum pedido ainda.' }));
    d.pedidos.forEach((p) => {
      const box = document.createElement('div');
      box.className = 'pedido ' + p.tipo;
      box.style.cssText = 'background: #fff; border-left: 6px solid ' + (p.tipo === 'musica' ? '#FFC145' : '#24506A') + '; padding: 12px 16px; margin-bottom: 12px; border-radius: 4px;';
      const topo = document.createElement('div');
      topo.style.cssText = 'display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: .9rem; color: #4A5270;';
      const t = Object.assign(document.createElement('span'), { style: 'font-weight: 700; color: #1B2140;', textContent: (p.tipo === 'musica' ? 'Pedido de música' : 'Recado') + ' de ' + p.nome });
      const quando = Object.assign(document.createElement('span'), { textContent: new Date(p.data).toLocaleString('pt-BR') });
      topo.append(t, quando);
      const txt = Object.assign(document.createElement('p'), { style: 'margin: 6px 0 10px; white-space: pre-wrap; overflow-wrap: anywhere;', textContent: p.texto });
      const apagar = Object.assign(document.createElement('button'), { className: 'sec', type: 'button', textContent: 'Já li, apagar' });
      apagar.addEventListener('click', async () => {
        try { await chamar('/api/admin/pedidos/' + p.id, { method: 'DELETE' }); await carregar(); } catch (e) { alert(e.message); }
      });
      box.append(topo, txt, apagar);
      lista.appendChild(box);
    });
    carregarOuvintesAdmin();
  }

  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const senha = $('#senha').value;
    try {
      await chamar('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha }) });
      $('#senha').value = '';
      $('#erro').textContent = '';
      await carregar();
    } catch (err) { $('#erro').textContent = err.message; }
  });
  $('#atualizar').addEventListener('click', () => carregar().catch((e) => mostrarLogin(e.message)));
  $('#sair').addEventListener('click', async () => { await chamar('/api/admin/logout', { method: 'POST' }).catch(() => {}); mostrarLogin(); });
  
  carregar().catch(() => mostrarLogin());
  setInterval(() => { if (!$('#area').hidden) { carregar().catch(() => mostrarLogin('Sua sessão terminou. Entre novamente.')); } }, 30000);
  setInterval(() => { if (!$('#area').hidden) { carregarOuvintesAdmin(); } }, 20000);
})();