/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

import { SloSuggestPage } from '../slo_suggest_page';
import type { SloApiClient } from '../slo_api_client';
import type {
  ChromeStart,
  HttpStart,
  NotificationsStart,
} from '../../../../../../../../src/core/public';

function makeHttp(): HttpStart {
  // The discovery effect fires probes + ruler fetch; resolve them all to
  // empty so the page renders without loading-spinner getting stuck.
  return ({
    get: jest.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata/label-values/')) return Promise.resolve({ values: [] });
      if (url.includes('/rules')) return Promise.resolve({ data: { groups: [] } });
      return Promise.resolve({});
    }),
  } as unknown) as HttpStart;
}

function makeChrome(): ChromeStart {
  return ({ setBreadcrumbs: jest.fn() } as unknown) as ChromeStart;
}

function makeNotifications(): NotificationsStart {
  return ({
    toasts: {
      addSuccess: jest.fn(),
      addDanger: jest.fn(),
      addWarning: jest.fn(),
      addInfo: jest.fn(),
      addError: jest.fn(),
    },
  } as unknown) as NotificationsStart;
}

function makeApiClient(): SloApiClient {
  return ({
    create: jest.fn().mockResolvedValue(undefined),
    preview: jest.fn().mockResolvedValue({ groupName: 'g', interval: 30, rules: [], yaml: '' }),
  } as unknown) as SloApiClient;
}

function renderPage(
  opts: {
    rulerFails?: boolean;
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
    ? (({
        get: jest.fn().mockImplementation((url: string) => {
          if (url.includes('/rules')) return Promise.reject(new Error('ruler down'));
          if (url.includes('/metadata/label-values/')) return Promise.resolve({ values: [] });
          return Promise.resolve({});
        }),
      } as unknown) as HttpStart)
    : makeHttp();
  // Suppress per-probe / ruler failure console.warn / .error so they don't
  // pollute the test report.
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const apiClient = makeApiClient();
  const result = render(
    <MemoryRouter initialEntries={['/slos/suggest']}>
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

describe('SloSuggestPage', () => {
  afterEach(() => {
    mockUseApmConfig.mockReset();
    mockUseServices.mockReset();
    jest.restoreAllMocks();
  });

  it('mounts with mocked services and renders the page chrome', async () => {
    renderPage();
    expect(await screen.findByTestId('slosSuggestPage')).toBeInTheDocument();
    expect(screen.getByTestId('slosSuggestDiscover')).toBeInTheDocument();
    expect(screen.getByTestId('slosSuggestCreate')).toBeInTheDocument();
  });

  it('renders the ruler-fetch-failed warning when the ruler fetch rejects', async () => {
    renderPage({ rulerFails: true });
    expect(await screen.findByTestId('slosSuggestRulerFetchFailed')).toBeInTheDocument();
  });

  it('disables the create button when no rows are selected', async () => {
    renderPage();
    // Click "Clear" to reset the default selection (Suggest defaults to all
    // selected) so the create button drops to disabled.
    await screen.findByTestId('slosSuggestPage');
    await waitFor(() => expect(screen.getByTestId('slosSuggestHeaderStrip')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Clear'));
    await waitFor(() => expect(screen.getByTestId('slosSuggestCreate')).toBeDisabled());
  });

  it('opens and closes the confirm modal', async () => {
    renderPage();
    await screen.findByTestId('slosSuggestPage');
    await waitFor(() => expect(screen.getByTestId('slosSuggestHeaderStrip')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('slosSuggestCreate'));
    expect(await screen.findByTestId('slosSuggestConfirmModal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() =>
      expect(screen.queryByTestId('slosSuggestConfirmModal')).not.toBeInTheDocument()
    );
  });

  it('renders the preview flyout when "Preview" is clicked', async () => {
    renderPage();
    await screen.findByTestId('slosSuggestPage');
    await waitFor(() => expect(screen.getByTestId('slosSuggestPreviewToggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('slosSuggestPreviewToggle'));
    expect(await screen.findByTestId('slosSuggestPreviewFlyout')).toBeInTheDocument();
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
});
