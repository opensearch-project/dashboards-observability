/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SloAdoptionPage } from '../slo_adoption_page';
import type { SloApiClient } from '../../slo_api_client';

function makeApiClient(
  overrides: Partial<jest.Mocked<SloApiClient>> = {}
): jest.Mocked<SloApiClient> {
  return ({
    listOrphans: jest.fn().mockResolvedValue({ candidates: [], unknowns: [] }),
    recoverSlo: jest.fn(),
    ...overrides,
  } as unknown) as jest.Mocked<SloApiClient>;
}

function renderPage(
  apiClient: jest.Mocked<SloApiClient>,
  initialSearch = ''
): { chrome: { setBreadcrumbs: jest.Mock } } {
  const chrome = { setBreadcrumbs: jest.fn() };
  const notifications = {
    toasts: {
      addSuccess: jest.fn(),
      addDanger: jest.fn(),
      addWarning: jest.fn(),
    },
  };
  const http = { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() };
  render(
    <MemoryRouter initialEntries={[`/slos/adoption${initialSearch}`]}>
      <SloAdoptionPage
        apiClient={apiClient}
        http={(http as unknown) as Parameters<typeof SloAdoptionPage>[0]['http']}
        chrome={(chrome as unknown) as Parameters<typeof SloAdoptionPage>[0]['chrome']}
        notifications={
          (notifications as unknown) as Parameters<typeof SloAdoptionPage>[0]['notifications']
        }
        parentBreadcrumb={{ text: 'APM', href: '#/' }}
      />
    </MemoryRouter>
  );
  return { chrome };
}

describe('SloAdoptionPage — feature-flag gate', () => {
  it('renders the disabled prompt when listOrphans returns a 412-shaped error', async () => {
    const listOrphans = jest.fn().mockRejectedValue({
      response: { status: 412 },
      body: {
        message: 'Feature disabled',
        attributes: {
          error: 'PRECONDITION_FAILED',
          message: 'Feature disabled',
          missingFlags: ['ruleDedup', 'ruleAdoption'],
        },
      },
    });
    await act(async () => {
      renderPage(makeApiClient({ listOrphans }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('sloAdoption-page-disabledPrompt')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('sloAdoption-recoverTab')).not.toBeInTheDocument();
  });

  it('renders an error callout for non-412 errors', async () => {
    const listOrphans = jest.fn().mockRejectedValue({ body: { message: 'kaboom' } });
    await act(async () => {
      renderPage(makeApiClient({ listOrphans }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('sloAdoption-page-error')).toBeInTheDocument();
    });
    expect(screen.getByText('kaboom')).toBeInTheDocument();
  });

  it('renders the Recover tab on 200', async () => {
    const listOrphans = jest.fn().mockResolvedValue({ candidates: [], unknowns: [] });
    await act(async () => {
      renderPage(makeApiClient({ listOrphans }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('sloAdoption-recoverTab')).toBeInTheDocument();
    });
  });

  it('shows the loading state before the gate resolves', async () => {
    let resolver: ((val: { candidates: []; unknowns: [] }) => void) | undefined;
    const listOrphans = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        })
    );
    renderPage(makeApiClient({ listOrphans }));
    expect(screen.getByTestId('sloAdoption-page-loading')).toBeInTheDocument();
    await act(async () => {
      resolver?.({ candidates: [], unknowns: [] });
    });
    await waitFor(() => {
      expect(screen.getByTestId('sloAdoption-recoverTab')).toBeInTheDocument();
    });
  });
});
