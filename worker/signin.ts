/**
 * The only page a signed-out visitor gets: sign in, or create an account with
 * an invite code. It carries none of the app's code or content, so the app's
 * files stay behind the session cookie.
 */
export function signInPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#12402d" />
<meta name="robots" content="noindex" />
<link rel="icon" type="image/png" sizes="32x32" href="/brand/medallion-32.png" />
<link rel="shortcut icon" href="/favicon.ico?v=4" />
<link rel="apple-touch-icon" href="/brand/app-180.png" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Outfit:wght@300&display=swap" rel="stylesheet" />
<title>fintermship</title>
<style>
  :root { --bg: 246 244 238; --surface: 255 254 250; --line: 224 219 206; --ink: 20 34 28; --ink-2: 58 70 63; --ink-3: 114 122 112; --brand: 24 78 57; --brand-ink: 22 80 58; --bad-ink: 160 58 58; --bad-soft: 252 240 239; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]):not([data-theme="white"]) { --bg: 11 20 16; --surface: 18 31 25; --line: 40 58 49; --ink: 238 234 224; --ink-2: 208 210 199; --ink-3: 140 152 142; --brand: 40 112 82; --brand-ink: 222 172 126; --bad-ink: 240 150 150; --bad-soft: 60 28 28; } }
  :root[data-theme="dark"] { --bg: 11 20 16; --surface: 18 31 25; --line: 40 58 49; --ink: 238 234 224; --ink-2: 208 210 199; --ink-3: 140 152 142; --brand: 40 112 82; --brand-ink: 222 172 126; --bad-ink: 240 150 150; --bad-soft: 60 28 28; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body { background: rgb(var(--bg)); color: rgb(var(--ink)); font: 16px/1.5 Manrope, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px 16px; }
  main { width: 100%; max-width: 380px; }
  .head { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
  .head img { width: 48px; height: 48px; }
  h1 { font: 300 30px/1.1 Outfit, Manrope, system-ui, sans-serif; letter-spacing: 0.04em; margin: 0; }
  .sub { margin: 2px 0 0; color: rgb(var(--ink-3)); font-size: 14px; }
  .card { background: rgb(var(--surface)); border: 1px solid rgb(var(--line)); border-radius: 20px; padding: 22px; }
  .tabs { display: flex; gap: 6px; margin-bottom: 18px; background: rgb(var(--bg)); border-radius: 12px; padding: 4px; }
  .tabs button { flex: 1; border: 0; background: transparent; color: rgb(var(--ink-2)); font: 700 14px Manrope, sans-serif; padding: 9px 6px; border-radius: 9px; cursor: pointer; }
  .tabs button[aria-selected="true"] { background: rgb(var(--surface)); color: rgb(var(--ink)); box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
  label { display: block; font-size: 13px; font-weight: 700; color: rgb(var(--ink-2)); margin: 12px 0 5px; }
  input { width: 100%; font: 600 16px Manrope, sans-serif; color: rgb(var(--ink)); background: rgb(var(--bg)); border: 1px solid rgb(var(--line)); border-radius: 12px; padding: 11px 12px; }
  input:focus { outline: 2px solid rgb(var(--brand)); outline-offset: 1px; }
  .go { width: 100%; margin-top: 18px; border: 0; border-radius: 14px; padding: 13px; background: rgb(var(--brand)); color: #fff; font: 800 16px Manrope, sans-serif; cursor: pointer; }
  .go:disabled { opacity: 0.6; cursor: default; }
  .err { margin: 14px 0 0; padding: 10px 12px; border-radius: 12px; background: rgb(var(--bad-soft)); color: rgb(var(--bad-ink)); font-size: 14px; font-weight: 600; }
  .note { margin: 16px 2px 0; color: rgb(var(--ink-3)); font-size: 13px; }
  [hidden] { display: none !important; }
</style>
<script>
  try {
    var t = localStorage.getItem('fintermship-theme');
    if (t === 'light' || t === 'white' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch (e) {}
</script>
</head>
<body>
<main>
  <div class="head">
    <img src="/brand/medallion-64.png" alt="" />
    <div><h1>fintermship</h1><p class="sub">Trading and quant terms, a few a day.</p></div>
  </div>
  <form class="card" id="form" novalidate>
    <div class="tabs" role="tablist">
      <button type="button" role="tab" id="tab-in" aria-selected="true">Sign in</button>
      <button type="button" role="tab" id="tab-up" aria-selected="false">I have an invite</button>
    </div>
    <label for="email">Email</label>
    <input id="email" type="email" autocomplete="email" required />
    <label for="password">Password</label>
    <input id="password" type="password" autocomplete="current-password" required />
    <div id="invite-row" hidden>
      <label for="invite">Invite code</label>
      <input id="invite" autocomplete="off" autocapitalize="characters" spellcheck="false" />
    </div>
    <button class="go" id="go" type="submit">Sign in</button>
    <p class="err" id="err" role="alert" hidden></p>
  </form>
  <p class="note" id="note">fintermship is invite only. Ask the person who shared the link for an invite code.</p>
</main>
<script>
  (function () {
    var mode = 'in';
    var $ = function (id) { return document.getElementById(id); };
    function setMode(m) {
      mode = m;
      $('tab-in').setAttribute('aria-selected', String(m === 'in'));
      $('tab-up').setAttribute('aria-selected', String(m === 'up'));
      $('invite-row').hidden = m !== 'up';
      $('password').setAttribute('autocomplete', m === 'up' ? 'new-password' : 'current-password');
      $('go').textContent = m === 'up' ? 'Create account' : 'Sign in';
      $('err').hidden = true;
    }
    $('tab-in').onclick = function () { setMode('in'); };
    $('tab-up').onclick = function () { setMode('up'); };
    function show(msg) { $('err').textContent = msg; $('err').hidden = false; }
    $('form').onsubmit = function (e) {
      e.preventDefault();
      var body = { email: $('email').value, password: $('password').value };
      if (mode === 'up') body.invite = $('invite').value;
      $('go').disabled = true;
      fetch(mode === 'up' ? '/api/signup' : '/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) { if (x.ok) location.reload(); else { show(x.d.error || 'Something went wrong.'); $('go').disabled = false; } })
        .catch(function () { show('You seem to be offline. Try again in a moment.'); $('go').disabled = false; });
    };
    // A session from before this page existed only reached /api. Asking /api/me moves it to the whole site, once.
    try {
      if (!sessionStorage.getItem('fts-moved')) {
        fetch('/api/me', { credentials: 'same-origin' }).then(function (r) {
          if (r.ok) { sessionStorage.setItem('fts-moved', '1'); location.reload(); }
        }).catch(function () {});
      }
    } catch (e) {}
  })();
</script>
</body>
</html>`;
}
