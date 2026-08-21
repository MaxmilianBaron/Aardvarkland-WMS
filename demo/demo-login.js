(() => {
  const accounts = [
    { role: 'worker', label: 'Warehouse worker' },
    { role: 'manager', label: 'Warehouse manager' },
    { role: 'admin', label: 'System admin' },
  ];

  const copy = {
    cs: {
      tagline: 'systém řízení skladu',
      title: 'Přihlášení',
      subtitle: 'Přihlaste se ke svému účtu.',
      login: 'Přihlašovací jméno',
      password: 'Heslo',
      submit: 'Přihlásit se',
      settings: 'Nastavení přihlášení',
      language: 'Přepnout jazyk',
      mobile: 'Mobilní náhled',
    },
    en: {
      tagline: 'warehouse management system',
      title: 'Sign in',
      subtitle: 'Sign in to your account.',
      login: 'Login name',
      password: 'Password',
      submit: 'Sign in',
      settings: 'Login settings',
      language: 'Switch language',
      mobile: 'Mobile preview',
    },
    ua: {
      tagline: 'система управління складом',
      title: 'Вхід',
      subtitle: 'Увійдіть до свого облікового запису.',
      login: 'Ім’я для входу',
      password: 'Пароль',
      submit: 'Увійти',
      settings: 'Налаштування входу',
      language: 'Перемкнути мову',
      mobile: 'Мобільний перегляд',
    },
  };

  const gate = document.createElement('main');
  gate.className = 'demo-login login-page';
  gate.id = 'demo-login';
  gate.setAttribute('aria-label', 'Aardvarkland WMS sign in');
  gate.innerHTML = `
    <div class="login-controls" id="demo-login-controls" aria-label="Login settings">
      <a class="demo-mobile-link" id="demo-mobile-link" href="./mobile-preview.html">Mobile preview</a>
      <div class="login-language-menu">
        <button class="language-switch" id="demo-language-toggle" type="button" aria-label="Switch language" aria-expanded="false" aria-haspopup="menu">
          <span class="flag-icon" id="demo-current-flag" aria-hidden="true"></span>
        </button>
        <div class="login-language-menu__list" id="demo-language-list" role="menu" aria-label="Switch language">
          ${['cs', 'en', 'ua'].map((language) => `
            <button type="button" data-login-language="${language}" role="menuitemradio" aria-checked="false" aria-label="${language}">
              <span class="flag-icon" data-login-flag="${language}" aria-hidden="true"></span>
            </button>`).join('')}
        </div>
      </div>
      <button class="theme-toggle" id="demo-theme-toggle" type="button" aria-label="Switch to dark mode" title="Switch to dark mode">
        <span id="demo-theme-icon" aria-hidden="true"></span>
      </button>
    </div>

    <section class="login-card">
      <div class="login-card__visual">
        <div class="login-logo login-logo--image"><img src="assets/logo.png" alt=""></div>
        <h1 class="login-brand">
          <span class="login-brand__name">Aardvarkland</span>
          <span class="login-brand__tagline" id="demo-login-tagline">warehouse management system</span>
        </h1>
      </div>

      <form class="login-form" id="demo-login-form" autocomplete="off">
        <div class="login-form__header">
          <h2 id="demo-login-title">Sign in</h2>
          <p id="demo-login-subtitle">Sign in to your account.</p>
        </div>

        <label>
          <span id="demo-login-name-label">Login name</span>
          <select id="demo-login-name" name="aardvarkland-login-name" aria-label="Login name" required>
            ${accounts.map((account) => `<option value="${account.role}">${account.label}</option>`).join('')}
          </select>
        </label>

        <label>
          <span id="demo-password-label">Password</span>
          <input id="demo-password" type="password" value="demo" readonly autocomplete="off" name="aardvarkland-login-password" aria-label="Password" required>
        </label>

        <button class="login-submit button--primary" id="demo-login-submit" type="submit">Sign in</button>
        <p class="login-footer">© 2026 Aardvarkland Inc.</p>
      </form>
    </section>`;

  const roleSelect = gate.querySelector('#demo-login-name');
  const languageToggle = gate.querySelector('#demo-language-toggle');
  const languageList = gate.querySelector('#demo-language-list');
  const themeToggle = gate.querySelector('#demo-theme-toggle');

  function activeLanguage() {
    return document.querySelector('#language-list [aria-checked="true"]')?.dataset.lang
      || document.querySelector('#language-list .is-active')?.dataset.lang
      || 'en';
  }

  function flagMarkup(language) {
    return document.querySelector(`#language-list [data-lang="${language}"] .flag-icon`)?.innerHTML || '';
  }

  function syncLanguageMenu() {
    const language = activeLanguage();
    const text = copy[language] || copy.en;
    gate.querySelector('#demo-current-flag').innerHTML = flagMarkup(language);

    gate.querySelectorAll('[data-login-language]').forEach((button) => {
      const code = button.dataset.loginLanguage;
      button.classList.toggle('is-active', code === language);
      button.setAttribute('aria-checked', String(code === language));
      button.setAttribute('aria-label', code === 'cs' ? 'Czech' : code === 'ua' ? 'Ukrainian' : 'English');
      const flag = button.querySelector('[data-login-flag]');
      if (flag) flag.innerHTML = flagMarkup(code);
    });

    gate.querySelector('#demo-login-controls').setAttribute('aria-label', text.settings);
    languageToggle.setAttribute('aria-label', text.language);
    languageToggle.setAttribute('title', text.language);
    languageList.setAttribute('aria-label', text.language);
    gate.querySelector('#demo-mobile-link').textContent = text.mobile;
    gate.querySelector('#demo-login-tagline').textContent = text.tagline;
    gate.querySelector('#demo-login-title').textContent = text.title;
    gate.querySelector('#demo-login-subtitle').textContent = text.subtitle;
    gate.querySelector('#demo-login-name-label').textContent = text.login;
    roleSelect.setAttribute('aria-label', text.login);
    gate.querySelector('#demo-password-label').textContent = text.password;
    gate.querySelector('#demo-password').setAttribute('aria-label', text.password);
    gate.querySelector('#demo-login-submit').textContent = text.submit;
  }

  function syncThemeControl() {
    const source = document.querySelector('#theme-toggle');
    const sourceIcon = document.querySelector('#theme-toggle-icon');
    gate.querySelector('#demo-theme-icon').innerHTML = sourceIcon?.innerHTML || '';
    const label = source?.getAttribute('aria-label') || 'Switch theme';
    themeToggle.setAttribute('aria-label', label);
    themeToggle.setAttribute('title', label);
    themeToggle.setAttribute('aria-pressed', source?.getAttribute('aria-pressed') || 'false');
  }

  function syncControls() {
    syncLanguageMenu();
    syncThemeControl();
  }

  function closeLanguageMenu() {
    languageList.classList.remove('is-open');
    languageToggle.setAttribute('aria-expanded', 'false');
  }

  languageToggle.addEventListener('click', () => {
    const next = !languageList.classList.contains('is-open');
    languageList.classList.toggle('is-open', next);
    languageToggle.setAttribute('aria-expanded', String(next));
  });

  languageList.querySelectorAll('[data-login-language]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelector(`#language-list [data-lang="${button.dataset.loginLanguage}"]`)?.click();
      closeLanguageMenu();
      requestAnimationFrame(syncControls);
    });
  });

  themeToggle.addEventListener('click', () => {
    document.querySelector('#theme-toggle')?.click();
    requestAnimationFrame(syncThemeControl);
  });

  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Node && !gate.querySelector('.login-language-menu')?.contains(event.target)) {
      closeLanguageMenu();
    }
  });

  gate.querySelector('#demo-login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const role = roleSelect.value;
    const applyRole = (attempt = 0) => {
      if (window.WMSPreviewParity?.setRole) {
        window.WMSPreviewParity.setRole(role);
        gate.classList.add('is-hidden');
        try {
          sessionStorage.setItem('aardvarkland-public-demo-role', role);
        } catch {}
        return;
      }
      if (attempt < 20) window.setTimeout(() => applyRole(attempt + 1), 50);
    };
    applyRole();
  });

  const storedRole = (() => {
    try {
      return sessionStorage.getItem('aardvarkland-public-demo-role');
    } catch {
      return null;
    }
  })();
  if (accounts.some((account) => account.role === storedRole)) roleSelect.value = storedRole;

  if (new URLSearchParams(window.location.search).has('mobileFrame')) {
    gate.querySelector('#demo-mobile-link')?.classList.add('is-hidden');
  }

  window.WMSDemoLogin = {
    show() {
      gate.classList.remove('is-hidden');
      syncControls();
    },
    hide() {
      gate.classList.add('is-hidden');
    },
  };

  document.body.append(gate);
  syncControls();

  let hydrationAttempts = 0;
  const hydrateControls = () => {
    syncControls();
    hydrationAttempts += 1;
    if (!gate.querySelector('#demo-current-flag svg') && hydrationAttempts < 120) {
      window.requestAnimationFrame(hydrateControls);
    }
  };
  window.requestAnimationFrame(hydrateControls);
})();
