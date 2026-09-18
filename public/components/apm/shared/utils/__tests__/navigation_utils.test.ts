/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  navigateToServiceMap,
  navigateToExploreTraces,
  navigateToSpanDetails,
  navigateToExploreLogs,
  navigateToDatasetCorrelations,
  navigateToSloSuggest,
  navigateToExploreMetrics,
  openCorrelatedDashboard,
  openApmSettings,
} from '../navigation_utils';
import { coreRefs } from '../../../../../framework/core_refs';

// Mock coreRefs
jest.mock('../../../../../framework/core_refs', () => ({
  coreRefs: {
    http: {
      basePath: {
        prepend: jest.fn((path: string) => `/base${path}`),
      },
    },
  },
}));

describe('navigation_utils', () => {
  let windowOpenSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    windowOpenSpy = jest.spyOn(window, 'open').mockImplementation();

    // window.location is mocked globally by jest-location-mock; reset it to the
    // default test origin before each test so href assertions start clean.
    window.location.assign('http://localhost:5601/');
  });

  afterEach(() => {
    windowOpenSpy.mockRestore();
  });

  describe('navigateToServiceMap', () => {
    it('should be a placeholder function that does nothing', () => {
      // This is a TODO function - just ensure it doesn't throw
      expect(() => navigateToServiceMap('test-service', 'production')).not.toThrow();
    });
  });

  describe('navigateToExploreTraces', () => {
    const defaultParams = {
      datasetId: 'test-dataset',
      datasetTitle: 'Test Dataset',
      serviceName: 'test-service',
      timeRange: { from: 'now-1h', to: 'now' },
      dataSourceId: 'ds-123',
      dataSourceTitle: 'Test DataSource',
    };

    it('should open traces URL in new tab', () => {
      navigateToExploreTraces(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      expect(windowOpenSpy).toHaveBeenCalledTimes(1);
      expect(windowOpenSpy).toHaveBeenCalledWith(expect.any(String), '_blank');
    });

    it('should use basePath.prepend for URL construction', () => {
      navigateToExploreTraces(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      expect(coreRefs.http?.basePath.prepend).toHaveBeenCalled();
      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain('/base/app/explore/traces/');
    });

    it('should include service name in PPL query', () => {
      navigateToExploreTraces(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      // PPL query is URL encoded
      expect(url).toContain(encodeURIComponent('| where serviceName = "test-service"'));
    });

    it('should include time range in URL', () => {
      navigateToExploreTraces(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain('from:now-1h');
      expect(url).toContain('to:now');
    });

    it('rison-quotes + encodes absolute ISO timestamps in _g (colons must not break rison)', () => {
      navigateToExploreTraces(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        { from: '2026-09-18T18:11:01.655Z', to: '2026-09-18T20:00:00.000Z' },
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain(
        "time:(from:'2026-09-18T18%3A11%3A01.655Z',to:'2026-09-18T20%3A00%3A00.000Z')"
      );
    });

    it('encodes a relative-future to value so + does not decode to a space', () => {
      navigateToExploreTraces(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        { from: 'now-1h', to: 'now+1h' },
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain('to:now%2B1h');
      expect(url).not.toContain('to:now 1h');
      expect(url).not.toContain('to:now+1h');
    });

    it('should handle datasetId with existing :: prefix', () => {
      navigateToExploreTraces(
        'ds-123::existing-dataset',
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      // Should not double-prefix the datasetId
      expect(url).toContain("id:'ds-123::existing-dataset'");
      expect(url).not.toContain('::ds-123::existing-dataset');
    });

    it('should use datasetId as-is without adding prefix', () => {
      navigateToExploreTraces(
        'test-dataset',
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.timeRange,
        'ds-456',
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      // datasetId should be used as-is (already in correct format from APM config)
      expect(url).toContain("id:'test-dataset'");
    });

    it('should handle missing dataSourceTitle', () => {
      navigateToExploreTraces(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        undefined
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain("title:''");
    });
  });

  describe('navigateToSpanDetails', () => {
    const defaultParams = {
      datasetId: 'test-dataset',
      datasetTitle: 'Test Dataset',
      spanId: 'span-123',
      traceId: 'trace-456',
      dataSourceId: 'ds-123',
      dataSourceTitle: 'Test DataSource',
    };

    it('should open span details URL in new tab', () => {
      navigateToSpanDetails(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.spanId,
        defaultParams.traceId,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      expect(windowOpenSpy).toHaveBeenCalledTimes(1);
      expect(windowOpenSpy).toHaveBeenCalledWith(expect.any(String), '_blank');
    });

    it('should include spanId and traceId in URL', () => {
      navigateToSpanDetails(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.spanId,
        defaultParams.traceId,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain("spanId:'span-123'");
      expect(url).toContain("traceId:'trace-456'");
    });

    it('should use basePath.prepend for URL construction', () => {
      navigateToSpanDetails(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.spanId,
        defaultParams.traceId,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      expect(coreRefs.http?.basePath.prepend).toHaveBeenCalled();
      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain('/base/app/explore/traces/traceDetails');
    });

    it('should handle datasetId with existing :: prefix', () => {
      navigateToSpanDetails(
        'ds-123::existing-dataset',
        defaultParams.datasetTitle,
        defaultParams.spanId,
        defaultParams.traceId,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      // datasetId should be used as-is
      expect(url).toContain("id:'ds-123::existing-dataset'");
      expect(url).not.toContain('::ds-123::existing-dataset');
    });

    it('should use datasetId as-is without adding prefix', () => {
      navigateToSpanDetails(
        'test-dataset',
        defaultParams.datasetTitle,
        defaultParams.spanId,
        defaultParams.traceId,
        'ds-456',
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      // datasetId should be used as-is (no dataSourceId:: prefix added)
      expect(url).toContain("id:'test-dataset'");
      expect(url).not.toContain("id:'ds-456::test-dataset'");
    });
  });

  describe('navigateToExploreLogs', () => {
    const defaultParams = {
      datasetId: 'logs-dataset',
      datasetTitle: 'Logs Dataset',
      serviceName: 'test-service',
      serviceNameField: 'resource.attributes.service.name',
      timeRange: { from: 'now-1h', to: 'now' },
      dataSourceId: 'ds-123',
      dataSourceTitle: 'Test DataSource',
    };

    it('should open logs URL in new tab', () => {
      navigateToExploreLogs(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.serviceNameField,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      expect(windowOpenSpy).toHaveBeenCalledTimes(1);
      expect(windowOpenSpy).toHaveBeenCalledWith(expect.any(String), '_blank');
    });

    it('should use basePath.prepend for URL construction', () => {
      navigateToExploreLogs(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.serviceNameField,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      expect(coreRefs.http?.basePath.prepend).toHaveBeenCalled();
      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain('/base/app/explore/logs/');
    });

    it('should include service name filter in PPL query', () => {
      navigateToExploreLogs(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.serviceNameField,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      // PPL query uses backticks for field name and is URL encoded
      expect(url).toContain(
        encodeURIComponent('| where `resource.attributes.service.name` = "test-service"')
      );
    });

    it('should include time range in URL', () => {
      navigateToExploreLogs(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.serviceNameField,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain('from:now-1h');
      expect(url).toContain('to:now');
    });

    it('rison-quotes + encodes absolute ISO timestamps in _g', () => {
      navigateToExploreLogs(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.serviceNameField,
        { from: '2026-09-18T18:11:01.655Z', to: '2026-09-18T20:00:00.000Z' },
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain(
        "time:(from:'2026-09-18T18%3A11%3A01.655Z',to:'2026-09-18T20%3A00%3A00.000Z')"
      );
    });

    it('encodes a relative-future to value so + does not decode to a space', () => {
      navigateToExploreLogs(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.serviceNameField,
        { from: 'now-1h', to: 'now+1h' },
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain('to:now%2B1h');
      expect(url).not.toContain('to:now 1h');
    });

    it('should handle datasetId with existing :: prefix', () => {
      navigateToExploreLogs(
        'ds-123::existing-logs',
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.serviceNameField,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain("id:'ds-123::existing-logs'");
      expect(url).not.toContain('::ds-123::existing-logs');
    });
  });

  describe('navigateToDatasetCorrelations', () => {
    it('should navigate in same tab using window.location.href', () => {
      navigateToDatasetCorrelations('test-dataset');

      expect(window.location.href).toContain('/base/app/datasets/patterns/');
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });

    it('should use basePath.prepend for URL construction', () => {
      navigateToDatasetCorrelations('test-dataset');

      expect(coreRefs.http?.basePath.prepend).toHaveBeenCalled();
    });

    it('should encode datasetId in URL', () => {
      navigateToDatasetCorrelations('ds-123::test-dataset');

      expect(window.location.href).toContain(encodeURIComponent('ds-123::test-dataset'));
    });

    it('should navigate to correlatedDatasets tab', () => {
      navigateToDatasetCorrelations('test-dataset');

      expect(window.location.href).toContain('tab:correlatedDatasets');
    });
  });

  describe('navigateToSloSuggest', () => {
    const navigateToAppMock = jest.fn();
    let dispatchSpy: jest.SpyInstance;

    beforeEach(() => {
      (coreRefs as any).application = { navigateToApp: navigateToAppMock };
      dispatchSpy = jest.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
    });

    afterEach(() => {
      dispatchSpy.mockRestore();
      delete (coreRefs as any).application;
    });

    const getPath = () => navigateToAppMock.mock.calls[0][1].path as string;

    it('builds a path with source=apm and the services csv', () => {
      navigateToSloSuggest(['checkout', 'cart']);

      expect(navigateToAppMock).toHaveBeenCalledTimes(1);
      const path = getPath();
      expect(path).toContain('source=apm');
      expect(path).toContain('services=checkout%2Ccart');
    });

    it('omits the services param when the list is empty', () => {
      navigateToSloSuggest([]);

      expect(getPath()).not.toContain('services=');
    });

    it('includes from/to when a time range is provided', () => {
      navigateToSloSuggest(['checkout'], { from: 'now-24h', to: 'now' });

      const path = getPath();
      expect(path).toContain('from=now-24h');
      expect(path).toContain('to=now');
    });

    it('omits from/to when no time range is provided', () => {
      navigateToSloSuggest(['checkout']);

      const path = getPath();
      expect(path).not.toContain('from=');
      expect(path).not.toContain('to=');
    });

    it('dispatches a hashchange event so the HashRouter picks up the path', () => {
      navigateToSloSuggest(['checkout'], { from: 'now-1h', to: 'now' });

      expect(dispatchSpy).toHaveBeenCalledWith(expect.any(HashChangeEvent));
    });
  });
});

describe('openCorrelatedDashboard (correlated dashboards, experimental)', () => {
  let windowOpenSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    windowOpenSpy = jest.spyOn(window, 'open').mockImplementation();
  });

  afterEach(() => {
    windowOpenSpy.mockRestore();
  });

  it('opens the dashboard in a new tab with the time range in _g', () => {
    openCorrelatedDashboard('dash-1', { from: 'now-15m', to: 'now' });

    expect(windowOpenSpy).toHaveBeenCalledTimes(1);
    const [url, target, features] = windowOpenSpy.mock.calls[0];
    expect(url).toContain('/app/dashboards#/view/dash-1');
    expect(url).toContain('_g=(');
    expect(url).toContain('time:(from:now-15m,to:now)');
    expect(target).toBe('_blank');
    expect(features).toBe('noopener,noreferrer');
  });

  it('uses basePath.prepend so workspace context is preserved', () => {
    openCorrelatedDashboard('dash-1', { from: 'now-1h', to: 'now' });

    // Mock prepends "/base" — the final URL must include it.
    const [url] = windowOpenSpy.mock.calls[0];
    expect(url.startsWith('/base/app/dashboards#/view/dash-1')).toBe(true);
  });

  it('percent-encodes dashboard ids with special characters', () => {
    openCorrelatedDashboard('with/slash and space', { from: 'now-15m', to: 'now' });

    const [url] = windowOpenSpy.mock.calls[0];
    expect(url).toContain('#/view/with%2Fslash%20and%20space');
  });

  it('omits _g when no time range is provided', () => {
    openCorrelatedDashboard('dash-2');

    const [url] = windowOpenSpy.mock.calls[0];
    expect(url).toContain('#/view/dash-2');
    expect(url).not.toContain('_g=');
  });

  it('rison-quotes + encodes absolute ISO timestamps so the redirect keeps its time range', () => {
    openCorrelatedDashboard('dash-1', {
      from: '2026-09-18T18:11:01.655Z',
      to: '2026-09-18T20:00:00.000Z',
    });

    const [url] = windowOpenSpy.mock.calls[0];
    expect(url).toContain('_g=(');
    expect(url).toContain(
      "time:(from:'2026-09-18T18%3A11%3A01.655Z',to:'2026-09-18T20%3A00%3A00.000Z')"
    );
  });

  it('encodes a relative-future timestamp so + does not decode to a space', () => {
    openCorrelatedDashboard('dash-1', { from: 'now-1h', to: 'now+1h' });

    const [url] = windowOpenSpy.mock.calls[0];
    expect(url).toContain('time:(from:now-1h,to:now%2B1h)');
    expect(url).not.toContain('to:now 1h');
    expect(url).not.toContain('to:now+1h');
  });
});

describe('navigateToExploreMetrics (open in Discover metrics)', () => {
  let windowOpenSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    windowOpenSpy = jest.spyOn(window, 'open').mockImplementation();
  });

  afterEach(() => {
    windowOpenSpy.mockRestore();
  });

  it('opens the Explore metrics query view with the PromQL, datasource and time range', () => {
    navigateToExploreMetrics('up', 'conn-1', { from: 'now-15m', to: 'now' });

    expect(windowOpenSpy).toHaveBeenCalledTimes(1);
    const url = windowOpenSpy.mock.calls[0][0];
    expect(url).toContain('/app/explore/metrics/#?');
    expect(url).toContain('signalType:metrics');
    expect(url).toContain('metricsPageMode:query');
    expect(url).toContain('time:(from:now-15m,to:now)');
  });

  it('rison-quotes + encodes absolute ISO timestamps in _g', () => {
    navigateToExploreMetrics('up', 'conn-1', {
      from: '2026-09-18T18:11:01.655Z',
      to: '2026-09-18T20:00:00.000Z',
    });

    const url = windowOpenSpy.mock.calls[0][0];
    expect(url).toContain(
      "time:(from:'2026-09-18T18%3A11%3A01.655Z',to:'2026-09-18T20%3A00%3A00.000Z')"
    );
  });

  it('encodes a relative-future timestamp so + does not decode to a space', () => {
    navigateToExploreMetrics('up', 'conn-1', { from: 'now-1h', to: 'now+1h' });

    const url = windowOpenSpy.mock.calls[0][0];
    expect(url).toContain('to:now%2B1h');
    expect(url).not.toContain('to:now 1h');
  });

  it('rison-escapes a PromQL matcher containing ! so the query is not dropped', () => {
    navigateToExploreMetrics('sum(rate(x{a!="b"}[5m]))', 'conn-1', { from: 'now-15m', to: 'now' });

    const url = windowOpenSpy.mock.calls[0][0];
    // `!` must be rison-escaped to `!!` (URL-encoding leaves `!` raw, and rison
    // treats a lone `!` as an escape char → dropped query).
    expect(url).toContain(encodeURIComponent('a!!='));
  });
});

describe('openApmSettings (correlated dashboards, experimental)', () => {
  let dispatchSpy: jest.SpyInstance;

  beforeEach(() => {
    dispatchSpy = jest.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    dispatchSpy.mockRestore();
  });

  it('sets the _apmSettings=true hash marker while preserving path + params', () => {
    window.location.hash = '#/service-details/checkout/env-a?tab=overview';
    openApmSettings();
    expect(window.location.hash).toContain('/service-details/checkout/env-a');
    expect(window.location.hash).toContain('tab=overview');
    expect(window.location.hash).toContain('_apmSettings=true');
  });

  it('leaves other query params intact', () => {
    window.location.hash = '#/services?searchQuery=foo';
    openApmSettings();
    expect(window.location.hash).toContain('searchQuery=foo');
    expect(window.location.hash).toContain('_apmSettings=true');
  });

  it('does not percent-encode existing rison _g params', () => {
    window.location.hash = '#/services?_g=(time:(from:now-15m,to:now))';
    openApmSettings();
    // The rison must survive verbatim (no %28/%29 churn).
    expect(window.location.hash).toContain('_g=(time:(from:now-15m,to:now))');
    expect(window.location.hash).toContain('_apmSettings=true');
  });

  it('does not duplicate the marker when already present', () => {
    window.location.hash = '#/services?_apmSettings=true';
    openApmSettings();
    expect(window.location.hash.match(/_apmSettings=true/g)).toHaveLength(1);
  });

  it('adds the correlated-dashboards focus hint only when requested', () => {
    window.location.hash = '#/services';
    openApmSettings();
    expect(window.location.hash).not.toContain('_apmSettingsFocus');

    window.location.hash = '#/services';
    openApmSettings(true);
    expect(window.location.hash).toContain('_apmSettingsFocus=correlatedDashboards');
    expect(window.location.hash).toContain('_apmSettings=true');
  });

  it('defaults the path to / when the hash is empty (never emits #?...)', () => {
    window.location.hash = '';
    openApmSettings();
    expect(window.location.hash).toContain('#/?');
    expect(window.location.hash).not.toContain('#?');
    expect(window.location.hash).toContain('_apmSettings=true');
  });

  it('dispatches a hashchange event so the marker hook reacts even on a same-value hash', () => {
    window.location.hash = '#/services';
    openApmSettings();
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(HashChangeEvent));
  });
});
