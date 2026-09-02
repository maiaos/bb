import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ResourceInfiniteScrollSentinel,
  useResourceInfiniteItems,
  useResourceViewportPageSize,
} from "@bb/shared-ui/resource-pagination";
import {
  ResourceCollectionPage,
  ResourceCollectionViewport,
  ResourceListState,
  ResourceMultiSelectMenu,
  ResourceSortMenu,
  ResourceToolbar,
} from "@bb/shared-ui/resource-list";
import { Button } from "@bb/shared-ui/button";
import { EmptyStatePanel } from "@bb/shared-ui/empty-state";
import { cn } from "@bb/shared-ui/lib/utils";
import { CreateWithTemplatesButton } from "@/components/create-via-prompt-examples";
import { CREATE_PLUGIN_PROMPT } from "@bb/client-core";
import { TOOLS_PAGE_BAND_CLASSES } from "@/components/tools/tools-navigation";
import {
  AddPluginDialog,
  type AddPluginInitial,
} from "@/components/plugin/management/AddPluginDialog";
import { BrowsePluginsTab } from "@/components/plugin/management/BrowsePluginsTab";
import { CheckPluginUpdatesButton } from "@/components/plugin/management/CheckPluginUpdatesButton";
import { InstalledPluginsTab } from "@/components/plugin/management/InstalledPluginsTab";
import {
  PluginBrowseCategoryFilter,
  type PluginBrowseCategoryOption,
} from "@/components/plugin/management/PluginBrowseControls";
import {
  installedCategoryFacetOptions,
  installedSourceFacetOptions,
  installedStateFacetOptions,
  isInstalledSourceFilter,
  isInstalledStateFilter,
  pluginMatchesInstalledFilters,
  type InstalledFacetOption,
  type InstalledSourceFilter,
  type InstalledStateFilter,
} from "@/components/plugin/management/installed-plugin-filters";
import { PLUGINS_INSTALLED_DESCRIPTION } from "@/components/plugin/plugins-collection-copy";
import { usePluginList } from "@/hooks/queries/plugin-settings-queries";
import {
  getPluginDetailRoutePath,
  getRootComposeRoutePath,
} from "@/lib/route-paths";

type PluginsCollectionMode = "installed" | "browse";

const INSTALLED_QUERY_URL_DELAY_MS = 300;

function modeFromSearchParams(value: string | null): PluginsCollectionMode {
  if (value === "installed") return value;
  return "browse";
}

function stateFiltersFromSearchParams(
  searchParams: URLSearchParams,
): InstalledStateFilter[] {
  return [
    ...new Set(searchParams.getAll("state").filter(isInstalledStateFilter)),
  ];
}

function sourceFiltersFromSearchParams(
  searchParams: URLSearchParams,
): InstalledSourceFilter[] {
  return [
    ...new Set(searchParams.getAll("source").filter(isInstalledSourceFilter)),
  ];
}

function categoryFiltersFromSearchParams(
  searchParams: URLSearchParams,
): string[] {
  return [...new Set(searchParams.getAll("category").filter(Boolean))];
}

function countedResourceOptions<T extends string>(
  options: readonly InstalledFacetOption<T>[],
) {
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    leading: (
      <span className="text-2xs font-medium tabular-nums text-subtle-foreground">
        {option.count.toLocaleString()}
      </span>
    ),
  }));
}

