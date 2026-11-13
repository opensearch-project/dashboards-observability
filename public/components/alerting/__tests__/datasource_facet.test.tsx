/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { CloudWatchTargets, Datasource } from '../../../../common/types/alerting';
import { cloudWatchDatasourcesFor } from '../../../../common/services/alerting/cloudwatch_datasource_id';
let mockCloudWatchIconType = 'logoAWS';
jest.mock('../cloudwatch_icon', () => ({
  ...jest.requireActual('../cloudwatch_icon'),
  useCloudWatchIconType: () => mockCloudWatchIconType,
}));
import {
  DatasourceFacet,
  DatasourceFacetProps,
  buildDatasourceFacetEntries,
  datasourceEntryLabel,
  toggleDatasourceEntry,
} from '../datasource_facet';

const targets: CloudWatchTargets = {
  regions: [
    { id: 'us-west-2', name: 'US West (Oregon)' },
    { id: 'us-east-1', name: 'US East (N. Virginia)' },
    { id: 'eu-west-1', name: 'Europe (Ireland)' },
  ],
  defaultRegion: 'us-west-2',
  scopes: [
    { label: 'Your AWS permissions', relation: 'own', accountId: '111122223333' },
    { id: 'prod', label: 'Prod account', relation: 'other', accountId: '444455556666' },
    { id: 'partner', label: 'Partner (read-only)', relation: 'other' },
  ],
};

const os: Datasource = {
  id: 'os-1',
  name: 'Local Cluster',
  type: 'opensearch',
  url: '',
  enabled: true,
};
const promProd: Datasource = {
  id: 'prom-1',
  name: 'prod-amp-workspace',
  type: 'prometheus',
  url: '',
  enabled: true,
};
const promStaging: Datasource = { ...promProd, id: 'prom-2', name: 'staging-amp-workspace' };

const regionsSelected = ['us-west-2', 'us-east-1'];
const datasources = [
  promStaging,
  os,
  promProd,
  ...cloudWatchDatasourcesFor(targets, regionsSelected),
];

const renderFacet = (props: Partial<DatasourceFacetProps> = {}) => {
  const onChange = jest.fn();
  const onCapReached = jest.fn();
  const onRegionsChange = jest.fn();
  const onPairCapReached = jest.fn();
  const utils = render(
    <DatasourceFacet
      datasources={datasources}
      selectedDsIds={['os-1']}
      onChange={onChange}
      maxDatasources={5}
      onCapReached={onCapReached}
      cloudWatch={{
        regions: targets.regions,
        selectedRegions: regionsSelected,
        onRegionsChange,
        onPairCapReached,
      }}
      isCollapsed={false}
      onToggleCollapse={jest.fn()}
      {...props}
    />
  );
  return { ...utils, onChange, onCapReached, onRegionsChange, onPairCapReached };
};

describe('buildDatasourceFacetEntries', () => {
  it('groups OpenSearch, Prometheus (by name) and one entry per CloudWatch account', () => {
    expect(buildDatasourceFacetEntries(datasources).map((e) => [e.type, e.label])).toEqual([
      ['opensearch', 'Local Cluster'],
      ['prometheus', 'prod-amp-workspace'],
      ['prometheus', 'staging-amp-workspace'],
      ['cloudwatch', 'Your AWS permissions'],
      ['cloudwatch', 'Prod account'],
      ['cloudwatch', 'Partner (read-only)'],
    ]);
  });
});

describe('datasourceEntryLabel', () => {
  const cw = (over: Partial<Datasource>): Datasource => ({
    id: 'cloudwatch',
    name: 'CloudWatch',
    type: 'cloudwatch',
    url: 'cloudwatch',
    enabled: true,
    ...over,
  });
  it("labels the caller's own account without a label of its own as this account", () => {
    expect(
      datasourceEntryLabel(cw({ cloudWatchScopeLabel: 'CloudWatch', accountId: '111111111111' }))
    ).toBe('This account (111111111111)');
    expect(datasourceEntryLabel(cw({}))).toBe('This account');
  });
  it('keeps the labels the source gives', () => {
    expect(datasourceEntryLabel(cw({ cloudWatchScopeLabel: 'Main', accountId: '1' }))).toBe('Main');
    expect(
      datasourceEntryLabel(
        cw({ id: 'cloudwatch_us-east-1_s1', cloudWatchScope: 's1', cloudWatchScopeLabel: 'Prod' })
      )
    ).toBe('Prod');
    expect(
      datasourceEntryLabel({
        id: 'os-1',
        name: 'Local',
        type: 'opensearch',
        url: '',
        enabled: true,
      })
    ).toBe('Local');
  });
});

