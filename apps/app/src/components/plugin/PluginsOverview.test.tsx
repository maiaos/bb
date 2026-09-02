// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { focusManager } from "@tanstack/react-query";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { makeSystemConfig } from "@/test/fixtures/system-config";
import { SidebarHistoryNavigationControls } from "@/components/sidebar/SidebarHistoryNavigationControls";
import { resetAppRouteHistoryForTest } from "@/lib/app-route-history";
import { PluginsOverview } from "./PluginsOverview";

vi.mock("@/components/plugin/PluginNewThreadComposer", () => ({
  PluginNewThreadComposer: ({ initialPrompt }: { initialPrompt?: string }) => (
    <div data-testid="inline-composer">{initialPrompt}</div>
  ),
}));

function SwitchViewButton({ view }: { view: "browse" | "installed" }) {
  const [, setSearchParams] = useSearchParams();
  return (
    <button
      type="button"
      onClick={() => setSearchParams(view === "browse" ? {} : { view })}
    >
      {`switch-to-${view}`}
    </button>
  );
}

function responseJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const AUTOMATIONS_PLUGIN = {
  id: "automations",
  source: "builtin:automations",
  rootDir: "/plugins/automations",
  version: "0.1.0",
  enabled: true,
  status: "running",
  statusDetail: null,
  description: "Schedule recurring and one-shot agent or script work.",
  name: "Automations",
  icon: "Clock",
  iconUrl: null,
  logoUrl: null,
  logoDarkUrl: null,
  hasSettings: false,
  provenance: "builtin",
  publisherKey: "bb-official",
  publisherLabel: "BB Official",
  catalogMarketplaceName: "bb-official",
  categoryId: "tasks-and-workflows",
  category: "Tasks & Workflows",
  isOrphanedBuiltin: false,
  sourceDisplay: "builtin · automations",
  updateState: {},
  handlerStats: { count: 0, totalMs: 0, maxMs: 0, errorCount: 0 },
  services: [],
  schedules: [],
  cliCommand: null,
  app: { hasApp: true, bundle: null },
};

const GITHUB_CATALOG_ENTRY = {
  entryId: "github",
  pluginId: "github",
  displayName: "GitHub",
  description: "Browse GitHub issues and pull requests in BB.",
  icon: "Github",
  iconUrl: null,
  categoryId: "code-and-reviews",
  category: "Developer tools",
  source: "builtin:github",
  marketplace: "bb-official",
  marketplaceDisplayName: "BB Official",
  publisherKey: "bb-official",
  publisherLabel: "BB Official",
  official: true,
  author: null,
  installed: false,
  compatible: true,
  incompatibleReason: null,
};

const AUTOMATIONS_CATALOG_ENTRY = {
  ...GITHUB_CATALOG_ENTRY,
  entryId: "automations",
  pluginId: "automations",
  displayName: "Automations",
  description: AUTOMATIONS_PLUGIN.description,
  icon: AUTOMATIONS_PLUGIN.icon,
  categoryId: "tasks-and-workflows",
  category: "Workflow management",
  source: AUTOMATIONS_PLUGIN.source,
  installed: true,
};

const DOCS_CATALOG_ENTRY = {
  ...GITHUB_CATALOG_ENTRY,
  entryId: "docs",
  pluginId: "simple-notes",
  displayName: "Docs",
  description: "Create and edit Markdown documents.",
  icon: "NotebookText",
  categoryId: "memory-and-context",
  category: "Context & knowledge",
  source: "builtin:docs",
  installed: true,
};

