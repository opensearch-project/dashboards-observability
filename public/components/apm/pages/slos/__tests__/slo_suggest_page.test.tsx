/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// HeaderControlledComponentsWrapper hits the chrome service; stub it.
jest.mock('../../../../../plugin_helpers/plugin_headerControl', () => ({
  HeaderControlledComponentsWrapper: ({ components }: { components: React.ReactNode[] }) => (
    <div data-test-subj="header-wrapper">{components}</div>
  ),
}));

// SuggestBatchPreview pulls in the PromQL search service via useLivePreview;
// stub the whole component so the smoke test doesn't have to wire it up.
jest.mock('../suggest_batch_preview', () => ({
  SuggestBatchPreview: () => <div data-test-subj="batchPreviewStub" />,
}));

// Drive the APM config + services discovery via mocks. The page only consumes
// the prometheus datasource id from config and the services list.
const mockUseApmConfig = jest.fn();
const mockUseServices = jest.fn();
jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: () => mockUseApmConfig(),
}));
jest.mock('../../../shared/hooks/use_services', () => ({
  useServices: (...args: unknown[]) => mockUseServices(...args),
}));

// Let individual tests control the drafts the engine returns (e.g. to inject a
// draft already covered by an existing recording rule) without exercising the
// full detector pipeline. Defaults to the real implementation.
const actualEngine = jest.requireActual('../suggest_engine');
const mockGenerateSuggestions = jest.fn();
jest.mock('../suggest_engine', () => ({
  ...jest.requireActual('../suggest_engine'),
  generateSuggestionsForServices: (...args: unknown[]) => mockGenerateSuggestions(...args),
}));

/** Minimal covered/uncovered draft fixture shaped like a real Suggestion. */
function fakeDraft(key: string, service: string, existingRuleMatch = false) {
  return {
    key,
    kindId: 'apm-availability',
    kind: 'APM availability',
    reason: '',
    sourceMetric: 'request',
    detected: { service },
    estimatedRuleCount: 13,
    existingRuleMatch: existingRuleMatch ? { ruleName: 'r', groupName: 'g' } : undefined,
    input: {
      spec: {
        service,
        name: key,
        owner: { teams: ['t'] },
        objectives: [{ name: 'o', target: 0.99 }],
        sli: {
          type: 'single',
          definition: { backend: 'prometheus', type: 'availability', calcMethod: 'events' },
          dimensions: [],
        },
      },
    },
  };
}

import { SloSuggestPage } from '../slo_suggest_page';
import { buildServiceFilterOptions } from '../service_filter_options';
import type { SloApiClient } from '../slo_api_client';
import type {
  ChromeStart,
  HttpStart,
  NotificationsStart,
} from '../../../../../../../../src/core/public';

function makeHttp(): HttpStart {
  // The discovery effect fires probes + ruler fetch; resolve them all to
  // empty so the page renders without loading-spinner getting stuck.
  return {
    get: jest.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata/label-values/')) return Promise.resolve({ values: [] });
      if (url.includes('/rules')) return Promise.resolve({ data: { groups: [] } });
      return Promise.resolve({});
    }),
  } as unknown as HttpStart;
}

function makeChrome(): ChromeStart {
  return { setBreadcrumbs: jest.fn() } as unknown as ChromeStart;
}

function makeNotifications(): NotificationsStart {
  return {
    toasts: {
      addSuccess: jest.fn(),
      addDanger: jest.fn(),
      addWarning: jest.fn(),
      addInfo: jest.fn(),
      addError: jest.fn(),
    },
  } as unknown as NotificationsStart;
}

function makeApiClient(): SloApiClient {
  return {
    create: jest.fn().mockResolvedValue(undefined),
    preview: jest.fn().mockResolvedValue({ groupName: 'g', interval: 30, rules: [], yaml: '' }),
  } as unknown as SloApiClient;
}

