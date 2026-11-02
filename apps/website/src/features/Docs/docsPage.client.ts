// The docs page's own behaviour: the phone menu of pages, and the table of contents mark on the section being read.
const toggle = document.querySelector('[data-docs-menu-toggle]');
const menu = document.querySelector('[data-docs-menu]');
if (toggle instanceof HTMLButtonElement && menu instanceof HTMLElement) {
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    menu.toggleAttribute('data-open', open);
  });
}

// A heading counts as being read once its top passes this line below the sticky header.
const READING_LINE = 120;

const tocLinks = [...document.querySelectorAll('[data-docs-toc] a[href^="#"]')].filter((link) => link instanceof HTMLAnchorElement);
const sections = tocLinks.flatMap((link) => {
  const heading = document.getElementById(decodeURIComponent(link.hash.slice(1)));
  return heading ? [{ link, heading }] : [];
});

if (sections.length > 0) {
  let scheduled = false;
  const mark = (): void => {
    scheduled = false;
    const reading = sections.findLast(({ heading }) => heading.getBoundingClientRect().top <= READING_LINE) ?? sections[0];
    for (const { link } of sections) {
      if (link === reading?.link) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };
  addEventListener(
    'scroll',
    () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(mark);
    },
    { passive: true },
  );
  mark();
}

// A module, so its names stay out of the global scope that shell.client.ts also uses.
export {};
