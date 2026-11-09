/* HUB Suri · utilitários compartilhados (sessão, logout, pill de usuário) */
(function (w) {
  var SESSION_KEY = 'suri_hub_auth';
  var THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  function read() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch (e) { return null; }
  }

  var Hub = {
    SESSION_KEY: SESSION_KEY,
    ALLOWED_DOMAIN: '@suri.ai',
    PASSWORD: 'Suri#Vendas2026!',
    /* OAuth Client ID (público por natureza). A chave secreta NÃO deve ficar neste repositório. */
    GOOGLE_CLIENT_ID: '614405209562-3kdiln3kscc8dr7j1abhbevp3r5rb1ar.apps.googleusercontent.com',

    isValid: function () {
      var s = read();
      return !!(s && s.ok && (Date.now() - s.ts) <= THIRTY_DAYS);
    },

    email: function () {
      var s = read();
      return (s && s.email) || '';
    },

    login: function (email, pass) {
      email = (email || '').trim().toLowerCase();
      var okEmail = email.endsWith(Hub.ALLOWED_DOMAIN) && email.length > Hub.ALLOWED_DOMAIN.length;
      if (!okEmail || pass !== Hub.PASSWORD) return false;
      try { localStorage.setItem(SESSION_KEY, JSON.stringify({ ok: true, ts: Date.now(), email: email })); } catch (e) {}
      return true;
    },

    /* Login com Google: recebe o ID token (JWT) do Google Identity Services e valida
       audiência, expiração, e-mail verificado e domínio @suri.ai. */
    loginWithGoogle: function (credential) {
      var p = decodeJwt(credential);
      if (!p) return { ok: false, reason: 'invalid' };
      var email = String(p.email || '').toLowerCase();
      if (p.aud !== Hub.GOOGLE_CLIENT_ID || !p.exp || p.exp * 1000 < Date.now()) return { ok: false, reason: 'invalid' };
      if (!p.email_verified || !email.endsWith(Hub.ALLOWED_DOMAIN)) return { ok: false, reason: 'domain', email: email };
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          ok: true, ts: Date.now(), email: email, via: 'google', name: p.name || '', picture: p.picture || ''
        }));
      } catch (e) {}
      return { ok: true, email: email };
    },

    logout: function (root) {
      try { if (w.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) {}
      try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
      w.location.href = (root || '') + 'index.html';
    },

    /* Páginas internas: chama no <head>. Sem sessão válida, volta para o login do HUB. */
    guard: function (root) {
      if (!Hub.isValid()) {
        try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
        w.location.replace((root || '') + 'index.html');
      }
    },

    /* Preenche qualquer elemento [data-user-pill] com o e-mail logado */
    mountUserPill: function () {
      var email = Hub.email();
      if (!email) return;
      var name = email.split('@')[0].replace(/[._-]+/g, ' ');
      document.querySelectorAll('[data-user-pill]').forEach(function (el) {
        el.innerHTML = '<span class="avatar">' + name.charAt(0) + '</span><span>' + name + '</span>';
        el.hidden = false;
      });
    }
  };

  function decodeJwt(token) {
    try {
      var b64 = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { return null; }
  }

  w.Hub = Hub;
  document.addEventListener('DOMContentLoaded', Hub.mountUserPill);
})(window);
