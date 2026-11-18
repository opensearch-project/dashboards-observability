/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';

const registered: Record<string, { meta?: { requiresExplicitRun?: boolean } }> = {
  PROMETHEUS: {},
  INDEXES: {},
  EXPLICIT_TYPE: { meta: { requiresExplicitRun: true } },
};
jest.mock('../../../../framework/core_refs', () => ({
  coreRefs: {
    application: {
      capabilities: { observability: { exploreLinksEnabled: true } },
      navigateToApp: jest.fn(),
      getUrlForApp: jest.fn((appId: string, { path }: { path: string }) => `/app/${appId}${path}`),
    },
    data: {
      query: {
        queryString: {
          getDatasetService: () => ({ getType: (t: string) => registered[t] }),
        },
      },
    },
  },
}));

import { coreRefs } from '../../../../framework/core_refs';
import { ExploreLinkButtons, openableExploreTargets } from '../explore_link_buttons';
import type { ExploreQueryTarget } from '../../../../../common/types/explore_links';

const caps = coreRefs.application!.capabilities as any;
const navigateToApp = coreRefs.application!.navigateToApp as jest.Mock;
const range = { from: 'now-1h', to: 'now' };
const prom: ExploreQueryTarget = {
  signal: 'metrics',
  dataset: { id: 'my-prom', type: 'PROMETHEUS' },
  language: 'PROMQL',
  query: 'up',
};

describe('ExploreLinkButtons', () => {
  beforeEach(() => {
    caps.observability.exploreLinksEnabled = true;
    navigateToApp.mockClear();
  });

  it('renders nothing when Explore links are off', () => {
    caps.observability.exploreLinksEnabled = false;
    const { container } = render(<ExploreLinkButtons targets={[prom]} timeRange={range} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing without targets', () => {
    const { container } = render(<ExploreLinkButtons targets={undefined} timeRange={range} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hides a target whose dataset type is not registered in this browser', () => {
    const other = { ...prom, dataset: { id: 'x', type: 'NOT_REGISTERED' } };
    expect(openableExploreTargets([prom, other])).toEqual([prom]);
    const { container } = render(<ExploreLinkButtons targets={[other]} timeRange={range} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links to Explore with an href and navigates in-app on click', () => {
    const onNavigate = jest.fn();
    const { getByTestId } = render(
      <ExploreLinkButtons targets={[prom]} timeRange={range} onNavigate={onNavigate} />
    );
    const button = getByTestId('exploreLinkButtons-0');
    expect(button).toHaveTextContent('Open in Metrics');
    expect(button.getAttribute('href')).toMatch(/^\/app\/explore\/metrics#\/\?_g=/);
    fireEvent.click(button);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(navigateToApp).toHaveBeenCalledWith(
      'explore/metrics',
      expect.objectContaining({ path: expect.stringMatching(/^#\/\?_g=/) })
    );
  });

  it('leaves a modified click to the browser (open in a new tab)', () => {
    const { getByTestId } = render(<ExploreLinkButtons targets={[prom]} timeRange={range} />);
    fireEvent.click(getByTestId('exploreLinkButtons-0'), { ctrlKey: true });
    expect(navigateToApp).not.toHaveBeenCalled();
  });

  it('names each target when there is more than one', () => {
    const { getByTestId } = render(
      <ExploreLinkButtons
        targets={[
          { ...prom, label: 'a_5m' },
          { ...prom, label: 'a_1h' },
        ]}
        timeRange={range}
      />
    );
    expect(getByTestId('exploreLinkButtons-0')).toHaveTextContent('Open in Metrics: a_5m');
    expect(getByTestId('exploreLinkButtons-1')).toHaveTextContent('Open in Metrics: a_1h');
  });

  it('labels logs targets "Open in Logs"', () => {
    const logs: ExploreQueryTarget = {
      signal: 'logs',
      dataset: { id: '::logs', type: 'INDEXES', timeFieldName: '@timestamp' },
      language: 'PPL',
      query: '',
    };
    const { getByTestId } = render(<ExploreLinkButtons targets={[logs]} timeRange={range} />);
    expect(getByTestId('exploreLinkButtons-0')).toHaveTextContent('Open in Logs');
  });
});
