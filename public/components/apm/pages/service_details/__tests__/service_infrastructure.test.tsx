/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ServiceInfrastructure as InfraState } from '../../../shared/hooks/use_service_infrastructure';

const mockLineChart = jest.fn();
jest.mock('../../../shared/components/promql_line_chart', () => ({
  PromQLLineChart: (props: any) => {
    mockLineChart(props);
    return <div data-test-subj={`chart-${props.title}`}>{props.header}</div>;
  },
}));

const mockNavigateToExploreMetrics = jest.fn();
jest.mock('../../../shared/utils/navigation_utils', () => ({
  navigateToExploreMetrics: (...args: unknown[]) => mockNavigateToExploreMetrics(...args),
}));

let mockState: InfraState;
jest.mock('../../../shared/hooks/use_service_infrastructure', () => ({
  useServiceInfrastructure: () => mockState,
}));

import { ServiceInfrastructure } from '../service_infrastructure';
import { getSetupStatuses } from '../service_infrastructure_setup';

const base: InfraState = {
  isLoading: false,
  error: null,
  platform: 'none',
  scopes: [],
  namespaceOnly: false,
  hostIds: [],
  mappedKeys: [],
  keySource: null,
  detectionEnabled: false,
  labelStyle: null,
  pods: [],
  nodes: [],
  missingMetrics: [],
  otherMetrics: [],
};

const props = {
  serviceName: 'pricing',
  environment: 'prod',
  timeRange: { from: 'now-15m', to: 'now' },
  prometheusConnectionId: 'prom',
};

const chartTitles = () => mockLineChart.mock.calls.map(([p]) => p.title);

// Cards mount their chart once scrolled into view; report every card as visible.
class VisibleObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe() {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }
  disconnect() {}
  unobserve() {}
}
beforeAll(() => {
  (window as any).IntersectionObserver = VisibleObserver;
});