export function PluginsOverview({
  onOpenPlugin,
}: {
  onOpenPlugin?: (pluginId: string, trigger: HTMLButtonElement) => void;
} = {}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const listQuery = usePluginList({ enabled: true });
  const plugins = useMemo(
    () => listQuery.data?.plugins ?? [],
    [listQuery.data?.plugins],
  );
  const activeMode = modeFromSearchParams(searchParams.get("view"));
  const installedQueryParam = searchParams.get("query") ?? "";
  const [installedQuery, setInstalledQuery] = useState(installedQueryParam);
  const installedQueryTimeoutRef = useRef<number | null>(null);
  const installedQueryWriteRef = useRef<string | null>(null);
  const stateFilters = stateFiltersFromSearchParams(searchParams);
  const sourceFilters = sourceFiltersFromSearchParams(searchParams);
  const categoryFilters = categoryFiltersFromSearchParams(searchParams);
  const [installedViewport, setInstalledViewport] =
    useState<HTMLDivElement | null>(null);
  const [installedSortDirection, setInstalledSortDirection] = useState<
    "asc" | "desc"
  >("asc");
  const stateFilterOptions = useMemo(
    () => countedResourceOptions(installedStateFacetOptions(plugins)),
    [plugins],
  );
  const sourceFilterOptions = useMemo(
    () =>
      countedResourceOptions(
        installedSourceFacetOptions(plugins, sourceFilters),
      ),
    [plugins, sourceFilters],
  );
  const categoryFilterOptions = useMemo<PluginBrowseCategoryOption[]>(
    () => installedCategoryFacetOptions(plugins, categoryFilters),
    [categoryFilters, plugins],
  );
  const normalizedInstalledQuery = installedQuery.trim().toLocaleLowerCase();
  const hasInstalledFilters =
    normalizedInstalledQuery !== "" ||
    stateFilters.length > 0 ||
    sourceFilters.length > 0 ||
    categoryFilters.length > 0;
  const installedResetKey = [
    normalizedInstalledQuery,
    installedSortDirection,
    [...stateFilters].sort().join(","),
    [...sourceFilters].sort().join(","),
    [...categoryFilters].sort().join(","),
  ].join("\u0000");
  const installedPageSize = useResourceViewportPageSize(installedViewport, {
    resetKey: installedResetKey,
  });
  const [addDialog, setAddDialog] = useState<{
    open: boolean;
    initial: AddPluginInitial | null;
  }>({ open: false, initial: null });

  useEffect(() => {
    if (installedQueryWriteRef.current === installedQueryParam) {
      installedQueryWriteRef.current = null;
      return;
    }
    if (installedQueryTimeoutRef.current !== null) {
      window.clearTimeout(installedQueryTimeoutRef.current);
      installedQueryTimeoutRef.current = null;
    }
    setInstalledQuery(installedQueryParam);
  }, [installedQueryParam]);

  useEffect(
    () => () => {
      if (installedQueryTimeoutRef.current !== null) {
        window.clearTimeout(installedQueryTimeoutRef.current);
      }
    },
    [],
  );

  const changeInstalledQuery = (value: string) => {
    setInstalledQuery(value);
    if (installedQueryTimeoutRef.current !== null) {
      window.clearTimeout(installedQueryTimeoutRef.current);
    }
    installedQueryTimeoutRef.current = window.setTimeout(() => {
      installedQueryWriteRef.current = value;
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value === "") next.delete("query");
          else next.set("query", value);
          return next;
        },
        { replace: true },
      );
      installedQueryTimeoutRef.current = null;
    }, INSTALLED_QUERY_URL_DELAY_MS);
  };

  const changeInstalledParams = (
    key: "state" | "source" | "category",
    values: readonly string[],
  ) => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    for (const value of values) next.append(key, value);
    setSearchParams(next, { replace: true });
  };

  const clearInstalledFilters = () => {
    if (installedQueryTimeoutRef.current !== null) {
      window.clearTimeout(installedQueryTimeoutRef.current);
      installedQueryTimeoutRef.current = null;
    }
    installedQueryWriteRef.current = "";
    setInstalledQuery("");
    const next = new URLSearchParams(searchParams);
    for (const key of ["query", "state", "source", "category"]) {
      next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const visiblePlugins = useMemo(
    () =>
      plugins
        .filter((plugin) =>
          pluginMatchesInstalledFilters(plugin, {
            query: installedQuery,
            states: stateFilters,
            sources: sourceFilters,
            categories: categoryFilters,
          }),
        )
        .sort((left, right) => {
          const enabledResult = Number(!left.enabled) - Number(!right.enabled);
          if (enabledResult !== 0) return enabledResult;
          if (left.enabled) {
            const leftPublisher = left.publisherLabel;
            const rightPublisher = right.publisherLabel;
            const publisherResult =
              Number(leftPublisher === null) - Number(rightPublisher === null);
            if (publisherResult !== 0) return publisherResult;
          }
          const result = (left.name ?? left.id).localeCompare(
            right.name ?? right.id,
          );
          if (result !== 0) {
            return installedSortDirection === "asc" ? result : -result;
          }
          return left.id.localeCompare(right.id);
        }),
    [
      categoryFilters,
      installedQuery,
      installedSortDirection,
      plugins,
      sourceFilters,
      stateFilters,
    ],
  );
  const installedList = useResourceInfiniteItems(visiblePlugins, {
    pageSize: installedPageSize,
    resetKey: installedResetKey,
  });

  const startCreatePlugin = (prompt?: string) => {
    navigate(getRootComposeRoutePath(), {
      state: {
        focusPrompt: true,
        initialPrompt: prompt ?? CREATE_PLUGIN_PROMPT,
        replaceInitialPrompt: prompt !== undefined,
      },
    });
  };

  const installedActions = (
    <>
      {plugins.length > 0 ? <CheckPluginUpdatesButton /> : null}
      <CreateWithTemplatesButton
        kind="plugin"
        label="New plugin"
        menuActions={[
          {
            label: "Install from source",
            icon: "Download",
            onSelect: () => setAddDialog({ open: true, initial: null }),
          },
        ]}
        onCreate={startCreatePlugin}
      />
    </>
  );

  let content: ReactNode;
  if (activeMode === "browse") {
    content = (
      <BrowsePluginsTab
        onInstall={(initial) => setAddDialog({ open: true, initial })}
        onOpenPlugin={
          onOpenPlugin ??
          ((pluginId) => navigate(getPluginDetailRoutePath({ pluginId })))
        }
        onInstallFromSource={() => setAddDialog({ open: true, initial: null })}
      />
    );
  } else {
    content = (
      <ResourceCollectionViewport
        scrollId="plugins-installed-results"
        viewportRef={setInstalledViewport}
        bandClassName={TOOLS_PAGE_BAND_CLASSES}
        toolbar={
          <ResourceToolbar
            searchValue={installedQuery}
            searchPlaceholder="Search installed plugins"
            onSearchChange={changeInstalledQuery}
            action={installedActions}
            controls={
              <>
                <ResourceMultiSelectMenu
                  label="State"
                  icon="SlidersHorizontal"
                  compact
                  selectedValues={stateFilters}
                  options={stateFilterOptions}
                  onChange={(values) =>
                    changeInstalledParams(
                      "state",
                      values.filter(isInstalledStateFilter),
                    )
                  }
                />
                <ResourceMultiSelectMenu
                  label="Source"
                  icon="FolderGit"
                  compact
                  selectedValues={sourceFilters}
                  options={sourceFilterOptions}
                  onChange={(values) =>
                    changeInstalledParams(
                      "source",
                      values.filter(isInstalledSourceFilter),
                    )
                  }
                />
                <PluginBrowseCategoryFilter
                  selectionMode="multiple"
                  value={categoryFilters}
                  options={categoryFilterOptions}
                  onChange={(values) =>
                    changeInstalledParams("category", values)
                  }
                />
                <ResourceSortMenu
                  value="alpha"
                  direction={installedSortDirection}
                  compact
                  options={[{ id: "alpha", label: "Plugin name" }]}
                  onChange={() =>
                    setInstalledSortDirection((current) =>
                      current === "asc" ? "desc" : "asc",
                    )
                  }
                />
              </>
            }
          />
        }
      >
        <div className={cn("space-y-3", TOOLS_PAGE_BAND_CLASSES)}>
          {listQuery.isError ? (
            <ResourceListState
              state="error"
              message="Couldn't load plugins."
              onRetry={() => void listQuery.refetch()}
            />
          ) : listQuery.isFetching && listQuery.data === undefined ? (
            <ResourceListState state="loading" message="Loading plugins" />
          ) : plugins.length > 0 && visiblePlugins.length === 0 ? (
            <EmptyStatePanel role="status" className="py-6">
              <div className="flex flex-col items-center gap-2">
                <span>
                  {normalizedInstalledQuery === ""
                    ? "No plugins match these filters."
                    : stateFilters.length > 0 ||
                        sourceFilters.length > 0 ||
                        categoryFilters.length > 0
                      ? `No plugins match "${installedQuery}" with these filters.`
                      : `No plugins match "${installedQuery}"`}
                </span>
                {hasInstalledFilters ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearInstalledFilters}
                  >
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </EmptyStatePanel>
          ) : (
            <>
              <InstalledPluginsTab plugins={installedList.items} />
              <ResourceInfiniteScrollSentinel
                hasMore={installedList.hasMore}
                onLoadMore={installedList.loadMore}
              />
            </>
          )}
        </div>
      </ResourceCollectionViewport>
    );
  }

  return (
    <>
      {activeMode === "browse" ? (
        <div className="flex h-full min-h-0 flex-col">{content}</div>
      ) : (
        <ResourceCollectionPage
          id="plugins-collection"
          description={PLUGINS_INSTALLED_DESCRIPTION}
          bandClassName={TOOLS_PAGE_BAND_CLASSES}
        >
          {content}
        </ResourceCollectionPage>
      )}
      <AddPluginDialog
        open={addDialog.open}
        initial={addDialog.initial}
        onOpenChange={(open) =>
          setAddDialog((current) => ({ ...current, open }))
        }
        onInstalled={(plugin) =>
          navigate(
            getPluginDetailRoutePath({
              pluginId: plugin.id,
              view: "installed",
            }),
          )
        }
      />
    </>
  );
}
