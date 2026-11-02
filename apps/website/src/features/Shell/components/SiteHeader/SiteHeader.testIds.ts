const SiteHeaderTestIds = {
  root: 'site-header',
  home: 'site-header-home',
  menu: 'site-header-menu',
  link: (section: string): string => `site-header-link-${section}`,
} as const;

export default SiteHeaderTestIds;