function renderPage(
  opts: {
    rulerFails?: boolean;
    /**
     * URL the page mounts at. Drafts are only generated for services named in
     * the `?services=` scope, so interactive tests that need a populated draft
     * view pass an explicit scope. Defaults to unscoped (the empty landing).
     */
    initialEntry?: string;
  } = {}
) {
  mockUseApmConfig.mockReturnValue({
    config: { prometheusDataSource: { name: 'prom-1' } },
    loading: false,
  });
  mockUseServices.mockReturnValue({
    data: [
      { serviceName: 'cart', environment: 'prod' },
      { serviceName: 'checkout', environment: 'prod' },
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  });
  const http = opts.rulerFails
    ? ({
        get: jest.fn().mockImplementation((url: string) => {
          if (url.includes('/rules')) return Promise.reject(new Error('ruler down'));
          if (url.includes('/metadata/label-values/')) return Promise.resolve({ values: [] });
          return Promise.resolve({});
        }),
      } as unknown as HttpStart)
    : makeHttp();
  // Suppress per-probe / ruler failure console.warn / .error so they don't
  // pollute the test report.
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const apiClient = makeApiClient();
  const result = render(
    <MemoryRouter initialEntries={[opts.initialEntry ?? '/slos/suggest']}>
      <SloSuggestPage
        apiClient={apiClient}
        http={http}
        chrome={makeChrome()}
        notifications={makeNotifications()}
        parentBreadcrumb={{ text: 'APM', href: '#/' }}
      />
    </MemoryRouter>
  );
  return { ...result, apiClient };
}

// Scope both mocked services so drafts are generated (unscoped renders the
// "pick services" empty state instead).
const SCOPED_ENTRY = '/slos/suggest?source=apm&services=cart,checkout';

/** Seed the config + services hooks the page reads (for tests that render the
 *  page directly, e.g. to drive rerenders, rather than via `renderPage`). */
function seedPageMocks() {
  mockUseApmConfig.mockReturnValue({
    config: { prometheusDataSource: { name: 'prom-1' } },
    loading: false,
  });
  mockUseServices.mockReturnValue({
    data: [
      { serviceName: 'cart', environment: 'prod' },
      { serviceName: 'checkout', environment: 'prod' },
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
}

/** The scoped page element, for render + rerender in state-machine tests. */
function scopedPage() {
  return (
    <MemoryRouter initialEntries={[SCOPED_ENTRY]}>
      <SloSuggestPage
        apiClient={makeApiClient()}
        http={makeHttp()}
        chrome={makeChrome()}
        notifications={makeNotifications()}
        parentBreadcrumb={{ text: 'APM', href: '#/' }}
      />
    </MemoryRouter>
  );
}

describe('SloSuggestPage', () => {
  beforeEach(() => {
    // Default: delegate to the real detector pipeline. Tests that need a
    // specific draft set override this per-test.
    mockGenerateSuggestions.mockImplementation(actualEngine.generateSuggestionsForServices);
  });

  afterEach(() => {
    mockUseApmConfig.mockReset();
    mockUseServices.mockReset();
    mockGenerateSuggestions.mockReset();
    jest.restoreAllMocks();
  });

  it('mounts with mocked services and renders the page chrome', async () => {
    renderPage();
    expect(await screen.findByTestId('slosSuggestPage')).toBeInTheDocument();
    expect(screen.getByTestId('slosSuggestPreviewToggle')).toBeInTheDocument();
    expect(screen.getByTestId('slosSuggestCreate')).toBeInTheDocument();
  });

  it('renders the ruler-fetch-failed warning when the ruler fetch rejects', async () => {
    renderPage({ rulerFails: true });
    expect(await screen.findByTestId('slosSuggestRulerFetchFailed')).toBeInTheDocument();
  });

  it('shows the "pick services" empty state (and no drafts) when unscoped', async () => {
    renderPage();
    await screen.findByTestId('slosSuggestPage');
    // The service picker is available so the user can scope, but no drafts
    // (and no stats strip) are rendered until they pick.
    expect(await screen.findByTestId('slosSuggestPickServices')).toBeInTheDocument();
    expect(screen.getByTestId('slosSuggestServiceFilter')).toBeInTheDocument();
    expect(screen.getByText('Select services')).toBeInTheDocument();
    expect(screen.queryByTestId('slosSuggestHeaderStrip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slosSuggestTable')).not.toBeInTheDocument();
  });

  it('generates drafts and shows the stats strip when a scope is present', async () => {
    renderPage({ initialEntry: SCOPED_ENTRY });
    await screen.findByTestId('slosSuggestPage');
    expect(await screen.findByTestId('slosSuggestHeaderStrip')).toBeInTheDocument();
    expect(screen.getByTestId('slosSuggestTable')).toBeInTheDocument();
    expect(screen.queryByTestId('slosSuggestPickServices')).not.toBeInTheDocument();
    // Button reflects the scoped count, not "Select services" or "0 services".
    expect(screen.getByText('Suggest SLOs for 2 services')).toBeInTheDocument();
  });

  it('defaults scoped drafts to selected so the create button is enabled', async () => {
    renderPage({ initialEntry: SCOPED_ENTRY });
    await screen.findByTestId('slosSuggestPage');
    await waitFor(() => expect(screen.getByTestId('slosSuggestHeaderStrip')).toBeInTheDocument());
    // A scoped page lands with every uncovered draft selected — no top-level
    // Select all / Clear links exist anymore.
    expect(screen.queryByText('Select all')).not.toBeInTheDocument();
    expect(screen.getByTestId('slosSuggestCreate')).not.toBeDisabled();
  });

  it('disables the create button when every service is deselected', async () => {
    renderPage({ initialEntry: SCOPED_ENTRY });
    await screen.findByTestId('slosSuggestPage');
    await waitFor(() => expect(screen.getByTestId('slosSuggestHeaderStrip')).toBeInTheDocument());
    // Uncheck each service's master checkbox to clear the default selection.
    fireEvent.click(screen.getByTestId('slosSuggestServiceSelect-cart'));
    fireEvent.click(screen.getByTestId('slosSuggestServiceSelect-checkout'));
    await waitFor(() => expect(screen.getByTestId('slosSuggestCreate')).toBeDisabled());
  });

  it('opens and closes the confirm modal', async () => {
    renderPage({ initialEntry: SCOPED_ENTRY });
    await screen.findByTestId('slosSuggestPage');
    await waitFor(() => expect(screen.getByTestId('slosSuggestHeaderStrip')).toBeInTheDocument());
    // Drafts default to selected, so create is immediately actionable.
    await waitFor(() => expect(screen.getByTestId('slosSuggestCreate')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('slosSuggestCreate'));
    expect(await screen.findByTestId('slosSuggestConfirmModal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirmModalCancelButton'));
    await waitFor(() =>
      expect(screen.queryByTestId('slosSuggestConfirmModal')).not.toBeInTheDocument()
    );
  });

  it('renders the preview flyout when "Preview" is clicked', async () => {
    renderPage({ initialEntry: SCOPED_ENTRY });
    await screen.findByTestId('slosSuggestPage');
    await waitFor(() => expect(screen.getByTestId('slosSuggestPreviewToggle')).toBeInTheDocument());
    // Preview is enabled because scoped drafts default to selected.
    await waitFor(() => expect(screen.getByTestId('slosSuggestPreviewToggle')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('slosSuggestPreviewToggle'));
    expect(await screen.findByTestId('slosSuggestPreviewFlyout')).toBeInTheDocument();
  });

  it('resizes the preview flyout by dragging the handle and cleans up on mouse up', async () => {
    renderPage({ initialEntry: SCOPED_ENTRY });
    await screen.findByTestId('slosSuggestPage');
    await waitFor(() => expect(screen.getByTestId('slosSuggestPreviewToggle')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('slosSuggestPreviewToggle'));
    const flyout = await screen.findByTestId('slosSuggestPreviewFlyout');
    const handle = screen.getByTestId('slosSuggestPreviewFlyoutResizeHandle');

    const widthBefore = flyout.getBoundingClientRect().width || parseFloat(flyout.style.width) || 0;

    // Press on the handle → cursor + user-select locked globally while dragging.
    fireEvent.mouseDown(handle, { clientX: 800 });
    expect(document.body.style.cursor).toBe('col-resize');
    expect(document.body.style.userSelect).toBe('none');

    // Drag left (smaller clientX) → the flyout, docked right, grows wider.
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 600 }));
    });
    await waitFor(() => {
      const widthAfter =
        flyout.getBoundingClientRect().width || parseFloat(flyout.style.width) || 0;
      expect(widthAfter).toBeGreaterThan(widthBefore);
    });

    // Releasing clears the global cursor/user-select locks.
    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'));
    });
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });

  it('clears the service scope from the filter dropdown, returning to the empty state', async () => {
    renderPage({ initialEntry: SCOPED_ENTRY });
    await screen.findByTestId('slosSuggestPage');
    await waitFor(() => expect(screen.getByTestId('slosSuggestHeaderStrip')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('slosSuggestServiceFilter'));
    fireEvent.click(await screen.findByTestId('slosSuggestServiceFilterClear'));
    // Scope cleared → drafts gone → the "pick services" empty state returns.
    expect(await screen.findByTestId('slosSuggestPickServices')).toBeInTheDocument();
    expect(screen.queryByTestId('slosSuggestHeaderStrip')).not.toBeInTheDocument();
  });

  it('renders the no-datasource warning when prometheusDataSource is missing', async () => {
    mockUseApmConfig.mockReturnValue({
      config: {},
      loading: false,
    });
    mockUseServices.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/slos/suggest']}>
        <SloSuggestPage
          apiClient={makeApiClient()}
          http={makeHttp()}
          chrome={makeChrome()}
          notifications={makeNotifications()}
          parentBreadcrumb={{ text: 'APM', href: '#/' }}
        />
      </MemoryRouter>
    );
    expect(await screen.findByText(/No Prometheus datasource configured/)).toBeInTheDocument();
  });

  it('leaves already-covered drafts unchecked and surfaces the covered subline', async () => {
    // cart yields two drafts: one already covered by an existing rule, one not.
    mockGenerateSuggestions.mockReturnValue([
      fakeDraft('cart-avail', 'cart', true),
      fakeDraft('cart-lat', 'cart', false),
    ]);
    renderPage({ initialEntry: SCOPED_ENTRY });
    await screen.findByTestId('slosSuggestPage');
    await waitFor(() => expect(screen.getByTestId('slosSuggestHeaderStrip')).toBeInTheDocument());

    // Only the uncovered draft is selected by default → "Create 1 SLO".
    expect(screen.getByTestId('slosSuggestCreate')).toHaveTextContent('Create 1 SLO');
    // The covered draft is called out in the subline.
    expect(screen.getByTestId('slosSuggestHeaderSubline')).toHaveTextContent(
      '1 draft already covered by existing rules'
    );
  });

  it('deselects an untouched draft when coverage resolves late', async () => {
    seedPageMocks();
    // First paint: both drafts uncovered (ruler not yet resolved) → both selected.
    mockGenerateSuggestions.mockReturnValue([
      fakeDraft('cart-avail', 'cart', false),
      fakeDraft('cart-lat', 'cart', false),
    ]);
    const { rerender } = render(scopedPage());
    await screen.findByTestId('slosSuggestPage');
    await waitFor(() =>
      expect(screen.getByTestId('slosSuggestCreate')).toHaveTextContent('Create 2 SLOs')
    );

    // Ruler resolves: cart-avail now matches an existing rule. The user never
    // touched it, so the late coverage signal must deselect it.
    mockGenerateSuggestions.mockReturnValue([
      fakeDraft('cart-avail', 'cart', true),
      fakeDraft('cart-lat', 'cart', false),
    ]);
    rerender(scopedPage());
    await waitFor(() =>
      expect(screen.getByTestId('slosSuggestCreate')).toHaveTextContent('Create 1 SLO')
    );
  });

  it('preserves a manual toggle when the draft set recomputes', async () => {
    seedPageMocks();
    mockGenerateSuggestions.mockReturnValue([
      fakeDraft('cart-avail', 'cart', false),
      fakeDraft('cart-lat', 'cart', false),
    ]);
    const { rerender } = render(scopedPage());
    await screen.findByTestId('slosSuggestPage');
    await waitFor(() =>
      expect(screen.getByTestId('slosSuggestCreate')).toHaveTextContent('Create 2 SLOs')
    );

    // User expands cart and unchecks the latency draft themselves.
    fireEvent.click(screen.getByTestId('slosSuggestServiceExpand-cart'));
    fireEvent.click(await screen.findByTestId('slosSuggestSelect-cart-lat'));
    await waitFor(() =>
      expect(screen.getByTestId('slosSuggestCreate')).toHaveTextContent('Create 1 SLO')
    );

    // A metadata-only recompute (same keys) must NOT re-check the user's draft.
    mockGenerateSuggestions.mockReturnValue([
      fakeDraft('cart-avail', 'cart', false),
      fakeDraft('cart-lat', 'cart', false),
    ]);
    rerender(scopedPage());
    // Still 1 — the manual deselection survived the recompute.
    await waitFor(() =>
      expect(screen.getByTestId('slosSuggestCreate')).toHaveTextContent('Create 1 SLO')
    );
  });
});

