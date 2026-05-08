/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

jest.mock('../../../../../common/query_manager', () => ({}));
jest.mock('../../../../services/requests/ppl', () => ({}));
jest.mock('../../../../services/saved_objects/saved_object_client/saved_objects_actions', () => ({}));
jest.mock('../../../../services/saved_objects/saved_object_client/types', () => ({}));
jest.mock('../../../visualizations/visualization', () => ({}));
jest.mock('../../../../components/visualizations/charts/helpers', () => ({}));
jest.mock('../../../common/query_utils', () => ({
  convertDateTime: jest.fn(),
  updateCatalogVisualizationQuery: jest.fn(),
}));
jest.mock('../../../event_analytics/utils', () => ({ getDefaultVisConfig: jest.fn() }));
jest.mock('../../../../../common/utils', () => ({ getOSDHttp: jest.fn(), removeBacktick: jest.fn() }));

import { updateQuerySpanInterval } from '../utils';

describe('updateQuerySpanInterval', () => {
  it('replaces lowercase span()', () => {
    const query = 'source = logs | stats avg(bytes) by span(timestamp,1d)';
    expect(updateQuerySpanInterval(query, 'timestamp', 1, 'M')).toContain('span(timestamp,1M)');
  });

  it('replaces uppercase SPAN()', () => {
    const query = 'source = logs | stats avg(bytes) by SPAN(timestamp,1d)';
    expect(updateQuerySpanInterval(query, 'timestamp', 1, 'M')).toContain('span(timestamp,1M)');
  });

  it('replaces mixed case Span()', () => {
    const query = 'source = logs | stats avg(bytes) by Span(timestamp,1d)';
    expect(updateQuerySpanInterval(query, 'timestamp', 1, 'M')).toContain('span(timestamp,1M)');
  });
});
