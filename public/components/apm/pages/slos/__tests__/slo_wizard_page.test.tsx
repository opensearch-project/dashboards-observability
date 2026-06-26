/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import { SloWizardPage } from '../slo_wizard_page';
import type { SloApiClient } from '../slo_api_client';

// The preview panel schedules a debounced fetch via setTimeout. Keep that
// deterministic in these tests — we don't want real timers flakiness.
jest.useFakeTimers();

// HeaderControlledComponentsWrapper reaches into OSD's chrome pipeline, which
// is not wired up in this jsdom setup. Render its children inline so the
// wizard body still mounts.
jest.mock('../../../../../plugin_helpers/plugin_headerControl', () => ({
  HeaderControlledComponentsWrapper: ({ components }: { components: React.ReactNode[] }) => (
    <div data-test-subj="header-wrapper">{components}</div>
  ),
}));

// The datasource picker reads the live list via useDatasources(), which would
// reach coreRefs.savedObjectsClient (unwired here). Provide one eligible
// Prometheus datasource so the select renders with a selectable option.
jest.mock('../../../../alerting/hooks/use_datasources', () => ({
  useDatasources: () => ({
    datasources: [
      {
        id: 'ds-2',
        name: 'Prod Prometheus',
        type: 'prometheus',
        url: 'ds-2',
        enabled: true,
        directQueryName: 'prom_conn',
      },
    ],
    isLoading: false,
    error: null,
    refresh: () => {},
  }),
}));

// The SLI metric picker uses usePrometheusMetadata, which reaches coreRefs.http.
// Stub it to an inert shape — the wizard test exercises free-text metric entry,
// not autocomplete.
jest.mock('../../../../alerting/hooks/use_prometheus_metadata', () => ({
  usePrometheusMetadata: () => ({
    metricOptions: [],
    metricsLoading: false,
    searchMetrics: jest.fn(),
    labelNames: [],
    labelNamesLoading: false,
    labelValues: {},
    labelValuesLoading: {},
    fetchLabelValues: jest.fn(),
    metricMetadata: [],
    error: false,
    applyTemplate: jest.fn(),
  }),
}));

// The Service/owner panel's useOwnerSuggestions hook calls list + labelValues.
// Stub them empty by default so the comboboxes render (free text still works)
// without each test having to wire suggestion sources.
function withSuggestionStubs(apiClient: Partial<SloApiClient>): Partial<SloApiClient> {
  return {
    list: jest.fn().mockResolvedValue({ results: [], total: 0 }),
    labelValues: jest.fn().mockResolvedValue({ values: [] }),
    ...apiClient,
  };
}

function renderWizard(apiClient: Partial<SloApiClient>, templateId = 'http-availability') {
  const chrome = ({ setBreadcrumbs: jest.fn() } as unknown) as Parameters<
    typeof SloWizardPage
  >[0]['chrome'];
  const notifications = ({
    toasts: {
      addSuccess: jest.fn(),
      addWarning: jest.fn(),
      addDanger: jest.fn(),
    },
  } as unknown) as Parameters<typeof SloWizardPage>[0]['notifications'];

  return render(
    <MemoryRouter initialEntries={[`/slos/create/${templateId}`]}>
      <Route path="/slos/create/:templateId">
        <SloWizardPage
          apiClient={withSuggestionStubs(apiClient) as SloApiClient}
          chrome={chrome}
          notifications={notifications}
          parentBreadcrumb={{ text: 'APM', href: '#/' }}
        />
      </Route>
    </MemoryRouter>
  );
}

/**
 * Minimum fields required to pass client-side validation so `apiClient.create`
 * is actually reached. Validator exits early on any missing field.
 */
/** Pick the mocked `ds-2` datasource from the combobox. */
function selectDatasource() {
  const combo = screen.getByTestId('slosWizardDatasourceId');
  // Toggle lives inside the input container; options portal to document.body.
  fireEvent.click(within(combo).getByTestId('comboBoxToggleListButton'));
  fireEvent.click(screen.getByRole('option', { name: 'Prod Prometheus' }));
}

/**
 * Enter free text into a suggesting combobox (Service / Primary team). Type
 * into the inner search input and press Enter to fire `onCreateOption`.
 */
function typeComboBox(testSubj: string, value: string) {
  const combo = screen.getByTestId(testSubj);
  const input = within(combo).getByTestId('comboBoxSearchInput');
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
}

function fillMinimumRequiredFields() {
  selectDatasource();
  fireEvent.change(screen.getByTestId('slosWizardName'), {
    target: { value: 'my-api-availability' },
  });
  typeComboBox('slosWizardService', 'my-api');
  typeComboBox('slosWizardOwnerTeam', 'sre');
  fireEvent.change(screen.getByTestId('slosWizardDimValue-0'), {
    target: { value: 'my-api' },
  });
}

