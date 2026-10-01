import type { Plugin } from '../shared/contracts';

export const pluginTitle = (plugin: Plugin) => plugin.displayName || plugin.name;
export function matchesPlugin(plugin: Plugin, query: string) {
  return [plugin.displayName, plugin.name, plugin.description, plugin.marketplace, ...(plugin.keywords || [])]
    .join(' ').normalize('NFKC').toLocaleLowerCase().includes(query.trim().normalize('NFKC').toLocaleLowerCase());
}
