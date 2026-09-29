'use strict';
/*
 * SiteRadio - servidor
 * Não precisa instalar nada além do Node.js (versão 18 ou mais nova).
 * Para ligar: dê dois cliques em "iniciar.bat" (Windows).
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const RAIZ = __dirname;
const PUBLICO = path.join(RAIZ, 'public');
const DADOS = path.join(RAIZ, 'dados');
const ARQ_PEDIDOS = path.join(DADOS, 'pedidos.json');

function lerJson(arq, padrao) {
  try {
    return JSON.parse(fs.readFileSync(arq, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    return padrao;
  }
}

const config = lerJson(path.join(RAIZ, 'config.json'), null);
if (!config) {
  console.error('ERRO: não consegui ler o arquivo config.json. Confira se ele está na mesma pasta e sem erros de digitação.');
  process.exit(1);
}
const PORTA = Number(process.env.PORT) || config.porta || 3000;
const UA = 'Mozilla/5.0 (compatible; SiteRadio/1.0)';

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */
async function buscarTexto(url, ms = 8000, extra = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { 'User-Agent': UA, Accept: '*/*', ...(extra.headers || {}) },
      redirect: 'follow',
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

function decodificar(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function limparTexto(s) {
  return decodificar(
    String(s || '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pegarTag(bloco, nome) {
  const m = bloco.match(new RegExp('<' + nome + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + nome + '>', 'i'));
  return m ? m[1] : '';
}

function chaveTitulo(t) {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 60);
}

/* ------------------------------------------------------------------ */
/* Notícias (leitura de feeds RSS)                                     */
/* ------------------------------------------------------------------ */
function lerFeed(xml, nomePadrao) {
  const itens = [];
  const blocos = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const b of blocos) {
    let titulo = limparTexto(pegarTag(b, 'title'));
    let link = limparTexto(pegarTag(b, 'link'));
    if (!link) {
      const m = b.match(/<link[^>]*href="([^"]+)"/i);
      if (m) link = decodificar(m[1]);
    }
    const dataTxt = limparTexto(pegarTag(b, 'pubDate')) || limparTexto(pegarTag(b, 'dc:date'));
    const data = new Date(dataTxt);
    let fonte = limparTexto(pegarTag(b, 'source')) || nomePadrao || '';
    if (fonte && titulo.endsWith(' - ' + fonte)) titulo = titulo.slice(0, -(fonte.length + 3)).trim();
    if (!titulo || !link || isNaN(data.getTime())) continue;
    if (!/^https?:\/\//i.test(link)) continue;
    itens.push({ titulo, link, fonte, data: data.toISOString() });
  }
  return itens;
}

function urlGoogleNews(consulta) {
  return (
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent(consulta + ' when:7d') +
    '&hl=pt-BR&gl=BR&ceid=BR:pt-419'
  );
}

const cacheNoticias = {}; // id -> { ts, itens, erro }
let ultimaForcada = 0;

async function atualizarCategoria(cat) {
  const fontes = [{ url: urlGoogleNews(cat.consulta), nome: '' }];
  for (const f of config.feedsExtras || []) if (f.cat === cat.id) fontes.push({ url: f.url, nome: f.nome });

  let todos = [];
  let falhas = 0;
  await Promise.all(
    fontes.map(async (f) => {
      try {
        const xml = await buscarTexto(f.url, 10000);
        todos = todos.concat(lerFeed(xml, f.nome));
      } catch (e) {
        falhas++;
      }
    })
  );
  const vistos = new Set();
  const unicos = [];
  todos.sort((a, b) => new Date(b.data) - new Date(a.data));
  for (const it of todos) {
    const k = chaveTitulo(it.titulo);
    if (vistos.has(k)) continue;
    vistos.add(k);
    unicos.push({ ...it, cat: cat.id });
  }
  const antigo = cacheNoticias[cat.id];
  if (!unicos.length && antigo && antigo.itens.length) {
    // mantém o que já tinha se a busca falhou
    antigo.erro = true;
    return;
  }
  const falhouTudo = falhas === fontes.length;
  cacheNoticias[cat.id] = { ts: falhouTudo ? 0 : Date.now(), itens: unicos.slice(0, 40), erro: falhouTudo };
}

async function atualizarTudo() {
  for (const cat of config.categorias) {
    try {
      await atualizarCategoria(cat);
    } catch (e) {
      /* segue para a próxima */
    }
  }
  resumoCache = null; // força novo resumo depois de novas notícias
}

function listarNoticias(catId, periodo) {
  const limite = (periodo === 'hoje' ? 24 : 24 * 7) * 3600 * 1000;
  const agora = Date.now();
  const ids = catId && catId !== 'todas' ? [catId] : config.categorias.map((c) => c.id);
  let itens = [];
  let ts = 0;
  for (const id of ids) {
    const c = cacheNoticias[id];
    if (!c) continue;
    ts = Math.max(ts, c.ts);
    itens = itens.concat(c.itens);
  }
  itens = itens.filter((i) => agora - new Date(i.data).getTime() <= limite);
  itens.sort((a, b) => new Date(b.data) - new Date(a.data));
  const vistos = new Set();
  const finais = [];
  for (const it of itens) {
    const k = chaveTitulo(it.titulo);
    if (vistos.has(k)) continue;
    vistos.add(k);
    finais.push(it);
  }
  const tentou = ids.every((id) => cacheNoticias[id]);
  const falha = tentou && ids.every((id) => cacheNoticias[id].erro && !cacheNoticias[id].itens.length);
  return { atualizadoEm: ts ? new Date(ts).toISOString() : null, itens: finais.slice(0, 30), falha };
}

/* ------------------------------------------------------------------ */
/* Resumo do dia por I.A. (opcional)                                   */
/* ------------------------------------------------------------------ */
let resumoCache = null; // { ts, texto }

async function gerarResumo() {
  const ia = config.ia || {};
  if (!ia.ativa) return { ativo: false };
  const chave = process.env.GEMINI_API_KEY || ia.chave;
  if (!chave) return { ativo: false };
  if (resumoCache && Date.now() - resumoCache.ts < 2 * 3600 * 1000) return { ativo: true, texto: resumoCache.texto };

  const base = listarNoticias('todas', 'hoje').itens.filter((i) => i.cat !== 'esporte').slice(0, 14);
  const esporte = listarNoticias('esporte', 'hoje').itens.slice(0, 3);
  const manchetes = base.concat(esporte).map((i) => '- ' + i.titulo + ' (' + i.fonte + ')');
  if (manchetes.length < 3) return { ativo: true, texto: null };

  const prompt =
    'Você é redator de uma rádio de Porto Alegre. Com base SOMENTE nestas manchetes de hoje, escreva um "Resumo do dia" ' +
    'em português do Brasil, com 3 a 4 frases curtas e claras, em tom simpático de rádio. ' +
    'Não invente nada que não esteja nas manchetes e não use marcações especiais.\n\n' +
    manchetes.join('\n');
  try {
    const modelo = ia.modelo || 'gemini-2.5-flash';
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const texto = j.candidates && j.candidates[0] && j.candidates[0].content.parts.map((p) => p.text || '').join('').trim();
    if (!texto) throw new Error('vazio');
    resumoCache = { ts: Date.now(), texto };
    return { ativo: true, texto };
  } catch (e) {
    console.log('[resumo] não consegui gerar o resumo:', e.message);
    return { ativo: true, texto: null };
  }
}

/* ------------------------------------------------------------------ */
/* "No ar agora" (título da música e ouvintes)                          */
/* ------------------------------------------------------------------ */
let aoVivoCache = { ts: 0, dados: { musica: null, ouvintes: null } };

async function lerAoVivo() {
  if (Date.now() - aoVivoCache.ts < 10000) return aoVivoCache.dados;
  const base = String(config.streamUrl || '').replace(/[?#].*$/, '').replace(/[;\/]+$/, '');
  const tentativas = [
    async () => {
      const j = JSON.parse(await buscarTexto(base + '/stats?sid=1&json=1', 4000));
      return { musica: j.songtitle, ouvintes: j.currentlisteners };
    },
    async () => {
      const t = await buscarTexto(base + '/7.html', 4000);
      const m = t.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const p = (m ? m[1] : t).split(',');
      return { ouvintes: parseInt(p[0], 10), musica: p.slice(6).join(',').trim() };
    },
    async () => {
      const j = JSON.parse(await buscarTexto(base + '/status-json.xsl', 4000));
      let s = j.icestats.source;
      if (Array.isArray(s)) s = s[0];
      return { musica: s.title, ouvintes: s.listeners };
    },
  ];
  let dados = { musica: null, ouvintes: null };
  for (const t of tentativas) {
    try {
      const r = await t();
      const musica = r.musica ? limparTexto(r.musica) : null;
      dados = {
        musica: musica && musica.length < 200 ? musica : null,
        ouvintes: Number.isFinite(r.ouvintes) ? r.ouvintes : null,
      };
      if (dados.musica || dados.ouvintes !== null) break;
    } catch (e) {
      /* tenta o próximo formato */
    }
  }
  aoVivoCache = { ts: Date.now(), dados };
  return dados;
}

/* ------------------------------------------------------------------ */
/* Pedidos de música e recados                                         */
/* ------------------------------------------------------------------ */
const ultimoPedidoPorIp = new Map();
const tentativasAdminPorIp = new Map();
const sessoesAdmin = new Map();
const DURACAO_SESSAO_ADMIN = 12 * 60 * 60 * 1000;
const JANELA_TENTATIVAS_ADMIN = 15 * 60 * 1000;
const MAX_TENTATIVAS_ADMIN = 8;

function lerPedidos() {
  return lerJson(ARQ_PEDIDOS, []);
}
function gravarPedidos(lista) {
  fs.mkdirSync(DADOS, { recursive: true });
  fs.writeFileSync(ARQ_PEDIDOS, JSON.stringify(lista, null, 2), 'utf8');
}

function senhaCorreta(recebida) {
  const a = crypto.createHash('sha256').update(String(recebida || '')).digest();
  const b = crypto.createHash('sha256').update(String(config.senhaAdmin || '')).digest();
  return crypto.timingSafeEqual(a, b);
}

function cookies(req) {
  const resultado = {};
  for (const parte of String(req.headers.cookie || '').split(';')) {
    const pos = parte.indexOf('=');
    if (pos > 0) resultado[parte.slice(0, pos).trim()] = decodeURIComponent(parte.slice(pos + 1).trim());
  }
  return resultado;
}

function limparSessoesAdmin() {
  const agora = Date.now();
  for (const [token, expiraEm] of sessoesAdmin) if (expiraEm <= agora) sessoesAdmin.delete(token);
}

function sessaoAdminValida(req) {
  limparSessoesAdmin();
  const token = cookies(req).sr_admin;
  return Boolean(token && sessoesAdmin.get(token) > Date.now());
}

function cookieSessao(req, token) {
  const seguro = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https' ? '; Secure' : '';
  return 'sr_admin=' + encodeURIComponent(token) + '; Path=/api/admin; Max-Age=' + Math.floor(DURACAO_SESSAO_ADMIN / 1000) + '; HttpOnly; SameSite=Strict' + seguro;
}

/* ------------------------------------------------------------------ */
/* Servidor web                                                        */
/* ------------------------------------------------------------------ */
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  "connect-src 'self' https://api.open-meteo.com",
  'media-src *',
  "frame-ancestors 'self'",
].join('; ');

function responderJson(res, status, obj, extras = {}) {
  const corpo = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extras,
  });
  res.end(corpo);
}

function lerCorpo(req, limite = 5000) {
  return new Promise((resolve, reject) => {
    let tam = 0;
    const partes = [];
    req.on('data', (c) => {
      tam += c.length;
      if (tam > limite) {
        reject(new Error('grande'));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    req.on('error', reject);
  });
}

function servirArquivo(req, res, caminhoUrl) {
  let p;
  try {
    p = decodeURIComponent(caminhoUrl);
  } catch (e) {
    res.writeHead(400);
    return res.end('Pedido inválido');
  }
  if (p === '/admin') p = '/admin.html';
  if (p.endsWith('/')) p += 'index.html';
  const arq = path.normalize(path.join(PUBLICO, p));
  if (!arq.startsWith(PUBLICO + path.sep)) {
    res.writeHead(403);
    return res.end('Acesso negado');
  }
  fs.stat(arq, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Página não encontrada');
    }
    const ext = path.extname(arq).toLowerCase();
    const cache = /\.(png|svg|ico)$/.test(ext) ? 'public, max-age=86400' : 'no-cache';
    res.writeHead(200, {
      'Content-Type': TIPOS[ext] || 'application/octet-stream',
      'Cache-Control': cache,
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(arq).pipe(res);
  });
}

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const rota = url.pathname;

    if (rota === '/api/config' && req.method === 'GET') {
      return responderJson(res, 200, {
        nomeRadio: config.nomeRadio,
        slogan: config.slogan,
        streamUrl: config.streamUrl,
        cidade: config.cidade,
        categorias: config.categorias.map((c) => ({ id: c.id, nome: c.nome })),
      });
    }

    if (rota === '/api/news' && req.method === 'GET') {
      const cat = url.searchParams.get('cat') || 'todas';
      const periodo = url.searchParams.get('periodo') === 'hoje' ? 'hoje' : 'semana';
      if (url.searchParams.get('forcar') === '1' && Date.now() - ultimaForcada > 60000) {
        ultimaForcada = Date.now();
        await atualizarTudo();
      }
      return responderJson(res, 200, listarNoticias(cat, periodo));
    }

    if (rota === '/api/resumo' && req.method === 'GET') {
      return responderJson(res, 200, await gerarResumo());
    }

    if (rota === '/api/aovivo' && req.method === 'GET') {
      return responderJson(res, 200, await lerAoVivo());
    }

    if (rota === '/api/pedido' && req.method === 'POST') {
      const ip = req.socket.remoteAddress || '?';
      const agora = Date.now();
      if (agora - (ultimoPedidoPorIp.get(ip) || 0) < 60000) {
        return responderJson(res, 429, { erro: 'Aguarde um minutinho antes de enviar outro.' });
      }
      let d;
      try {
        d = JSON.parse(await lerCorpo(req));
      } catch (e) {
        return responderJson(res, 400, { erro: 'Não entendi o que foi enviado.' });
      }
      const nome = String(d.nome || '').trim().slice(0, 40);
      const texto = String(d.texto || '').trim().slice(0, 300);
      const tipo = d.tipo === 'recado' ? 'recado' : 'musica';
      if (texto.length < 3) return responderJson(res, 400, { erro: 'Escreva um pouquinho mais.' });
      const lista = lerPedidos();
      lista.push({ id: crypto.randomBytes(6).toString('hex'), data: new Date().toISOString(), nome: nome || 'Ouvinte', tipo, texto });
      gravarPedidos(lista.slice(-500));
      ultimoPedidoPorIp.set(ip, agora);
      return responderJson(res, 200, { ok: true });
    }

    if (rota === '/api/admin/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress || '?';
      const agora = Date.now();
      const registro = tentativasAdminPorIp.get(ip);
      if (registro && registro.bloqueadoAte > agora) return responderJson(res, 429, { erro: 'Aguarde alguns minutos antes de tentar novamente.' });
      let dados;
      try {
        dados = JSON.parse(await lerCorpo(req, 1000));
      } catch (e) {
        return responderJson(res, 400, { erro: 'Não entendi a senha enviada.' });
      }
      if (!senhaCorreta(dados.senha)) {
        const dentroDaJanela = registro && agora - registro.inicio < JANELA_TENTATIVAS_ADMIN;
        const tentativas = dentroDaJanela ? registro.tentativas + 1 : 1;
        tentativasAdminPorIp.set(ip, { inicio: dentroDaJanela ? registro.inicio : agora, tentativas, bloqueadoAte: tentativas >= MAX_TENTATIVAS ? agora + JANELA_TENTATIVAS_ADMIN : 0 });
        return responderJson(res, 401, { erro: 'Senha incorreta.' });
      }
      tentativasAdminPorIp.delete(ip);
      const token = crypto.randomBytes(32).toString('base64url');
      sessoesAdmin.set(token, agora + DURACAO_SESSAO_ADMIN);
      return responderJson(res, 200, { ok: true }, { 'Set-Cookie': cookieSessao(req, token) });
    }

    if (rota === '/api/admin/logout' && req.method === 'POST') {
      const token = cookies(req).sr_admin;
      if (token) sessoesAdmin.delete(token);
      return responderJson(res, 200, { ok: true }, { 'Set-Cookie': 'sr_admin=; Path=/api/admin; Max-Age=0; HttpOnly; SameSite=Strict' });
    }

    if (rota.startsWith('/api/admin/')) {
      if (!sessaoAdminValida(req)) return responderJson(res, 401, { erro: 'Entre novamente para acessar o painel.' });
      if (rota === '/api/admin/pedidos' && req.method === 'GET') {
        return responderJson(res, 200, { pedidos: lerPedidos().reverse() });
      }
      const m = rota.match(/^\/api\/admin\/pedidos\/([a-f0-9]+)$/);
      if (m && req.method === 'DELETE') {
        gravarPedidos(lerPedidos().filter((p) => p.id !== m[1]));
        return responderJson(res, 200, { ok: true });
      }
      return responderJson(res, 404, { erro: 'Não encontrado.' });
    }

    if (rota.startsWith('/api/')) return responderJson(res, 404, { erro: 'Não encontrado.' });

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end();
    }
    return servirArquivo(req, res, rota);
  } catch (e) {
    console.log('[erro]', e.message);
    if (!res.headersSent) responderJson(res, 500, { erro: 'Algo deu errado por aqui.' });
  }
});

