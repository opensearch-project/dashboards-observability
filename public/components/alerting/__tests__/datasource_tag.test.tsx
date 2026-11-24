/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { DatasourceTag, datasourceTagParts } from '../datasource_tag';
import type { Datasource } from '../../../../common/types/alerting';

const ds = (d: Partial<Datasource> & Pick<Datasource, 'id' | 'name' | 'type'>): Datasource => ({
  url: '',
  enabled: true,
  ...d,
});

describe('datasourceTagParts', () => {
  it('names an OpenSearch cluster with no second line', () => {
    expect(
      datasourceTagParts({
        ds: ds({ id: 'os-1', name: 'Local Cluster', type: 'opensearch' }),
        datasourceType: 'opensearch',
      })
    ).toEqual({ label: 'Local Cluster', detail: undefined, title: 'OpenSearch' });
  });

  it('names a Prometheus workspace with its region below', () => {
    expect(
      datasourceTagParts({
        ds: ds({ id: 'p-1', name: 'prod-amp', type: 'prometheus', region: 'us-west-2' }),
        datasourceType: 'prometheus',
      })
    ).toEqual({ label: 'prod-amp', detail: 'us-west-2', title: 'Prometheus' });
  });

  it('reads the own CloudWatch account as the filter does, with the region below', () => {
    expect(
      datasourceTagParts({
        ds: ds({
          id: 'cloudwatch',
          name: 'CloudWatch',
          type: 'cloudwatch',
          region: 'us-east-1',
          accountId: '111111111111',
        }),
        cloudWatch: { region: 'us-west-2' },
        datasourceType: 'cloudwatch',
      })
    ).toEqual({
      label: 'This account (111111111111)',
      detail: 'us-west-2',
      title: 'CloudWatch · account 111111111111',
    });
  });

  it('marks a cross-account CloudWatch scope "Cross-account · <region>"', () => {
    expect(
      datasourceTagParts({
        ds: ds({
          id: 'cloudwatch_us-east-1_prod',
          name: 'CloudWatch · Prod · us-east-1',
          type: 'cloudwatch',
          region: 'us-east-1',
          cloudWatchScope: 'prod',
          cloudWatchScopeLabel: 'Prod',
        }),
        cloudWatch: { accountId: '444455556666', region: 'us-east-1' },
        datasourceType: 'cloudwatch',
      })
    ).toEqual({
      label: 'Prod',
      detail: 'Cross-account · us-east-1',
      title: 'CloudWatch · account 444455556666',
    });
  });

  it('falls back to the account id, then the type, when the datasource is gone', () => {
    expect(
      datasourceTagParts({
        cloudWatch: { accountId: '444455556666', region: 'eu-west-1' },
        datasourceType: 'cloudwatch',
      })
    ).toEqual({
      label: '444455556666',
      detail: 'eu-west-1',
      title: 'CloudWatch · account 444455556666',
    });
    expect(datasourceTagParts({ datasourceType: 'opensearch' }).label).toBe('OpenSearch');
  });
});

describe('DatasourceTag', () => {
  it('renders an outlined tag and a subdued region line', () => {
    render(
      <DatasourceTag
        ds={ds({ id: 'p-1', name: 'prod-amp', type: 'prometheus', region: 'us-west-2' })}
        datasourceType="prometheus"
      />
    );
    const tag = screen.getByTestId('datasourceTag');
    expect(tag.querySelector('.euiBadge--hollow')).toHaveTextContent('prod-amp');
    expect(screen.getByTestId('datasourceTag-detail')).toHaveTextContent('us-west-2');
    expect(tag).toHaveAttribute('data-title', 'Prometheus');
  });

  it('renders no second line for OpenSearch', () => {
    render(
      <DatasourceTag
        ds={ds({ id: 'os-1', name: 'Local', type: 'opensearch' })}
        datasourceType="opensearch"
      />
    );
    expect(screen.queryByTestId('datasourceTag-detail')).toBeNull();
  });
});