function installFetch(plugins: readonly unknown[] = [AUTOMATIONS_PLUGIN]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const rawUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const url = new URL(rawUrl, "http://localhost");
      if (url.pathname === "/api/v1/system/config") {
        return responseJson(makeSystemConfig());
      }
      if (url.pathname === "/api/v1/plugins") {
        return responseJson({ plugins });
      }
      if (url.pathname === "/api/v1/plugin-catalog") {
        return responseJson({
          catalog: {
            pluginCount: 13,
            includedPluginCount: 8,
            optionalPluginCount: 5,
          },
        });
      }
      if (url.pathname === "/api/v1/plugin-catalog/search") {
        return responseJson({
          results: [
            AUTOMATIONS_CATALOG_ENTRY,
            DOCS_CATALOG_ENTRY,
            GITHUB_CATALOG_ENTRY,
          ],
          collections: [],
        });
      }
      if (url.pathname === "/api/v1/plugin-catalog/install") {
        return responseJson({
          ok: true,
          plugin: {
            ...AUTOMATIONS_PLUGIN,
            id: "github",
            source: GITHUB_CATALOG_ENTRY.source,
            rootDir: "/plugins/github",
            name: GITHUB_CATALOG_ENTRY.displayName,
            description: GITHUB_CATALOG_ENTRY.description,
            icon: GITHUB_CATALOG_ENTRY.icon,
            provenance: "catalog",
            publisherKey: "bb-official",
            publisherLabel: "BB Official",
            catalogEntryId: GITHUB_CATALOG_ENTRY.entryId,
            sourceDisplay: "BB Official · GitHub",
          },
        });
      }
      return responseJson({ error: "not found" }, 404);
    }),
  );
}

function LocationPath() {
  return <span data-testid="location-path">{useLocation().pathname}</span>;
}

function LocationSearch() {
  return <span data-testid="location-search">{useLocation().search}</span>;
}

function installedRowIds() {
  return [...document.querySelectorAll('[data-testid^="plugin-row-"]')].map(
    (row) => row.getAttribute("data-testid"),
  );
}

