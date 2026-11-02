type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const root = document.documentElement;
const systemDark = matchMedia('(prefers-color-scheme: dark)');

for (const toggle of themeToggles()) {
  toggle.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    storeTheme(next);
    applyTheme(next);
  });
}

// Follow the system while the reader has not picked a theme.
systemDark.addEventListener('change', (event) => {
  if (storedTheme() === null) applyTheme(event.matches ? 'dark' : 'light');
});

applyTheme(currentTheme());

const menuButton = document.querySelector('[data-menu-toggle]');
const menu = document.querySelector('[data-menu]');
if (menuButton instanceof HTMLButtonElement && menu instanceof HTMLElement) {
  menuButton.addEventListener('click', () => setMenuOpen({ button: menuButton, menu, open: menuButton.getAttribute('aria-expanded') !== 'true' }));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      setMenuOpen({ button: menuButton, menu, open: false });
      menuButton.focus();
    }
  });
}

function themeToggles(): HTMLButtonElement[] {
  return [...document.querySelectorAll('[data-theme-toggle]')].filter((element) => element instanceof HTMLButtonElement);
}

function currentTheme(): Theme {
  return root.dataset['theme'] === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
  root.dataset['theme'] = theme;
  for (const toggle of themeToggles()) {
    toggle.setAttribute('aria-pressed', String(theme === 'dark'));
  }
}

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private windows may refuse storage; the theme still applies to this page.
  }
}

function setMenuOpen({ button, menu, open }: { button: HTMLButtonElement; menu: HTMLElement; open: boolean }): void {
  button.setAttribute('aria-expanded', String(open));
  menu.toggleAttribute('data-open', open);
}
