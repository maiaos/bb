import { PLUGIN_CATALOG_CATEGORIES, pluginCatalogCategory } from "@bb/domain";
import { UNCATEGORIZED_PLUGIN_CATEGORY_ID } from "./plugin-browse-discovery";

export interface PluginCategoryOptionValue {
  id: string;
  label: string | null;
}

export interface PluginCategoryOption {
  id: string;
  label: string;
  count: number;
}

export function pluginCategoryFilterOptions(
  values: readonly PluginCategoryOptionValue[],
  selected: readonly string[],
): PluginCategoryOption[] {
  const labels = new Map<string, string>();
  const counts = new Map<string, number>();
  const unknownIds: string[] = [];
  for (const value of values) {
    if (!labels.has(value.id)) {
      const category = pluginCatalogCategory(value.id);
      labels.set(
        value.id,
        value.id === UNCATEGORIZED_PLUGIN_CATEGORY_ID
          ? "Uncategorized"
          : (value.label ?? category?.displayName ?? value.id),
      );
      if (
        value.id !== UNCATEGORIZED_PLUGIN_CATEGORY_ID &&
        category === undefined
      ) {
        unknownIds.push(value.id);
      }
    }
    counts.set(value.id, (counts.get(value.id) ?? 0) + 1);
  }
  for (const id of selected) {
    if (labels.has(id)) continue;
    const category = pluginCatalogCategory(id);
    labels.set(
      id,
      id === UNCATEGORIZED_PLUGIN_CATEGORY_ID
        ? "Uncategorized"
        : (category?.displayName ?? id),
    );
    if (id !== UNCATEGORIZED_PLUGIN_CATEGORY_ID && category === undefined) {
      unknownIds.push(id);
    }
  }
  const orderedIds = [
    ...PLUGIN_CATALOG_CATEGORIES.map((category) => category.id).filter((id) =>
      labels.has(id),
    ),
    ...unknownIds,
    ...(labels.has(UNCATEGORIZED_PLUGIN_CATEGORY_ID)
      ? [UNCATEGORIZED_PLUGIN_CATEGORY_ID]
      : []),
  ];
  return orderedIds.map((id) => ({
    id,
    label: labels.get(id) ?? id,
    count: counts.get(id) ?? 0,
  }));
}