afterEach(() => {
  focusManager.setFocused(undefined);
  cleanup();
  resetAppRouteHistoryForTest();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PluginsOverview", () => {
  it("opens on Browse and renders it before Installed", async () => {
    installFetch();
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins"]}>
        <QueryClientWrapper>
          <PluginsOverview />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    expect(await screen.findByText("GitHub")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Browse" })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Installed/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Create a plugin" }),
    ).toBeTruthy();
    const comboTrigger = screen.getByRole("button", {
      name: "Create a plugin options",
    });
    fireEvent.pointerDown(comboTrigger);
    expect(
      screen.getByRole("menuitem", { name: "Install from source" }),
    ).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "New plugin" })).toBeNull();

    const catalogRequests = () =>
      vi.mocked(fetch).mock.calls.filter(([input]) => {
        const rawUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        return (
          new URL(rawUrl, "http://localhost").pathname ===
          "/api/v1/plugin-catalog/search"
        );
      });
    expect(catalogRequests()).toHaveLength(1);

    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    await waitFor(() => expect(catalogRequests()).toHaveLength(1));
  });

  it("uses the existing sidebar history control to return from creation", async () => {
    installFetch();
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins"]}>
        <QueryClientWrapper>
          <SidebarHistoryNavigationControls />
          <PluginsOverview />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    await screen.findByText("GitHub");
    const createPlugin = screen.getByRole("button", {
      name: "Create a plugin",
    });

    fireEvent.click(createPlugin);
    expect(await screen.findByTestId("inline-composer")).toBeTruthy();
    expect(screen.queryByText("Back to browse plugins")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Close the composer" }),
    ).toBeNull();

    fireEvent.click(createPlugin);
    expect(screen.getByTestId("inline-composer")).toBeTruthy();

    const goBack = screen.getByRole("button", { name: "Go back" });
    await waitFor(() =>
      expect((goBack as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(goBack);
    await waitFor(() =>
      expect(screen.queryByTestId("inline-composer")).toBeNull(),
    );
  });

  it("shows category filters only in Browse", async () => {
    installFetch([
      AUTOMATIONS_PLUGIN,
      {
        ...AUTOMATIONS_PLUGIN,
        id: "simple-notes",
        source: "builtin:docs",
        name: "Docs",
        description: DOCS_CATALOG_ENTRY.description,
        icon: DOCS_CATALOG_ENTRY.icon,
        provenance: "catalog",
        publisherKey: "bb-official",
        publisherLabel: "BB Official",
        catalogEntryId: "docs",
      },
    ]);
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins"]}>
        <QueryClientWrapper>
          <PluginsOverview />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    expect(await screen.findByText("GitHub")).toBeTruthy();
    const categoryTrigger = screen.getByRole("button", {
      name: "Filter plugins by category: All categories",
    });
    expect(screen.queryByRole("button", { name: "Type" })).toBeNull();
    fireEvent.click(categoryTrigger);
    fireEvent.click(
      screen.getByRole("option", { name: /Context & knowledge/u }),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("Docs")).toBeTruthy();
    expect(screen.queryByText("GitHub")).toBeNull();
  });

  it("sends Installed's New plugin to the new-thread page with the seed", async () => {
    installFetch([AUTOMATIONS_PLUGIN]);
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins?view=installed"]}>
        <QueryClientWrapper>
          <PluginsOverview />
          <LocationPath />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Automations")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New plugin" }));

    expect(screen.getByTestId("location-path").textContent).toBe("/");
  });

  it("shows independent Installed facets with counts", async () => {
    installFetch([AUTOMATIONS_PLUGIN]);
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins?view=installed"]}>
        <QueryClientWrapper>
          <PluginsOverview />
          <SwitchViewButton view="browse" />
          <SwitchViewButton view="installed" />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Automations")).toBeTruthy();
    const state = screen.getByRole("button", { name: "State" });
    const source = screen.getByRole("button", { name: "Source" });
    expect(state).toBeTruthy();
    expect(source).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Filter plugins by category: All categories",
      }),
    ).toBeTruthy();
    fireEvent.pointerDown(state);
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Enabled" }).textContent,
    ).toContain("1");
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerDown(source);
    expect(
      screen.getByRole("menuitemcheckbox", { name: "BB Official" }).textContent,
    ).toContain("1");
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Filter plugins by category: All categories",
      }),
    );
    expect(
      screen.getByRole("option", { name: "Tasks & Workflows, 1 plugin" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Type" })).toBeNull();
    expect(screen.getByRole("button", { name: "New plugin" })).toBeTruthy();
  });

  it("keeps Browse filters in the toolbar rather than a separate pill band", async () => {
    installFetch();
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    const { container } = render(
      <MemoryRouter initialEntries={["/extensions/plugins?view=browse"]}>
        <QueryClientWrapper>
          <PluginsOverview />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    await screen.findByText("GitHub");
    expect(
      screen.queryByRole("radiogroup", {
        name: "Filter plugins by category",
      }),
    ).toBeNull();
    expect(
      container.querySelector(
        "[data-resource-collection-viewport] > .shrink-0",
      ),
    ).toBeNull();
    const search = screen.getByRole("textbox", { name: "Search plugins" });
    const toolbar = search.parentElement?.parentElement as HTMLElement;
    const category = screen.getByRole("button", {
      name: "Filter plugins by category: All categories",
    });
    const sort = screen.getByRole("button", { name: /^Sort:/ });
    expect(toolbar.contains(category)).toBe(true);
    expect(toolbar.contains(sort)).toBe(true);
    const heroHeading = screen.getByRole("heading", {
      level: 2,
      name: /^Turn bb into/,
    });
    expect(
      heroHeading.compareDocumentPosition(toolbar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens installed resources on the canonical Tools detail route", async () => {
    installFetch();
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins?view=installed"]}>
        <QueryClientWrapper>
          <Routes>
            <Route path="/extensions/plugins" element={<PluginsOverview />} />
            <Route path="*" element={<LocationPath />} />
          </Routes>
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Automations plugin details",
      }),
    );
    expect(screen.getByTestId("location-path").textContent).toBe(
      "/extensions/plugins/automations",
    );
  });

  it("opens the canonical detail returned by a Browse install", async () => {
    installFetch();
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins?view=browse"]}>
        <QueryClientWrapper>
          <Routes>
            <Route path="/extensions/plugins" element={<PluginsOverview />} />
            <Route path="*" element={<LocationPath />} />
          </Routes>
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Install GitHub" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Install GitHub?" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Install GitHub" }));

    expect((await screen.findByTestId("location-path")).textContent).toBe(
      "/extensions/plugins/github",
    );
  });

  it("loads more installed plugins as the scroll sentinel is reached", async () => {
    const plugins = Array.from({ length: 12 }, (_, index) => {
      const ordinal = String(index + 1).padStart(2, "0");
      return {
        ...AUTOMATIONS_PLUGIN,
        id: `plugin-${ordinal}`,
        source: `builtin:plugin-${ordinal}`,
        name: `Plugin ${ordinal}`,
      };
    });
    const intersectionCallbacks = new Set<IntersectionObserverCallback>();
    vi.stubGlobal(
      "IntersectionObserver",
      class IntersectionObserverMock {
        constructor(private readonly callback: IntersectionObserverCallback) {
          intersectionCallbacks.add(this.callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {
          intersectionCallbacks.delete(this.callback);
        }
      },
    );
    const reachSentinel = () =>
      act(() => {
        for (const callback of intersectionCallbacks) {
          callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            {} as IntersectionObserver,
          );
        }
      });
    installFetch(plugins);
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins?view=installed"]}>
        <QueryClientWrapper>
          <PluginsOverview />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Plugin 01")).toBeTruthy();
    expect(screen.getByText("Plugin 10")).toBeTruthy();
    expect(screen.queryByText("Plugin 11")).toBeNull();
    expect(
      document.querySelector("[data-resource-infinite-sentinel]"),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();

    reachSentinel();
    expect(screen.getByText("Plugin 01")).toBeTruthy();
    expect(screen.getByText("Plugin 12")).toBeTruthy();
    expect(
      document.querySelector("[data-resource-infinite-sentinel]"),
    ).toBeNull();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search installed plugins" }),
      { target: { value: "Plugin 01" } },
    );
    expect(screen.getByText("Plugin 01")).toBeTruthy();
    expect(screen.queryByText("Plugin 12")).toBeNull();
  });

  it("fits the first chunk to the viewport and keeps the list panel unstretched", async () => {
    const plugins = Array.from({ length: 30 }, (_, index) => {
      const ordinal = String(index + 1).padStart(2, "0");
      return {
        ...AUTOMATIONS_PLUGIN,
        id: `plugin-${ordinal}`,
        source: `builtin:plugin-${ordinal}`,
        name: `Plugin ${ordinal}`,
      };
    });
    const viewportHeight = 760;
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientHeight",
    );

    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return this.id === "plugins-installed-results" ? viewportHeight : 0;
      },
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        const height = this.hasAttribute("data-resource-list-panel")
          ? viewportHeight
          : this.hasAttribute("data-resource-row")
            ? 50
            : 0;
        return new DOMRect(0, 0, 800, height);
      },
    );
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserverMock {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );

    try {
      installFetch(plugins);
      const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
      render(
        <MemoryRouter initialEntries={["/extensions/plugins?view=installed"]}>
          <QueryClientWrapper>
            <PluginsOverview />
          </QueryClientWrapper>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Plugin 15")).toBeTruthy();
      });
      expect(screen.queryByText("Plugin 16")).toBeNull();
      expect(
        document.querySelector("[data-resource-infinite-sentinel]"),
      ).not.toBeNull();
      const listPanel = document.querySelector("[data-resource-list-panel]");
      expect(
        document.querySelector("[data-resource-collection-content]"),
      ).toBeNull();
      expect(listPanel?.classList.contains("flex-1")).toBe(false);
    } finally {
      if (clientHeightDescriptor === undefined) {
        Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
      } else {
        Object.defineProperty(
          HTMLElement.prototype,
          "clientHeight",
          clientHeightDescriptor,
        );
      }
    }
  });

  it("sorts enabled plugins before inactive plugins and published plugins first within enabled", async () => {
    installFetch([
      {
        ...AUTOMATIONS_PLUGIN,
        id: "inactive-official",
        name: "Inactive Official",
        enabled: false,
        status: "disabled",
        provenance: "catalog",
        publisherKey: "bb-community",
        publisherLabel: "BB Community",
        catalogEntryId: "inactive-official",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "enabled-local-alpha",
        name: "Enabled Local",
        provenance: "direct",
        publisherLabel: null,
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "enabled-official-zulu",
        name: "Enabled Official Zulu",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "enabled-official-alpha",
        name: "Enabled Official Alpha",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "inactive-local",
        name: "Inactive Local",
        enabled: false,
        status: "disabled",
        provenance: "direct",
        publisherLabel: null,
      },
    ]);
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins?view=installed"]}>
        <QueryClientWrapper>
          <PluginsOverview />
          <SwitchViewButton view="browse" />
          <SwitchViewButton view="installed" />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    await screen.findByText("Enabled Official Alpha");
    const rows = [...document.querySelectorAll('[data-testid^="plugin-row-"]')];
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      "plugin-row-enabled-official-alpha",
      "plugin-row-enabled-official-zulu",
      "plugin-row-enabled-local-alpha",
      "plugin-row-inactive-local",
      "plugin-row-inactive-official",
    ]);
    const officialPills = screen.getAllByText("BB Official");
    expect(officialPills).toHaveLength(2);
    expect(screen.getAllByText("BB Community")).toHaveLength(1);

    const sortTrigger = screen.getByRole("button", {
      name: "Sort: Plugin name, ascending",
    });
    expect(sortTrigger.querySelector('[data-icon="ArrowUpDown"]')).toBeTruthy();
    fireEvent.pointerDown(sortTrigger);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Plugin name" }));
    expect(
      [...document.querySelectorAll('[data-testid^="plugin-row-"]')].map(
        (row) => row.getAttribute("data-testid"),
      ),
    ).toEqual([
      "plugin-row-enabled-official-zulu",
      "plugin-row-enabled-official-alpha",
      "plugin-row-enabled-local-alpha",
      "plugin-row-inactive-official",
      "plugin-row-inactive-local",
    ]);

    fireEvent.keyDown(
      screen.getByRole("menu", {
        name: "Sort: Plugin name, descending",
      }),
      { key: "Escape" },
    );
    fireEvent.click(screen.getByText("switch-to-browse"));
    await screen.findByText("GitHub");
    fireEvent.click(screen.getByText("switch-to-installed"));
    expect(
      [...document.querySelectorAll('[data-testid^="plugin-row-"]')].map(
        (row) => row.getAttribute("data-testid"),
      ),
    ).toEqual([
      "plugin-row-enabled-official-zulu",
      "plugin-row-enabled-official-alpha",
      "plugin-row-enabled-local-alpha",
      "plugin-row-inactive-official",
      "plugin-row-inactive-local",
    ]);
  });

  it("uses OR within the State facet", async () => {
    installFetch([
      { ...AUTOMATIONS_PLUGIN, id: "running", name: "Running" },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "disabled",
        name: "Disabled",
        enabled: false,
        status: "disabled",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "broken",
        name: "Broken",
        status: "error",
        statusDetail: "The plugin did not start.",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "update",
        name: "Update",
        updateState: { availableVersion: "0.2.0" },
      },
    ]);
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins?view=installed"]}>
        <QueryClientWrapper>
          <PluginsOverview />
          <SwitchViewButton view="browse" />
          <SwitchViewButton view="installed" />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    await screen.findByText("Running");
    fireEvent.pointerDown(screen.getByRole("button", { name: "State" }));
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Not running" }),
    );
    await waitFor(() =>
      expect(installedRowIds()).toEqual(["plugin-row-broken"]),
    );
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Disabled" }));
    await waitFor(() =>
      expect(installedRowIds()).toEqual([
        "plugin-row-broken",
        "plugin-row-disabled",
      ]),
    );
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Not running" }),
    );
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Disabled" }));
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Update available" }),
    );
    await waitFor(() =>
      expect(installedRowIds()).toEqual(["plugin-row-update"]),
    );
  });

  it("uses OR within the Source facet and names third-party marketplaces", async () => {
    installFetch([
      { ...AUTOMATIONS_PLUGIN, id: "official", name: "Official" },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "community",
        name: "Community",
        provenance: "catalog",
        catalogMarketplaceName: "bb-community",
        publisherLabel: "BB Community",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "acme",
        name: "Acme",
        provenance: "catalog",
        catalogMarketplaceName: "acme-plugins",
        publisherLabel: "Acme Plugins",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "git",
        name: "Git",
        provenance: "direct",
        catalogMarketplaceName: undefined,
        publisherLabel: null,
        source: "git:https://github.com/acme/plugin.git@main",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "direct-url",
        name: "Direct URL",
        provenance: "direct",
        catalogMarketplaceName: undefined,
        publisherLabel: null,
        source: "https://github.com/acme/direct-plugin.git",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "npm",
        name: "npm",
        provenance: "direct",
        catalogMarketplaceName: undefined,
        publisherLabel: null,
        source: "npm:@acme/plugin@^1",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "path",
        name: "Path",
        provenance: "direct",
        catalogMarketplaceName: undefined,
        publisherLabel: null,
        source: "path:/tmp/acme-plugin",
      },
    ]);
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins?view=installed"]}>
        <QueryClientWrapper>
          <PluginsOverview />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    await screen.findByText("Path");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Source" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Git" }));
    await waitFor(() =>
      expect(installedRowIds()).toEqual([
        "plugin-row-direct-url",
        "plugin-row-git",
      ]),
    );
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Git" }));
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Acme Plugins" }),
    );
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Path" }));
    await waitFor(() =>
      expect(installedRowIds()).toEqual(["plugin-row-acme", "plugin-row-path"]),
    );
  });

  it("combines State, Source, Category, and search with AND", async () => {
    installFetch([
      {
        ...AUTOMATIONS_PLUGIN,
        id: "secure-notes",
        name: "Secure Notes",
        enabled: false,
        status: "disabled",
        provenance: "catalog",
        catalogMarketplaceName: "bb-community",
        publisherLabel: "BB Community",
        categoryId: "security",
        category: "Security",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "other-community",
        name: "Other Community",
        enabled: false,
        status: "disabled",
        provenance: "catalog",
        catalogMarketplaceName: "bb-community",
        publisherLabel: "BB Community",
        categoryId: "security",
        category: "Security",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "enabled-notes",
        name: "Enabled Notes",
        provenance: "catalog",
        catalogMarketplaceName: "bb-community",
        publisherLabel: "BB Community",
        categoryId: "security",
        category: "Security",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "acme-notes",
        name: "Acme Notes",
        enabled: false,
        status: "disabled",
        provenance: "catalog",
        catalogMarketplaceName: "acme",
        publisherLabel: "Acme",
        categoryId: "security",
        category: "Security",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "task-notes",
        name: "Task Notes",
        enabled: false,
        status: "disabled",
        provenance: "catalog",
        catalogMarketplaceName: "bb-community",
        publisherLabel: "BB Community",
      },
    ]);
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins?view=installed"]}>
        <QueryClientWrapper>
          <PluginsOverview />
          <LocationSearch />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    await screen.findByText("Secure Notes");
    fireEvent.pointerDown(screen.getByRole("button", { name: "State" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Disabled" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Source" }));
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "BB Community" }),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Filter plugins by category: All categories",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: /Security/u }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search installed plugins" }),
      { target: { value: "notes" } },
    );

    await waitFor(() =>
      expect(installedRowIds()).toEqual(["plugin-row-secure-notes"]),
    );
    await waitFor(() => {
      const resultParams = new URLSearchParams(
        screen.getByTestId("location-search").textContent ?? "",
      );
      expect(resultParams.get("query")).toBe("notes");
      expect(resultParams.getAll("state")).toEqual(["disabled"]);
      expect(resultParams.getAll("source")).toEqual(["bb-community"]);
      expect(resultParams.getAll("category")).toEqual(["security"]);
    });
  });

  it("searches all supported installed plugin fields", async () => {
    installFetch([
      { ...AUTOMATIONS_PLUGIN, id: "alpha", name: "Name Match" },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "id-match",
        name: "Second Plugin",
        description: "A different description.",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "third",
        name: "Third Plugin",
        description: "Description Match",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "version-match",
        name: "Version Plugin",
        version: "9.8.7",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "source-match",
        name: "Source Plugin",
        sourceDisplay: "GitHub · Acme source",
      },
    ]);
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins?view=installed"]}>
        <QueryClientWrapper>
          <PluginsOverview />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    await screen.findByText("Name Match");
    const search = screen.getByRole("textbox", {
      name: "Search installed plugins",
    });
    fireEvent.change(search, { target: { value: "Name Match" } });
    expect(installedRowIds()).toEqual(["plugin-row-alpha"]);
    fireEvent.change(search, { target: { value: "id-match" } });
    expect(installedRowIds()).toEqual(["plugin-row-id-match"]);
    fireEvent.change(search, { target: { value: "Description Match" } });
    expect(installedRowIds()).toEqual(["plugin-row-third"]);
    fireEvent.change(search, { target: { value: "9.8.7" } });
    expect(installedRowIds()).toEqual(["plugin-row-version-match"]);
    fireEvent.change(search, { target: { value: "Acme source" } });
    expect(installedRowIds()).toEqual(["plugin-row-source-match"]);
  });

  it("keeps rapid Installed search input and writes the complete URL", async () => {
    installFetch([
      { ...AUTOMATIONS_PLUGIN, id: "codex", name: "Codex provider" },
    ]);
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins?view=installed"]}>
        <QueryClientWrapper>
          <PluginsOverview />
          <LocationSearch />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    await screen.findByText("Codex provider");
    const search = screen.getByRole("textbox", {
      name: "Search installed plugins",
    });
    for (const value of ["c", "co", "cod", "code", "codex"]) {
      fireEvent.change(search, { target: { value } });
    }
    expect(search).toHaveProperty("value", "codex");
    expect(installedRowIds()).toEqual(["plugin-row-codex"]);
    await waitFor(() => {
      const params = new URLSearchParams(
        screen.getByTestId("location-search").textContent ?? "",
      );
      expect(params.get("query")).toBe("codex");
    });
  });

  it("resolves saved built-in category labels without installed matches", async () => {
    installFetch([
      {
        ...AUTOMATIONS_PLUGIN,
        id: "workflow",
        name: "Workflow",
      },
    ]);
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter
        initialEntries={[
          "/extensions/plugins?view=installed&category=security",
        ]}
      >
        <QueryClientWrapper>
          <PluginsOverview />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("button", {
        name: "Filter plugins by category: Security",
      }),
    ).toBeTruthy();
  });

  it("loads Installed filters from the URL and clears them inline", async () => {
    installFetch([
      {
        ...AUTOMATIONS_PLUGIN,
        id: "local",
        name: "Local",
        enabled: false,
        status: "disabled",
        provenance: "direct",
        catalogMarketplaceName: undefined,
        publisherLabel: null,
        categoryId: undefined,
        category: undefined,
        source: "path:/tmp/local",
      },
      { ...AUTOMATIONS_PLUGIN, id: "official", name: "Official" },
    ]);
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter
        initialEntries={[
          "/extensions/plugins?view=installed&query=absent&state=disabled&source=path&category=__uncategorized__",
        ]}
      >
        <QueryClientWrapper>
          <PluginsOverview />
          <LocationSearch />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText('No plugins match "absent" with these filters.'),
    ).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "Search installed plugins" }),
    ).toHaveProperty("value", "absent");
    expect(
      screen.getByRole("button", { name: "State: 1 selected" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Source: 1 selected" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Filter plugins by category: Uncategorized",
      }),
    ).toBeTruthy();
    expect(screen.getByTestId("location-search").textContent).toContain(
      "state=disabled",
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(installedRowIds()).toEqual([
        "plugin-row-official",
        "plugin-row-local",
      ]),
    );
    expect(screen.getByTestId("location-search").textContent).toBe(
      "?view=installed",
    );
  });

  it("keeps disabled plugins installed regardless of provenance", async () => {
    installFetch([
      AUTOMATIONS_PLUGIN,
      {
        ...AUTOMATIONS_PLUGIN,
        id: "inactive-builtin",
        name: "Inactive Builtin",
        enabled: false,
        status: "disabled",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "inactive-catalog",
        name: "Inactive Catalog Plugin",
        enabled: false,
        status: "disabled",
        provenance: "catalog",
        publisherKey: "bb-community",
        publisherLabel: "BB Community",
        catalogEntryId: "inactive-catalog",
      },
      {
        ...AUTOMATIONS_PLUGIN,
        id: "inactive-local",
        name: "Inactive Local Plugin",
        enabled: false,
        status: "disabled",
        provenance: "direct",
        publisherLabel: null,
      },
    ]);
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins?view=installed"]}>
        <QueryClientWrapper>
          <PluginsOverview />
          <SwitchViewButton view="browse" />
          <SwitchViewButton view="installed" />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Automations")).toBeTruthy();
    expect(
      document.querySelectorAll(
        '[data-testid^="plugin-row-"], [data-plugin-row]',
      ).length,
    ).toBeGreaterThanOrEqual(0);
    expect(screen.getByText("Inactive Builtin")).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "Enable inactive-builtin" }),
    ).toBeTruthy();
    expect(screen.getByText("Inactive Catalog Plugin")).toBeTruthy();
    expect(screen.getByText("Inactive Local Plugin")).toBeTruthy();
  });

  it("badges a built-in plugin BB Official and a catalog install by its marketplace", async () => {
    installFetch([
      AUTOMATIONS_PLUGIN,
      {
        ...AUTOMATIONS_PLUGIN,
        id: "github",
        name: "GitHub",
        source: GITHUB_CATALOG_ENTRY.source,
        provenance: "catalog",
        publisherKey: "bb-community",
        publisherLabel: "BB Community",
        catalogEntryId: GITHUB_CATALOG_ENTRY.entryId,
        sourceDisplay: "BB Official · GitHub",
      },
    ]);
    const { wrapper: QueryClientWrapper } = createQueryClientTestHarness();
    render(
      <MemoryRouter initialEntries={["/extensions/plugins?view=installed"]}>
        <QueryClientWrapper>
          <PluginsOverview />
          <SwitchViewButton view="browse" />
          <SwitchViewButton view="installed" />
        </QueryClientWrapper>
      </MemoryRouter>,
    );

    const official = await screen.findAllByText("BB Official");
    expect(official).toHaveLength(1);
    const community = screen.getAllByText("BB Community");
    expect(community).toHaveLength(1);
    expect(official[0]?.parentElement?.className).toBe(
      community[0]?.parentElement?.className,
    );
  });
});
