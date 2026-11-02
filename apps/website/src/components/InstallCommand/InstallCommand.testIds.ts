const InstallCommandTestIds = {
  root: 'install-command',
  tab: (manager: string) => `install-command-tab-${manager}`,
  command: 'install-command-text',
  copy: 'install-command-copy',
} as const;

export default InstallCommandTestIds;
