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
      const topo = document.createElement('div');
      topo.className = 'topo';
      const t = Object.assign(document.createElement('span'), { className: 'tipo', textContent: (p.tipo === 'musica' ? 'Pedido de música' : 'Recado') + ' de ' + p.nome });
      const quando = Object.assign(document.createElement('span'), { textContent: new Date(p.data).toLocaleString('pt-BR') });
      topo.append(t, quando);
      const txt = Object.assign(document.createElement('p'), { textContent: p.texto });
      const apagar = Object.assign(document.createElement('button'), { className: 'sec', type: 'button', textContent: 'Já li, apagar' });
      apagar.addEventListener('click', async () => {
        try { await chamar('/api/admin/pedidos/' + p.id, { method: 'DELETE' }); await carregar(); } catch (e) { alert(e.message); }
      });
      box.append(topo, txt, apagar);
      lista.appendChild(box);
    });
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
  setInterval(() => { if (!$('#area').hidden) carregar().catch(() => mostrarLogin('Sua sessão terminou. Entre novamente.')); }, 30000);
})();
