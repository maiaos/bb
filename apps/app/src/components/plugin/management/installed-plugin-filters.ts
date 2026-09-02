import type { PluginListItem } from "@/hooks/queries/plugin-settings-queries";
import { pluginNeedsAttention } from "@/hooks/usePluginAttention";
import { UNCATEGORIZED_PLUGIN_CATEGORY_ID } from "./plugin-browse-discovery";
import { pluginCategoryFilterOptions } from "./plugin-category-options";

export const INSTALLED_STATE_FILTERS = [
  "enabled",
  "disabled",
  "not-running",
  "update-available",
] as const;

export type InstalledStateFilter = (typeof INSTALLED_STATE_FILTERS)[number];

const INSTALLED_SOURCE_KINDS = [
  "bb-official",
  "bb-community",
  "git",
  "npm",
  "path",
] as const;

type InstalledSourceKind = (typeof INSTALLED_SOURCE_KINDS)[number];

export type InstalledSourceFilter =
  | InstalledSourceKind
  | `marketplace:${string}`;

export interface InstalledFacetOption<T extends string = string> {
  id: T;
  label: string;
  count: number;
}

const STATE_LABELS: Record<InstalledStateFilter, string> = {
  enabled: "Enabled",
  disabled: "Disabled",
  "not-running": "Not running",
  "update-available": "Update available",
};

const SOURCE_LABELS: Record<InstalledSourceKind, string> = {
  "bb-official": "BB Official",
  "bb-community": "BB Community",
  git: "Git",
  npm: "npm",
  path: "Path",
};

export function isInstalledStateFilter(
  value: string,
): value is InstalledStateFilter {
  return INSTALLED_STATE_FILTERS.some((candidate) => candidate === value);
}

export function isInstalledSourceFilter(
  value: string,
): value is InstalledSourceFilter {
  return (
    INSTALLED_SOURCE_KINDS.some((candidate) => candidate === value) ||
    (value.startsWith("marketplace:") && value.length > "marketplace:".length)
  );
}

export function installedPluginStateFilters(
  plugin: PluginListItem,
): InstalledStateFilter[] {
  const filters: InstalledStateFilter[] = [
    plugin.enabled ? "enabled" : "disabled",
  ];
  if (pluginNeedsAttention(plugin)) filters.push("not-running");
  if (plugin.updateState.availableVersion !== null) {
    filters.push("update-available");
  }
  return filters;
}

export function installedPluginSourceFilter(
  plugin: PluginListItem,
): InstalledSourceFilter | null {
  const marketplaceName = plugin.catalogMarketplaceName ?? null;
  if (marketplaceName !== null) {
    if (
      marketplaceName === "bb-official" ||
      marketplaceName === "bb-community"
    ) {
      return marketplaceName;
    }
    return `marketplace:${marketplaceName}`;
  }
  if (plugin.provenance === "builtin") return "bb-official";
  if (
    plugin.source.startsWith("git:") ||
    /^https?:\/\//iu.test(plugin.source)
  ) {
    return "git";
  }
  if (plugin.source.startsWith("npm:")) return "npm";
  if (plugin.source.startsWith("path:")) return "path";
  return null;
}

export function installedPluginCategoryFilter(plugin: PluginListItem): string {
  return plugin.categoryId == null || plugin.category == null
    ? UNCATEGORIZED_PLUGIN_CATEGORY_ID
    : plugin.categoryId;
}

export function installedStateFacetOptions(
  plugins: readonly PluginListItem[],
): InstalledFacetOption<InstalledStateFilter>[] {
  return INSTALLED_STATE_FILTERS.map((id) => ({
    id,
    label: STATE_LABELS[id],
    count: plugins.filter((plugin) =>
      installedPluginStateFilters(plugin).includes(id),
    ).length,
  }));
}

export function installedSourceFacetOptions(
  plugins: readonly PluginListItem[],
  selected: readonly InstalledSourceFilter[],
): InstalledFacetOption<InstalledSourceFilter>[] {
  const counts = new Map<InstalledSourceFilter, number>();
  const marketplaceLabels = new Map<InstalledSourceFilter, string>();
  for (const plugin of plugins) {
    const id = installedPluginSourceFilter(plugin);
    if (id === null) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (id.startsWith("marketplace:")) {
      marketplaceLabels.set(
        id,
        plugin.publisherLabel ?? id.slice("marketplace:".length),
      );
    }
  }
  for (const id of selected) {
    if (id.startsWith("marketplace:") && !marketplaceLabels.has(id)) {
      marketplaceLabels.set(id, id.slice("marketplace:".length));
    }
  }
  const marketplaceOptions = [...marketplaceLabels]
    .map(([id, label]) => ({ id, label, count: counts.get(id) ?? 0 }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return [
    ...INSTALLED_SOURCE_KINDS.slice(0, 2).map((id) => ({
      id,
      label: SOURCE_LABELS[id],
      count: counts.get(id) ?? 0,
    })),
    ...marketplaceOptions,
    ...INSTALLED_SOURCE_KINDS.slice(2).map((id) => ({
      id,
      label: SOURCE_LABELS[id],
      count: counts.get(id) ?? 0,
    })),
  ];
}

export function installedCategoryFacetOptions(
  plugins: readonly PluginListItem[],
  selected: readonly string[],
): InstalledFacetOption[] {
  return pluginCategoryFilterOptions(
    plugins.map((plugin) => ({
      id: installedPluginCategoryFilter(plugin),
      label: plugin.category,
    })),
    selected,
  );
}

export function pluginMatchesInstalledFilters(
  plugin: PluginListItem,
  filters: {
    query: string;
    states: readonly InstalledStateFilter[];
    sources: readonly InstalledSourceFilter[];
    categories: readonly string[];
  },
): boolean {
  if (
    filters.states.length > 0 &&
    !filters.states.some((state) =>
      installedPluginStateFilters(plugin).includes(state),
    )
  ) {
    return false;
  }
  const source = installedPluginSourceFilter(plugin);
  if (
    filters.sources.length > 0 &&
    (source === null || !filters.sources.includes(source))
  ) {
    return false;
  }
  if (
    filters.categories.length > 0 &&
    !filters.categories.includes(installedPluginCategoryFilter(plugin))
  ) {
    return false;
  }
  const query = filters.query.trim().toLocaleLowerCase();
  if (query === "") return true;
  return [
    plugin.name ?? "",
    plugin.id,
    plugin.description ?? "",
    plugin.version,
    plugin.sourceDisplay,
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}