describe('buildServiceFilterOptions', () => {
  it('checks in-scope services and leaves the rest unchecked', () => {
    const opts = buildServiceFilterOptions(
      ['cart', 'checkout', 'payments'],
      new Set(['cart']),
      new Set()
    );
    const byLabel = Object.fromEntries(opts.map((o) => [o.label, o]));
    expect(byLabel.cart.checked).toBe('on');
    expect(byLabel.checkout.checked).toBeUndefined();
    expect(byLabel.payments.checked).toBeUndefined();
  });

  it('disables covered services and never checks them, even if in scope', () => {
    const opts = buildServiceFilterOptions(
      ['cart', 'payments'],
      new Set(['cart', 'payments']),
      new Set(['payments'])
    );
    const byLabel = Object.fromEntries(opts.map((o) => [o.label, o]));
    expect(byLabel.payments.disabled).toBe(true);
    expect(byLabel.payments.covered).toBe(true);
    expect(byLabel.payments.checked).toBeUndefined();
    expect(byLabel.cart.disabled).toBe(false);
    expect(byLabel.cart.checked).toBe('on');
  });

  it('floats checked services to the top, preserving order within each group', () => {
    const opts = buildServiceFilterOptions(
      ['ad', 'cart', 'checkout', 'currency', 'email'],
      new Set(['checkout', 'email']),
      new Set()
    );
    expect(opts.map((o) => o.label)).toEqual([
      // checked, in original order…
      'checkout',
      'email',
      // …then unchecked, in original order.
      'ad',
      'cart',
      'currency',
    ]);
  });
});