/* ------------------------------------------------------------------ */
/* Partida                                                             */
/* ------------------------------------------------------------------ */
if (require.main === module) {
  fs.mkdirSync(DADOS, { recursive: true });
  servidor.listen(PORTA, '0.0.0.0', () => {
    console.log('');
    console.log('  ' + config.nomeRadio + ' - site no ar!');
    console.log('  --------------------------------------------');
    console.log('  Neste computador:   http://localhost:' + PORTA);
    for (const lista of Object.values(os.networkInterfaces())) {
      for (const i of lista || []) {
        if (i.family === 'IPv4' && !i.internal) console.log('  No celular (mesmo Wi-Fi): http://' + i.address + ':' + PORTA);
      }
    }
    console.log('  Painel de pedidos:  http://localhost:' + PORTA + '/admin');
    console.log('');
    console.log('  Deixe esta janela aberta. Para desligar, feche a janela.');
    console.log('');
  });
  servidor.on('error', (e) => {
    if (e.code === 'EADDRINUSE') console.error('A porta ' + PORTA + ' já está em uso. Feche outra janela do site ou mude "porta" no config.json.');
    else console.error(e);
    process.exit(1);
  });
  atualizarTudo().then(() => console.log('[noticias] primeira busca concluída.'));
  setInterval(atualizarTudo, Math.max(5, config.atualizarNoticiasACadaMinutos || 15) * 60000);
}

module.exports = { lerFeed, chaveTitulo, listarNoticias, servidor };
