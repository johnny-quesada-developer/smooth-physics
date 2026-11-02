const DocsSidebarTestIds = {
  root: 'docs-sidebar',
  toggle: 'docs-sidebar-toggle',
  menu: 'docs-sidebar-menu',
  link: (slug: string): string => `docs-sidebar-link-${slug}`,
} as const;

export default DocsSidebarTestIds;
