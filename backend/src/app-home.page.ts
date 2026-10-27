export interface HomePageOptions {
  enableConsole?: boolean;
  enableSwagger?: boolean;
}

export function getHomePageHtml(options: HomePageOptions = {}): string {
  const docsLink =
    options.enableSwagger === true ? '<a class="button button--secondary" href="/docs">API dokumentace</a>' : '';

  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Aardvarkland</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f4f6f8;
        color: #18211f;
        font-family: Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif;
      }
      main {
        width: min(760px, calc(100vw - 40px));
        padding: 32px;
        border: 1px solid #dce4e1;
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 20px 80px rgba(16, 23, 25, 0.08);
      }
      h1 { margin: 0 0 12px; font-size: 28px; line-height: 1.1; }
      p { margin: 0 0 12px; color: #61706b; line-height: 1.55; }
      code { color: #0f6c53; font-weight: 700; }
      .actions {
        display: flex;
        gap: 10px;
        margin-top: 22px;
        flex-wrap: wrap;
      }
      .button {
        min-height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 14px;
        border-radius: 8px;
        font-weight: 700;
        text-decoration: none;
      }
      .button--primary { color: #fff; background: #0f172a; }
      .button--secondary { color: #18211f; border: 1px solid #dce4e1; background: #fff; }
    </style>
  </head>
  <body>
    <main>
      <h1>Aardvarkland</h1>
      <p>Backend běží na portu <code>4001</code>. Tohle není hlavní uživatelské rozhraní, ale API a stavová stránka pro technickou kontrolu.</p>
      <p>Hlavní aplikace běží na portu <code>4000</code>. Lokální panel se stavem služeb a logy běží na portu <code>3002</code>.</p>
      <div class="actions">
        <a class="button button--primary" href="http://localhost:4000">Otevřít aplikaci</a>
        <a class="button button--secondary" href="http://localhost:3002">Otevřít lokální panel</a>
        <a class="button button--secondary" href="/api/health">Stav backendu</a>
        ${docsLink}
      </div>
    </main>
  </body>
</html>`;
}