describe('ServiceInfrastructure', () => {
  beforeEach(() => {
    mockLineChart.mockClear();
  });

  it('shows a spinner while the keys load', () => {
    mockState = { ...base, isLoading: true };
    const { container } = render(<ServiceInfrastructure {...props} />);
    expect(container.querySelector('.euiLoadingSpinner')).toBeInTheDocument();
  });

  it('shows the error', () => {
    mockState = { ...base, error: new Error('PPL failed') };
    render(<ServiceInfrastructure {...props} />);
    expect(screen.getByTestId('serviceInfrastructureError')).toHaveTextContent('PPL failed');
  });

  it('shows the setup diagram, failing at the spans, when the service has no platform keys', () => {
    mockState = { ...base, detectionEnabled: true, mappedKeys: ['k8s.namespace.name'] };
    render(<ServiceInfrastructure {...props} />);
    expect(screen.getByTestId('serviceInfrastructureEmpty')).toHaveTextContent(
      'Infrastructure is not instrumented for this service'
    );
    expect(screen.getByTestId('setupNodeTraces')).toHaveAttribute('data-status', 'missing');
    expect(screen.getByTestId('setupNodeDataPrepper')).toHaveAttribute('data-status', 'pending');
    expect(screen.getByTestId('setupNodeMetrics')).toHaveAttribute('data-status', 'pending');
    expect(screen.getByTestId('setupFixSpans')).toHaveTextContent('k8s.namespace.name');
    expect(screen.queryByTestId('setupFixMetrics')).not.toBeInTheDocument();
    expect(mockLineChart).not.toHaveBeenCalled();
  });

  it('explains missing metrics when the keys are known but no series match', () => {
    mockState = {
      ...base,
      platform: 'eks',
      scopes: [{ namespace: 'retail', kind: 'deployment', workload: 'pricing' }],
      keySource: 'serviceMap',
    };
    render(<ServiceInfrastructure {...props} />);
    expect(screen.getByTestId('serviceInfrastructureEmpty')).toHaveTextContent(
      'No infrastructure metrics found for this service'
    );
    expect(screen.getByTestId('setupNodeTraces')).toHaveAttribute('data-status', 'ok');
    expect(screen.getByTestId('setupNodeMetrics')).toHaveAttribute('data-status', 'missing');
    // Kubernetes only: the fix names the Kubernetes receivers, not hostmetrics.
    expect(screen.getByTestId('setupFixMetrics')).toHaveTextContent('kubeletstats');
    expect(screen.getByTestId('setupFixMetrics')).not.toHaveTextContent('hostmetrics');
  });

  it('renders the Kubernetes view: platform, scope, pods and charts', () => {
    mockState = {
      ...base,
      platform: 'eks',
      keySource: 'serviceMap',
      labelStyle: 'plain',
      scopes: [{ cluster: 'prod-1', namespace: 'retail', kind: 'deployment', workload: 'pricing' }],
      pods: [
        {
          cluster: 'prod-1',
          namespace: 'retail',
          pod: 'pricing-a',
          node: 'node-1',
          cpu: 0.05,
          cpuLimit: 0.2,
          memory: 50 * 1024 * 1024,
          memoryLimit: 200 * 1024 * 1024,
          restarts: 2,
          phase: 2,
        },
      ],
      nodes: ['node-1'],
    };
    render(<ServiceInfrastructure {...props} />);

    expect(screen.getByTestId('serviceInfrastructurePlatform')).toHaveTextContent('Amazon EKS');
    expect(screen.getByTestId('serviceInfrastructureCluster')).toHaveTextContent('Cluster: prod-1');
    expect(screen.getByTestId('serviceInfrastructureNamespace')).toHaveTextContent(
      'Namespace: retail'
    );
    expect(screen.getByTestId('serviceInfrastructureWorkload')).toHaveTextContent(
      'Deployment: pricing'
    );
    const table = screen.getByTestId('serviceInfrastructurePods');
    expect(table).toHaveTextContent('pricing-a');
    expect(table).toHaveTextContent('Running');
    expect(table).toHaveTextContent('50m 25%');
    expect(table).toHaveTextContent('50.0 MiB 25%');
    // One grid, must-haves first, then the workload and node context.
    expect(chartTitles()).toEqual([
      'CPU usage (cores) vs limit',
      'Memory working set vs limit',
      'Container restarts',
      'Pod network',
      'Replicas ready vs desired',
      'Autoscaler replicas vs max',
      'Node CPU usage (cores)',
      'Node memory working set',
      'Nodes ready vs total',
    ]);
    const cpu = mockLineChart.mock.calls.find(([p]) => p.title === 'CPU usage (cores) vs limit')[0];
    expect(cpu.promqlQuery).toContain('k8s_deployment_name="pricing"');
    expect(cpu.labelField).toBe('k8s_pod_name');
    expect(cpu.prometheusConnectionId).toBe('prom');
    expect(cpu.showOpenInMetrics).toBe(false);
    expect(screen.getByTestId('serviceInfrastructureMetrics')).toHaveTextContent(
      'Metrics (9 of 9)'
    );
    expect(screen.getByTestId('serviceInfrastructureSummaryPods')).toHaveTextContent('1 / 1');
    expect(screen.getByTestId('serviceInfrastructureSummaryRestarts')).toHaveTextContent('2');
    expect(screen.getByTestId('serviceInfrastructureSummaryCpu')).toHaveTextContent('25%');
    // How it was matched is in the info tip, not in tags.
    expect(screen.queryByText('Keys: service map')).not.toBeInTheDocument();
    expect(screen.queryByTestId('serviceInfrastructureEmpty')).not.toBeInTheDocument();
  });

  it('opens a chart on the Metrics page from its card title', () => {
    mockState = {
      ...base,
      platform: 'ec2',
      keySource: 'spans',
      labelStyle: 'plain',
      hostIds: ['i-1'],
    };
    render(<ServiceInfrastructure {...props} />);
    fireEvent.click(screen.getByTestId('infraChartHostCpuOpen'));
    expect(mockNavigateToExploreMetrics).toHaveBeenCalledWith(
      expect.stringContaining('host_id=~"i-1"'),
      'prom',
      props.timeRange
    );
  });

  it('shows how to collect a metric the service has no series for', () => {
    mockState = {
      ...base,
      platform: 'host',
      labelStyle: 'plain',
      hostIds: ['h1'],
      missingMetrics: ['system_cpu_load_average_1m'],
    };
    render(<ServiceInfrastructure {...props} />);
    const card = screen.getByTestId('infraChartHostLoadMissing');
    expect(card).toHaveTextContent('No system_cpu_load_average_1m series for this service');
    expect(card).toHaveTextContent('host_metrics (hostmetrics)');
    expect(card).toHaveTextContent('not collected');
    expect(chartTitles()).not.toContain('Load average (1m)');
  });

  it('hides optional charts the service has no series for', () => {
    mockState = {
      ...base,
      platform: 'host',
      labelStyle: 'plain',
      hostIds: ['h1'],
      missingMetrics: ['system_disk_io_bytes_total'],
    };
    render(<ServiceInfrastructure {...props} />);
    expect(chartTitles()).not.toContain('Disk I/O');
    expect(screen.queryByTestId('infraChartHostDiskMissing')).not.toBeInTheDocument();
    expect(screen.getByTestId('serviceInfrastructureMetrics')).toHaveTextContent(
      'Metrics (6 of 6)'
    );
  });

  it('charts every other collected metric after the curated ones', () => {
    mockState = {
      ...base,
      platform: 'host',
      labelStyle: 'plain',
      hostIds: ['h1'],
      otherMetrics: [
        { name: 'system_disk_operations_total', matchers: 'host_id=~"h1"', kind: 'host' },
        { name: 'system_paging_usage_bytes', matchers: 'host_id=~"h1"', kind: 'host' },
      ],
    };
    render(<ServiceInfrastructure {...props} />);
    expect(screen.getByTestId('serviceInfrastructureMetrics')).toHaveTextContent(
      'Metrics (9 of 9)'
    );
    expect(chartTitles().slice(-2)).toEqual([
      'system_disk_operations_total',
      'system_paging_usage_bytes',
    ]);
    const ops = mockLineChart.mock.calls.find(
      ([p]) => p.title === 'system_disk_operations_total'
    )[0];
    // Counters are rated, gauges averaged, per host (the Explore metrics page's defaults).
    expect(ops.promqlQuery).toBe(
      'topk(20, sum by (host_id) (rate(system_disk_operations_total{host_id=~"h1"}[2m])))'
    );
    expect(ops.labelField).toBe('host_id');
    fireEvent.change(screen.getByTestId('serviceInfrastructureSearch'), {
      target: { value: 'paging' },
    });
    expect(screen.getByTestId('serviceInfrastructureMetrics')).toHaveTextContent(
      'Metrics (1 of 1)'
    );
  });

  it('shows the first 40 charts and loads 20 more at a time', () => {
    mockState = {
      ...base,
      platform: 'host',
      labelStyle: 'plain',
      hostIds: ['h1'],
      otherMetrics: Array.from({ length: 60 }, (_, i) => ({
        name: `m_${String(i).padStart(2, '0')}`,
        matchers: 'host_id=~"h1"',
        kind: 'host' as const,
      })),
    };
    render(<ServiceInfrastructure {...props} />);
    expect(screen.getByTestId('serviceInfrastructureMetrics')).toHaveTextContent(
      'Metrics (40 of 67)'
    );
    fireEvent.click(screen.getByTestId('serviceInfrastructureLoadMore'));
    expect(screen.getByTestId('serviceInfrastructureMetrics')).toHaveTextContent(
      'Metrics (60 of 67)'
    );
    fireEvent.click(screen.getByTestId('serviceInfrastructureLoadMore'));
    expect(screen.queryByTestId('serviceInfrastructureLoadMore')).not.toBeInTheDocument();
  });

  it('switches the card grid to rows', () => {
    mockState = { ...base, platform: 'host', labelStyle: 'plain', hostIds: ['h1'] };
    const { container } = render(<ServiceInfrastructure {...props} />);
    expect(container.querySelector('.apmInfraGrid--rows')).toBeNull();
    expect(container.querySelector('.apmInfraGrid')).not.toBeNull();
    // EuiButtonGroup stamps each option's id on its radio as data-test-subj.
    fireEvent.click(screen.getByTestId('rows'));
    expect(container.querySelector('.apmInfraGrid--rows')).not.toBeNull();
  });

  it('searches by chart title or metric name', () => {
    mockState = { ...base, platform: 'host', labelStyle: 'plain', hostIds: ['h1'] };
    render(<ServiceInfrastructure {...props} />);
    expect(screen.queryByText('A-Z')).not.toBeInTheDocument();
    mockLineChart.mockClear();
    fireEvent.change(screen.getByTestId('serviceInfrastructureSearch'), {
      target: { value: 'load_average' },
    });
    expect(chartTitles()).toEqual(['Load average (1m)']);
    fireEvent.change(screen.getByTestId('serviceInfrastructureSearch'), {
      target: { value: 'nothing-matches' },
    });
    expect(screen.getByTestId('serviceInfrastructureNoCharts')).toBeInTheDocument();
  });

  it('counts only current pods and hides pods replaced during the range', () => {
    mockState = {
      ...base,
      platform: 'kubernetes',
      keySource: 'serviceMap',
      labelStyle: 'plain',
      scopes: [{ namespace: 'shop', kind: 'deployment', workload: 'catalog' }],
      pods: [
        { namespace: 'shop', pod: 'catalog-new', node: 'n1', memory: 1, phase: 2 },
        { namespace: 'shop', pod: 'catalog-old', node: 'n1', replaced: true },
      ],
      nodes: ['n1'],
    };
    render(<ServiceInfrastructure {...props} />);
    expect(screen.getByTestId('serviceInfrastructureSummaryPods')).toHaveTextContent('1 / 1');
    expect(screen.getByTestId('serviceInfrastructureSummaryPods')).toHaveTextContent(
      '1 replaced in range'
    );
    expect(screen.getByTestId('serviceInfrastructurePods')).not.toHaveTextContent('catalog-old');
    fireEvent.click(screen.getByTestId('serviceInfrastructureShowReplaced'));
    expect(screen.getByTestId('serviceInfrastructurePods')).toHaveTextContent('catalog-old');
    expect(screen.getByTestId('serviceInfrastructurePods')).toHaveTextContent('Replaced');
  });

  it('says when the data stops before the end of the range', () => {
    mockState = {
      ...base,
      platform: 'host',
      labelStyle: 'plain',
      hostIds: ['h1'],
      dataEndsAt: 1793769000,
    };
    render(<ServiceInfrastructure {...props} />);
    expect(screen.getByTestId('serviceInfrastructureDataEnds')).toHaveTextContent(
      'No infrastructure data after'
    );
  });

  it('warns when the pods are matched by namespace only', () => {
    mockState = {
      ...base,
      platform: 'kubernetes',
      keySource: 'spans',
      labelStyle: 'plain',
      namespaceOnly: true,
      scopes: [{ cluster: 'c1', namespace: 'shop', kind: 'namespace', workload: '' }],
      pods: [{ cluster: 'c1', namespace: 'shop', pod: 'any-pod', node: 'n1' }],
      nodes: ['n1'],
    };
    render(<ServiceInfrastructure {...props} />);
    expect(screen.getByTestId('serviceInfrastructureNamespaceOnly')).toHaveTextContent(
      'Matched by namespace only'
    );
    expect(screen.getByTestId('serviceInfrastructureWorkload')).toHaveTextContent(
      'Workload: all workloads'
    );
    mockLineChart.mock.calls.forEach(([p]) =>
      expect(p.promqlQuery).not.toContain('k8s_deployment_name')
    );
  });

  it('renders the host view for EC2', () => {
    mockState = {
      ...base,
      platform: 'ec2',
      keySource: 'serviceMap',
      labelStyle: 'resource',
      hostIds: ['i-1', 'i-2'],
    };
    render(<ServiceInfrastructure {...props} />);

    expect(screen.getByTestId('serviceInfrastructurePlatform')).toHaveTextContent('Amazon EC2');
    expect(screen.getByTestId('serviceInfrastructureHosts')).toHaveTextContent(
      'Host IDs: i-1, i-2'
    );
    expect(screen.queryByTestId('serviceInfrastructurePods')).not.toBeInTheDocument();
    expect(chartTitles()).toEqual([
      'CPU utilization',
      'Memory used',
      'Load average (1m)',
      'Filesystem used',
      'Network',
      'Disk I/O',
      'Network errors and drops',
    ]);
    expect(mockLineChart.mock.calls[0][0].promqlQuery).toContain('resource_host_id=~"i-1|i-2"');
  });
});

describe('getSetupStatuses', () => {
  it('marks platform detection optional when it is off and the spans carry keys', () => {
    expect(
      getSetupStatuses({ ...base, platform: 'host', keySource: 'spans', hostIds: ['h'] })
    ).toEqual({ spans: 'ok', serviceMap: 'optional', metrics: 'missing', match: 'pending' });
  });

  it('marks every step ok for a matched service', () => {
    expect(
      getSetupStatuses({
        ...base,
        platform: 'eks',
        keySource: 'serviceMap',
        labelStyle: 'resource',
        pods: [{ namespace: 'n', pod: 'p' }],
      })
    ).toEqual({ spans: 'ok', serviceMap: 'ok', metrics: 'ok', match: 'ok' });
  });

  it('flags the match when metrics exist but no pod matched', () => {
    expect(
      getSetupStatuses({ ...base, platform: 'kubernetes', keySource: 'spans', labelStyle: 'plain' })
        .match
    ).toBe('missing');
  });
});