describe('toggleDatasourceEntry', () => {
  const entries = buildDatasourceFacetEntries(datasources);
  const prod = entries.find((e) => e.label === 'Prod account')!;

  it('checks an account in every selected region and unchecks all of them', () => {
    const on = toggleDatasourceEntry(prod, ['os-1'], 5);
    expect(on.selectedDsIds).toEqual([
      'os-1',
      'cloudwatch_us-west-2_prod',
      'cloudwatch_us-east-1_prod',
    ]);
    expect(toggleDatasourceEntry(prod, on.selectedDsIds, 5).selectedDsIds).toEqual(['os-1']);
  });

  it('counts accounts, not account x region, toward the cap', () => {
    const cw = entries.filter((e) => e.type === 'cloudwatch');
    let ids = ['os-1', 'prom-1'];
    for (const e of cw) ids = toggleDatasourceEntry(e, ids, 5).selectedDsIds;
    // 2 sources + 3 accounts (6 pairs) = 5.
    expect(ids).toHaveLength(8);
    const extra = toggleDatasourceEntry(
      entries.find((e) => e.label === 'staging-amp-workspace')!,
      ids,
      5
    );
    expect(extra).toEqual({ selectedDsIds: ids, capReached: true, pairCapReached: false });
  });
});

describe('DatasourceFacet', () => {
  it('renders a header with the type icon per group and account labels without regions', () => {
    renderFacet();
    for (const type of ['opensearch', 'prometheus', 'cloudwatch']) {
      expect(screen.getByTestId(`datasourceFacet-groupIcon-${type}`)).toBeInTheDocument();
    }
    const cw = within(screen.getByTestId('datasourceFacet-group-cloudwatch'));
    expect(cw.getByText('CloudWatch')).toBeInTheDocument();
    expect(cw.getByText('Prod account')).toBeInTheDocument();
    expect(cw.getByText('Partner (read-only)')).toBeInTheDocument();
    expect(cw.queryByText(/us-west-2/)).toBeNull();
  });
  it("heads the CloudWatch group with core's CloudWatch logo, and the AWS logo as fallback", () => {
    mockCloudWatchIconType = '/plugins/workspace/assets/cloudwatch_logo.svg';
    const { unmount } = renderFacet();
    const icon = screen.getByTestId('datasourceFacet-groupIcon-cloudwatch');
    expect(icon.tagName).toBe('IMG');
    expect(icon).toHaveAttribute('src', '/plugins/workspace/assets/cloudwatch_logo.svg');
    expect(screen.getByTestId('datasourceFacet-groupIcon-prometheus').tagName).not.toBe('IMG');
    unmount();
    mockCloudWatchIconType = 'logoAWS';
    renderFacet();
    expect(screen.getByTestId('datasourceFacet-groupIcon-cloudwatch').tagName).not.toBe('IMG');
  });

  it('shows the Regions control only once a CloudWatch account is checked', () => {
    const { rerender, onChange } = renderFacet();
    expect(screen.queryByTestId('cloudWatchRegionControl')).toBeNull();
    fireEvent.click(screen.getByLabelText('Prod account'));
    expect(onChange).toHaveBeenCalledWith([
      'os-1',
      'cloudwatch_us-west-2_prod',
      'cloudwatch_us-east-1_prod',
    ]);
    rerender(
      <DatasourceFacet
        datasources={datasources}
        selectedDsIds={['os-1', 'cloudwatch_us-west-2_prod', 'cloudwatch_us-east-1_prod']}
        onChange={onChange}
        maxDatasources={5}
        onCapReached={jest.fn()}
        cloudWatch={{
          regions: targets.regions,
          selectedRegions: regionsSelected,
          onRegionsChange: jest.fn(),
          onPairCapReached: jest.fn(),
        }}
        isCollapsed={false}
        onToggleCollapse={jest.fn()}
      />
    );
    const controls = screen.getAllByTestId('cloudWatchRegionControl');
    expect(controls).toHaveLength(1);
    const cw = within(screen.getByTestId('datasourceFacet-group-cloudwatch'));
    expect(cw.getByText('Regions')).toBeInTheDocument();
    expect(cw.getByText('US West (Oregon)')).toBeInTheDocument();
    expect(cw.getByText('US East (N. Virginia)')).toBeInTheDocument();
  });

  it('reports a removed region chip, but never an empty region list', () => {
    const { onRegionsChange } = renderFacet({
      selectedDsIds: ['cloudwatch_us-west-2_prod', 'cloudwatch_us-east-1_prod'],
    });
    const control = screen.getByTestId('cloudWatchRegionControl');
    fireEvent.click(
      within(control).getByLabelText('Remove US East (N. Virginia) from selection in this group')
    );
    expect(onRegionsChange).toHaveBeenLastCalledWith(['us-west-2']);
    onRegionsChange.mockClear();
    const { container } = renderFacet({
      selectedDsIds: ['cloudwatch_us-west-2_prod'],
      cloudWatch: {
        regions: targets.regions,
        selectedRegions: ['us-west-2'],
        onRegionsChange,
        onPairCapReached: jest.fn(),
      },
    });
    const single = within(container).getByTestId('cloudWatchRegionControl');
    fireEvent.click(
      within(single).getByLabelText('Remove US West (Oregon) from selection in this group')
    );
    expect(onRegionsChange).not.toHaveBeenCalled();
  });

  it('shows no Regions control with one region, and a single CloudWatch entry without targets', () => {
    renderFacet({
      selectedDsIds: ['cloudwatch'],
      datasources: [
        os,
        {
          id: 'cloudwatch',
          name: 'CloudWatch',
          type: 'cloudwatch',
          url: 'cloudwatch',
          enabled: true,
        },
      ],
      cloudWatch: undefined,
    });
    const cw = within(screen.getByTestId('datasourceFacet-group-cloudwatch'));
    // The group header, and the one entry for the caller's own account.
    expect(cw.getAllByText('CloudWatch')).toHaveLength(1);
    expect(cw.getByText('This account')).toBeInTheDocument();
    expect(screen.queryByTestId('cloudWatchRegionControl')).toBeNull();
  });

  it('fires the cap callback instead of selecting past the cap', () => {
    const { onChange, onCapReached } = renderFacet({ maxDatasources: 1 });
    fireEvent.click(screen.getByLabelText('Prod account'));
    expect(onCapReached).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("joins a CloudWatch account's region errors", () => {
    renderFacet({
      errorMap: {
        'CloudWatch · Prod account · us-east-1': 'AccessDenied',
        'CloudWatch · Prod account · us-west-2': 'Timed out',
      },
    });
    fireEvent.click(screen.getByTestId('facetGroup-datasource-error-Prod account'));
    const popover = screen.getByTestId('facetGroup-datasource-error-Prod account-popover');
    expect(popover.textContent).toContain('us-west-2: Timed out');
    expect(popover.textContent).toContain('us-east-1: AccessDenied');
  });
  describe('per-group limit', () => {
    const many: Datasource[] = Array.from({ length: 8 }, (_, i) => ({
      ...os,
      id: `os-${i}`,
      name: `cluster-${i}`,
    }));
    const osNames = () =>
      within(screen.getByTestId('datasourceFacet-group-opensearch'))
        .getAllByRole('checkbox')
        .map((c) => (c.closest('.altFacetCheckboxRow') as HTMLElement).textContent);
    it('shows 5 entries per group with a toggle for the rest', () => {
      renderFacet({ datasources: [...many, promProd], selectedDsIds: [] });
      expect(osNames()).toHaveLength(5);
      const toggle = screen.getByTestId('datasourceFacet-group-opensearch-showMore');
      expect(toggle).toHaveTextContent('+3 more');
      // The Prometheus group has one entry, so no toggle.
      expect(screen.queryByTestId('datasourceFacet-group-prometheus-showMore')).toBeNull();
      fireEvent.click(toggle);
      expect(osNames()).toHaveLength(8);
      expect(toggle).toHaveTextContent('Show less');
    });
    it('puts checked entries first within the group', () => {
      renderFacet({ datasources: many, selectedDsIds: ['os-6', 'os-7'] });
      expect(osNames()).toEqual(['cluster-6', 'cluster-7', 'cluster-0', 'cluster-1', 'cluster-2']);
    });
    it('shows every match while searching', () => {
      renderFacet({ datasources: many, selectedDsIds: [] });
      fireEvent.change(screen.getByTestId('facetGroup-datasource-search'), {
        target: { value: 'cluster' },
      });
      expect(osNames()).toHaveLength(8);
      expect(screen.queryByTestId('datasourceFacet-group-opensearch-showMore')).toBeNull();
    });
  });
  it('uses a test subject without special characters for an entry', () => {
    renderFacet();
    expect(screen.getByTestId('datasourceFacet-entry-ds-os-1')).toBeInTheDocument();
    expect(screen.getByTestId('datasourceFacet-entry-cw-prod')).toBeInTheDocument();
  });
  it('shows a loading state in the CloudWatch group while its accounts load', () => {
    renderFacet({
      datasources: [os],
      cloudWatch: {
        regions: [],
        selectedRegions: [],
        onRegionsChange: jest.fn(),
        onPairCapReached: jest.fn(),
        loading: true,
      },
    });
    const cw = within(screen.getByTestId('datasourceFacet-group-cloudwatch'));
    expect(cw.getByTestId('datasourceFacet-cloudwatch-loading')).toHaveTextContent(
      'Loading accounts'
    );
  });
  it('offers a retry in the CloudWatch group when its accounts could not be read', () => {
    const onRetry = jest.fn();
    renderFacet({
      datasources: [os],
      cloudWatch: {
        regions: [],
        selectedRegions: [],
        onRegionsChange: jest.fn(),
        onPairCapReached: jest.fn(),
        failed: true,
        onRetry,
      },
    });
    const cw = within(screen.getByTestId('datasourceFacet-group-cloudwatch'));
    expect(cw.getByTestId('datasourceFacet-cloudwatch-error')).toHaveTextContent(
      "Couldn't load accounts"
    );
    fireEvent.click(cw.getByTestId('datasourceFacet-cloudwatch-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
