name=public/js/admin.js
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const loginContainer = document.getElementById('login-container');
  const mainContainer = document.getElementById('admin-main-container');
  const formLogin = document.getElementById('form-login');
  const loginFeedback = document.getElementById('login-feedback');
  const btnLogout = document.getElementById('btn-logout');
  const btnAtualizar = document.getElementById('btn-atualizar-pedidos');
  const tbody = document.getElementById('pedidos-tbody');
  const adminListeners = document.getElementById('admin-listeners');

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const senha = document.getElementById('input-senha').value;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.erro || 'Senha incorreta');
      }

      loginContainer.style.display = 'none';
      mainContainer.style.display = 'block';
      carregarPainelAdmin();
    } catch (err) {
      loginFeedback.textContent = err.message;
      loginFeedback.style.display = 'block';
      setTimeout(() => { loginFeedback.style.display = 'none'; }, 4000);
    }
  });

  btnLogout.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.reload();
  });

  btnAtualizar.addEventListener('click', carregarPainelAdmin);

  async function carregarPainelAdmin() {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando dados...</td></tr>';
    
    try {
      // Carrega ouvintes e pedidos em paralelo
      const [resOuvintes, resPedidos] = await Promise.all([
        fetch('/api/admin/ouvintes'),
        fetch('/api/admin/pedidos')
      ]);

      if (resOuvintes.status === 401 || resPedidos.status === 401) {
        window.location.reload();
        return;
      }

      if (resOuvintes.ok) {
        const dataOuvintes = await resOuvintes.json();
        adminListeners.textContent = `Ouvintes ao vivo: ${dataOuvintes.ouvintes !== null ? dataOuvintes.ouvintes : '--'}`;
      }

      if (!resPedidos.ok) throw new Error('Erro ao carregar pedidos');
      const dataPedidos = await resPedidos.json();

      if (!dataPedidos.pedidos || dataPedidos.pedidos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum pedido ou recado recebido ainda.</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      dataPedidos.pedidos.forEach(p => {
        const tr = document.createElement('tr');
        const dataFmt = new Date(p.data).toLocaleDateString('pt-BR', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });

        tr.innerHTML = `
          <td>${dataFmt}</td>
          <td><strong>${escapeHtml(p.nome)}</strong></td>
          <td><span class="badge-${p.tipo}">${p.tipo === 'musica' ? '🎵 Música' : '💬 Recado'}</span></td>
          <td>${escapeHtml(p.texto)}</td>
          <td>
            <button class="btn-delete" data-id="${p.id}">Apagar</button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      // Eventos dos botões de apagar
      tbody.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!confirm('Deseja realmente apagar este pedido/recado?')) return;

          try {
            const r = await fetch(`/api/admin/pedidos/${id}`, { method: 'DELETE' });
            if (r.ok) {
              carregarPainelAdmin();
            } else {
              alert('Erro ao apagar pedido.');
            }
          } catch (e) {
            alert('Erro de conexão ao apagar.');
          }
        });
      });

    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">Erro ao carregar os dados do painel.</td></tr>';
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Tenta carregar direto caso já haja cookie de sessão válido
  carregarPainelAdmin();
});