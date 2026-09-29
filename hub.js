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

    logout: function (root) {
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

  w.Hub = Hub;
  document.addEventListener('DOMContentLoaded', Hub.mountUserPill);
})(window);