describe('SloWizardPage — Wave 2 additions', () => {
  // All selectable windows in the wizard (7d/14d/28d/30d) exceed the 3d
  // recording-rule window, so the approximation warning fires for every
  // selection. We check a representative pair to prove the callout tracks
  // the validator's `warnings` map rather than always-or-never rendering.
  it('renders the window-approximation warning for 7d', async () => {
    const apiClient: Partial<SloApiClient> = {
      preview: jest.fn().mockResolvedValue({
        groupName: 'g',
        interval: 30,
        rules: [],
        yaml: '',
      }),
    };
    renderWizard(apiClient);
    const windowSelect = screen.getByTestId('slosWizardWindow');
    fireEvent.change(windowSelect, { target: { value: '7d' } });
    await waitFor(() => {
      expect(screen.getByTestId('slosWizardWindowWarning')).toBeInTheDocument();
    });
    expect(screen.getByTestId('slosWizardWindowWarning')).toHaveTextContent('approximation');
  });

  it('renders the approximation warning for the default 28d window on mount', () => {
    const apiClient: Partial<SloApiClient> = {
      preview: jest.fn().mockResolvedValue({
        groupName: 'g',
        interval: 30,
        rules: [],
        yaml: '',
      }),
    };
    renderWizard(apiClient);
    expect(screen.getByTestId('slosWizardWindowWarning')).toBeInTheDocument();
  });

  it('renders the ruler-error envelope when apiClient.create rejects with RULER_VALIDATION_FAILED', async () => {
    const apiClient: Partial<SloApiClient> = {
      preview: jest.fn().mockResolvedValue({
        groupName: 'g',
        interval: 30,
        rules: [],
        yaml: '',
      }),
      // OSD HttpFetchError shape: .body = { message, attributes }.
      create: jest.fn().mockRejectedValue({
        body: {
          message: 'Ruler rejected',
          attributes: {
            error: 'Ruler rejected',
            code: 'RULER_VALIDATION_FAILED',
            httpStatus: 400,
            rawBody: 'invalid PromQL: parse error at char 42',
          },
        },
      }),
    };
    renderWizard(apiClient);
    fillMinimumRequiredFields();

    await act(async () => {
      fireEvent.click(screen.getByTestId('slosWizardSubmit'));
    });
    // Flush any pending microtasks + timers the error path may queue.
    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    await waitFor(() => {
      expect(screen.getByTestId('slosWizardRulerError')).toBeInTheDocument();
    });
    // The raw Cortex diagnostic is surfaced verbatim — not swallowed into a
    // generic "Create failed" toast.
    expect(screen.getByTestId('slosWizardRulerErrorBody')).toHaveTextContent(
      'invalid PromQL: parse error at char 42'
    );
    expect(apiClient.create).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic danger toast for non-ruler errors', async () => {
    const apiClient: Partial<SloApiClient> = {
      preview: jest.fn().mockResolvedValue({
        groupName: 'g',
        interval: 30,
        rules: [],
        yaml: '',
      }),
      create: jest.fn().mockRejectedValue(new Error('network down')),
    };
    // renderWizard builds its own notifications; grab the spy off the
    // NotificationsStart shape so we can assert on it afterwards.
    const addDanger = jest.fn();
    const chrome = ({ setBreadcrumbs: jest.fn() } as unknown) as Parameters<
      typeof SloWizardPage
    >[0]['chrome'];
    const notifications = ({
      toasts: {
        addSuccess: jest.fn(),
        addWarning: jest.fn(),
        addDanger,
      },
    } as unknown) as Parameters<typeof SloWizardPage>[0]['notifications'];

    render(
      <MemoryRouter initialEntries={[`/slos/create/http-availability`]}>
        <Route path="/slos/create/:templateId">
          <SloWizardPage
            apiClient={withSuggestionStubs(apiClient) as SloApiClient}
            chrome={chrome}
            notifications={notifications}
            parentBreadcrumb={{ text: 'APM', href: '#/' }}
          />
        </Route>
      </MemoryRouter>
    );
    fillMinimumRequiredFields();

    await act(async () => {
      fireEvent.click(screen.getByTestId('slosWizardSubmit'));
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    await waitFor(() => {
      expect(addDanger).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Failed to create SLO' })
      );
    });
    // Ruler error callout should NOT appear for plain Errors.
    expect(screen.queryByTestId('slosWizardRulerError')).toBeNull();
  });

  it('submits multiple objectives when the user adds rows in the wizard', async () => {
    const created = jest.fn().mockResolvedValue({
      id: 'slo-1',
      spec: { name: 'n' },
      status: {},
    });
    const apiClient: Partial<SloApiClient> = {
      preview: jest.fn().mockResolvedValue({
        groupName: 'g',
        interval: 30,
        rules: [],
        yaml: '',
      }),
      create: created,
    };
    renderWizard(apiClient);
    fillMinimumRequiredFields();

    // Add a second objective + rename it. First objective keeps its default.
    fireEvent.click(screen.getByTestId('slosWizardObjectiveAdd'));
    fireEvent.change(screen.getByTestId('slosWizardObjectiveName-1'), {
      target: { value: 'availability-99-0' },
    });
    fireEvent.change(screen.getByTestId('slosWizardObjectiveTarget-1'), {
      target: { value: '99.0' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('slosWizardSubmit'));
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    const submitted = created.mock.calls[0][0];
    expect(submitted.spec.objectives).toHaveLength(2);
    expect(submitted.spec.objectives[1].name).toBe('availability-99-0');
    expect(submitted.spec.objectives[1].target).toBeCloseTo(0.99, 5);
  });

  it('shows the custom PromQL editor only on the custom template and carries customExpr into submit', async () => {
    const created = jest.fn().mockResolvedValue({
      id: 'slo-1',
      spec: { name: 'n' },
      status: {},
    });
    const apiClient: Partial<SloApiClient> = {
      preview: jest.fn().mockResolvedValue({
        groupName: 'g',
        interval: 30,
        rules: [],
        yaml: '',
      }),
      create: created,
    };

    // Non-custom template: editor should not be present.
    const { unmount } = renderWizard(apiClient, 'http-availability');
    expect(screen.queryByTestId('slosWizardCustomPromql')).toBeNull();
    unmount();

    renderWizard(apiClient, 'custom');
    expect(screen.getByTestId('slosWizardCustomPromql')).toBeInTheDocument();
    fillMinimumRequiredFields();
    // Dimension is optional for custom but required when names/values are given —
    // the min-fields helper seeds it, which is fine.

    // Ratio mode: each metric is a picker. Selecting metric `good`/`total`
    // serializes to `sum(rate(<metric>[5m]))` implicitly.
    const pickMetric = (pickerTestSubj: string, metric: string) => {
      const picker = screen.getByTestId(pickerTestSubj);
      const input = within(picker).getByTestId('comboBoxSearchInput');
      fireEvent.change(input, { target: { value: metric } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    };
    pickMetric('slosWizardCustomPromqlGoodPicker', 'good');
    pickMetric('slosWizardCustomPromqlTotalPicker', 'total');

    await act(async () => {
      fireEvent.click(screen.getByTestId('slosWizardSubmit'));
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    const submitted = created.mock.calls[0][0];
    expect(submitted.spec.sli.definition.type).toBe('custom');
    expect(submitted.spec.sli.definition.customExpr).toEqual({
      mode: 'events',
      goodQuery: 'sum(rate(good[5m]))',
      totalQuery: 'sum(rate(total[5m]))',
    });
  });

  // #S12 — per-field validator errors on labels/annotations must surface
  // inline next to the offending row, not just as a generic toast.
  it('surfaces a per-label validator error inline on the offending row', async () => {
    const apiClient: Partial<SloApiClient> = {
      preview: jest.fn().mockResolvedValue({
        groupName: 'g',
        interval: 30,
        rules: [],
        yaml: '',
      }),
      create: jest.fn(),
    };
    renderWizard(apiClient);
    fillMinimumRequiredFields();
    fireEvent.click(screen.getByTestId('slosWizardLabelAdd'));
    fireEvent.change(screen.getByTestId('slosWizardLabelKey-0'), {
      target: { value: 'env' },
    });
    fireEvent.change(screen.getByTestId('slosWizardLabelValue-0'), {
      target: { value: '550e8400-e29b-41d4-a716-446655440000' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('slosWizardSubmit'));
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    const row = screen.getByTestId('slosWizardLabelRow-0').closest('.euiFormRow')!;
    await waitFor(() => {
      expect(row.textContent).toMatch(/Label values must not be UUIDs/);
    });
    // The generic submit was gated — apiClient.create must not have fired.
    expect(apiClient.create).not.toHaveBeenCalled();
  });

  it('surfaces the annotation size-cap validator error inline on the Annotations row', async () => {
    const apiClient: Partial<SloApiClient> = {
      preview: jest.fn().mockResolvedValue({
        groupName: 'g',
        interval: 30,
        rules: [],
        yaml: '',
      }),
      create: jest.fn(),
    };
    renderWizard(apiClient);
    fillMinimumRequiredFields();
    fireEvent.click(screen.getByTestId('slosWizardAnnotationAdd'));
    fireEvent.change(screen.getByTestId('slosWizardAnnotationKey-0'), {
      target: { value: 'runbook' },
    });
    // 4 KiB cap — 5 KiB of x's trips the validator.
    fireEvent.change(screen.getByTestId('slosWizardAnnotationValue-0'), {
      target: { value: 'x'.repeat(5120) },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('slosWizardSubmit'));
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    const annotationsRow = screen.getByTestId('slosWizardAnnotationsRow');
    await waitFor(() => {
      expect(annotationsRow.textContent).toMatch(/Annotations exceed/);
    });
    expect(apiClient.create).not.toHaveBeenCalled();
  });
});
