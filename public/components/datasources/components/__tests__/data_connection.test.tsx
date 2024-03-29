/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from '@testing-library/react';
import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import ReactDOM from 'react-dom';
import { CatalogCacheManager } from '../../../../../public/framework/catalog_cache/cache_manager';
import { coreRefs } from '../../../../../public/framework/core_refs';
import {
  describePrometheusDataConnection,
  describeS3Dataconnection,
  mockAccelerationCacheData,
  mockDataSourceCacheData,
} from '../../../../../test/datasources';
import { DataConnection } from '../manage/data_connection';

jest.mock('../../../../plugin', () => ({
  getRenderAccelerationDetailsFlyout: jest.fn(),
  getRenderAssociatedObjectsDetailsFlyout: jest.fn(),
  getRenderCreateAccelerationFlyout: jest.fn(),
}));

jest.mock('../../../../../public/framework/core_refs', () => ({
  coreRefs: {
    chrome: {
      setBreadcrumbs: jest.fn(),
    },
    http: {
      get: jest.fn(),
    },
  },
}));
jest.useFakeTimers().setSystemTime(new Date('2024-01-01'));

describe('Data Connection Page test', () => {
  configure({ adapter: new Adapter() });

  beforeEach(() => {
    // Clear the mock implementation before each test
    (coreRefs.http!.get as jest.Mock).mockClear();
  });

  it('Renders Prometheus data connection page with data', async () => {
    CatalogCacheManager.saveDataSourceCache(mockDataSourceCacheData);
    CatalogCacheManager.saveAccelerationsCache(mockAccelerationCacheData);
    const container = document.createElement('div');
    (coreRefs.http!.get as jest.Mock).mockResolvedValue(describePrometheusDataConnection);
    await act(() => {
      ReactDOM.render(<DataConnection dataSource="prom" />, container);
    });
    expect(container).toMatchSnapshot();
  });

  it('Renders S3 data connection page with data', async () => {
    CatalogCacheManager.saveDataSourceCache(mockDataSourceCacheData);
    CatalogCacheManager.saveAccelerationsCache(mockAccelerationCacheData);
    const container = document.createElement('div');
    (coreRefs.http!.get as jest.Mock).mockResolvedValue(describeS3Dataconnection);
    await act(() => {
      ReactDOM.render(<DataConnection dataSource="ya" />, container);
    });
    expect(container).toMatchSnapshot();
  });
});
