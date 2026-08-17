(() => {
  const roleProfiles = {
    worker: {
      name: 'Warehouse worker',
      detail: 'Worker · Main warehouse',
    },
    manager: {
      name: 'Warehouse manager',
      detail: 'Manager · Main warehouse',
    },
    admin: {
      name: 'System admin',
      detail: 'Administrator · System workspace',
    },
  };

  const nav = document.getElementById('nav-list');
  const account = document.getElementById('sidebar-account');
  const mobileTabbar = document.getElementById('mobile-tabbar');
  let moreOpen = false;
  let scheduled = false;
  let renderedAccountRole = '';
  let mobileSignature = '';

  function activeRole() {
    return document.querySelector('.mode-button.is-active')?.dataset.role || 'worker';
  }

  function renderAccount(role = activeRole()) {
    const profile = roleProfiles[role] || roleProfiles.worker;
    if (!account) return;
    if (renderedAccountRole === role && account.querySelector(`[data-parity-role="${role}"]`)) return;

    renderedAccountRole = role;
    account.innerHTML = `
      <div class="parity-account" data-parity-role="${role}">
        <div class="parity-account__copy">
          <strong>${profile.name}</strong>
          <small>${profile.detail}</small>
        </div>
        <div class="parity-account__actions">
          <button class="parity-account__action" type="button" data-parity-sign-out>Sign out</button>
        </div>
      </div>`;
  }

  function decorateNavigation() {
    if (!nav) return;
    nav.classList.add('nav');
    nav.querySelectorAll('.nav-section').forEach((section) => {
      section.classList.add('nav__section');
      section.querySelector('.nav-section-label')?.classList.add('nav__section-label');
    });
    nav.querySelectorAll('.nav-button').forEach((button) => {
      button.classList.add('nav__item');
      const icon = button.querySelector('.nav-icon');
      if (icon) icon.classList.add('nav__icon');
      const children = [...button.children];
      const copy = children.find((child) => child !== icon);
      if (!copy) return;
      copy.classList.add('nav__copy');
      const detail = copy.querySelector(':scope > span');
      if (detail && detail.tagName !== 'SMALL') {
        const small = document.createElement('small');
        small.innerHTML = detail.innerHTML;
        detail.replaceWith(small);
      }
    });
  }

  function itemLabel(button) {
    return button.querySelector('strong')?.textContent?.trim()
      || button.textContent?.trim()
      || 'Open';
  }

  function itemIcon(button) {
    return button.querySelector('.nav-icon, .nav__icon')?.innerHTML || '<span aria-hidden="true">·</span>';
  }

  function closeMore() {
    moreOpen = false;
    const panel = mobileTabbar?.querySelector('.mobile-tabbar__more');
    const toggle = mobileTabbar?.querySelector('.mobile-tabbar__more-toggle');
    panel?.classList.remove('is-open');
    toggle?.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
    if (toggle) toggle.setAttribute('aria-label', 'More');
  }

  function activateCurrentView(view) {
    closeMore();
    const source = nav?.querySelector(`.nav-button[data-view="${CSS.escape(view)}"]`);
    source?.click();
    schedule();
  }

  function buildProxyButton(source, extraClass = '') {
    const button = document.createElement('button');
    const view = source.dataset.view || '';
    button.type = 'button';
    button.dataset.view = view;
    button.className = `mobile-tabbar__button ${extraClass}`.trim();
    if (source.classList.contains('is-active')) button.classList.add('is-active');
    button.setAttribute('aria-current', source.classList.contains('is-active') ? 'page' : 'false');
    button.innerHTML = `<span aria-hidden="true">${itemIcon(source)}</span><small>${itemLabel(source)}</small>`;
    button.addEventListener('click', () => activateCurrentView(view));
    return button;
  }

  function navigationSignature(items) {
    return [
      activeRole(),
      ...items.map((item) => [
        item.dataset.view || '',
        itemLabel(item),
        item.classList.contains('is-active') ? '1' : '0',
      ].join(':')),
    ].join('|');
  }

  function renderMobileTabbar() {
    if (!nav || !mobileTabbar) return;
    const items = [...nav.querySelectorAll('.nav-button')];
    if (!items.length) return;

    const signature = navigationSignature(items);
    if (signature === mobileSignature && mobileTabbar.childElementCount) return;
    mobileSignature = signature;

    const fragment = document.createDocumentFragment();
    const primary = items.slice(0, 4);
    const overflow = items.slice(4);

    primary.forEach((item) => fragment.append(buildProxyButton(item)));

    if (overflow.length) {
      const morePanel = document.createElement('div');
      morePanel.className = `mobile-tabbar__more${moreOpen ? ' is-open' : ''}`;
      morePanel.setAttribute('role', 'menu');
      overflow.forEach((item) => {
        const proxy = buildProxyButton(item);
        proxy.setAttribute('role', 'menuitem');
        morePanel.append(proxy);
      });
      fragment.append(morePanel);

      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'mobile-tabbar__button mobile-tabbar__more-toggle';
      if (moreOpen || overflow.some((item) => item.classList.contains('is-active'))) {
        more.classList.add('is-active');
      }
      more.setAttribute('aria-expanded', String(moreOpen));
      more.setAttribute('aria-label', moreOpen ? 'Close menu' : 'More');
      more.innerHTML = '<span aria-hidden="true">•••</span><small>More</small>';
      more.addEventListener('click', () => {
        moreOpen = !moreOpen;
        morePanel.classList.toggle('is-open', moreOpen);
        more.classList.toggle('is-open', moreOpen);
        more.classList.toggle('is-active', moreOpen || overflow.some((item) => item.classList.contains('is-active')));
        more.setAttribute('aria-expanded', String(moreOpen));
        more.setAttribute('aria-label', moreOpen ? 'Close menu' : 'More');
      });
      fragment.append(more);
    }

    mobileTabbar.replaceChildren(fragment);
  }

  function sync() {
    decorateNavigation();
    renderAccount();
    renderMobileTabbar();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      sync();
    });
  }

  account?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('[data-parity-sign-out]')) return;
    window.WMSDemoLogin?.show();
  });

  document.querySelectorAll('.mode-button').forEach((button) => {
    button.addEventListener('click', () => {
      renderedAccountRole = '';
      mobileSignature = '';
      schedule();
    });
  });

  nav?.addEventListener('click', () => {
    mobileSignature = '';
    schedule();
  });

  if (nav) {
    new MutationObserver(() => {
      mobileSignature = '';
      schedule();
    }).observe(nav, {
      subtree: true,
      childList: true,
    });
  }

  document.addEventListener('click', (event) => {
    if (!moreOpen || !mobileTabbar) return;
    if (event.target instanceof Node && !mobileTabbar.contains(event.target)) closeMore();
  });

  window.WMSPreviewParity = {
    setRole(role) {
      document.querySelector(`.mode-button[data-role="${role}"]`)?.click();
      renderedAccountRole = '';
      mobileSignature = '';
      renderAccount(role);
      schedule();
    },
    refresh: schedule,
  };

  schedule();
})();