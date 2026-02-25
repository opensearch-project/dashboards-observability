/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { AccelerationDetailsFlyout } from '../manage/accelerations/acceleration_details_flyout';
import * as coreRefsModule from '../../../../framework/core_refs';
import { CachedAcceleration } from '../../../../../common/types/data_connections';

jest.mock('../../../../framework/core_refs', () => {
  const actualModule = jest.requireActual('../../../../framework/core_refs');
  return {
    coreRefs: {
      ...actualModule.coreRefs,
      dslService: {
        fetchFields: jest.fn().mockResolvedValue({ data: 'mockFieldData' }),
        fetchSettings: jest.fn().mockResolvedValue({ data: 'mockSettingsData' }),
        fetchIndices: jest.fn().mockResolvedValue({ data: 'mockIndexData' }),
      },
    },
  };
});

jest.mock('../../../../framework/core_refs', () => {
  return {
    coreRefs: {
      dslService: {
        fetchFields: jest.fn().mockResolvedValue({ data: 'mockFieldData' }),
        fetchSettings: jest.fn().mockResolvedValue({ data: 'mockSettingsData' }),
        fetchIndices: jest.fn().mockResolvedValue({
          status: 'fulfilled',
          action: 'getIndexInfo',
          data: [
            {
              health: 'yellow',
              status: 'open',
              index: 'flint_mys3_default_http_count_view',
              uuid: 'VImREbK4SMqJ-i6hSB84eQ',
              pri: '1',
              rep: '1',
              'docs.count': '0',
              'docs.deleted': '0',
              'store.size': '208b',
              'pri.store.size': '208b',
            },
          ],
        }),
      },
    },
  };
});

const mockAcceleration: CachedAcceleration = {
  flintIndexName: 'testIndex',
  type: 'materialized',
  database: 'mockDatabase',
  table: 'mockTable',
  indexName: 'mockIndex',
  autoRefresh: true,
  status: 'Updated',
};

describe('AccelerationDetailsFlyout Component Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches acceleration details on mount', async () => {
    render(
      <AccelerationDetailsFlyout
        index="mockIndex"
        acceleration={mockAcceleration}
        dataSourceName="mockDataSource"
        dataSourceMDSId=""
      />
    );

    expect(coreRefsModule.coreRefs.dslService!.fetchFields).toHaveBeenCalledWith('testIndex', '');
    expect(coreRefsModule.coreRefs.dslService!.fetchSettings).toHaveBeenCalledWith('testIndex', '');
    expect(coreRefsModule.coreRefs.dslService!.fetchIndices).toHaveBeenCalledWith('testIndex', '');
  });

  it('fetches acceleration details with specific mdsId', async () => {
    render(
      <AccelerationDetailsFlyout
        index="mockIndex"
        acceleration={mockAcceleration}
        dataSourceName="mockDataSource"
        dataSourceMDSId="746ebe20-ee4a-11ef-823a-bd0a7d9fd697"
      />
    );

    expect(coreRefsModule.coreRefs.dslService!.fetchFields).toHaveBeenCalledWith(
      'testIndex',
      '746ebe20-ee4a-11ef-823a-bd0a7d9fd697'
    );
    expect(coreRefsModule.coreRefs.dslService!.fetchSettings).toHaveBeenCalledWith(
      'testIndex',
      '746ebe20-ee4a-11ef-823a-bd0a7d9fd697'
    );
    expect(coreRefsModule.coreRefs.dslService!.fetchIndices).toHaveBeenCalledWith(
      'testIndex',
      '746ebe20-ee4a-11ef-823a-bd0a7d9fd697'
    );
  });

  it('renders the correct tab content on tab switch', async () => {
    const { container } = render(
      <AccelerationDetailsFlyout
        index="mockIndex"
        acceleration={mockAcceleration}
        dataSourceName="mockDataSource"
        resetFlyout={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(container.querySelector('.euiTab')).toBeInTheDocument();
    });

    const detailsTab = Array.from(container.querySelectorAll('.euiTab')).find(
      (tab) => tab.textContent === 'Details'
    );
    if (detailsTab) {
      fireEvent.click(detailsTab);
    }
    await waitFor(() => {
      expect(
        container.querySelector('[data-test-subj="accelerationDetailsTab"]')
      ).toBeInTheDocument();
    });

    const schemaTab = Array.from(container.querySelectorAll('.euiTab')).find(
      (tab) => tab.textContent === 'Schema'
    );
    if (schemaTab) {
      fireEvent.click(schemaTab);
    }
    await waitFor(() => {
      expect(
        container.querySelector('[data-test-subj="accelerationSchemaTab"]')
      ).toBeInTheDocument();
    });
  });

  it('switches tabs correctly', async () => {
    const { container } = render(
      <AccelerationDetailsFlyout
        index="mockIndex"
        acceleration={mockAcceleration}
        dataSourceName="mockDataSource"
        resetFlyout={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(container.querySelector('.euiTab')).toBeInTheDocument();
    });

    const schemaTab = Array.from(container.querySelectorAll('.euiTab')).find(
      (tab) => tab.textContent === 'Schema'
    );
    expect(schemaTab).toBeTruthy();

    if (schemaTab) {
      fireEvent.click(schemaTab);
    }
    await waitFor(() => {
      expect(
        container.querySelector('[data-test-subj="accelerationSchemaTab"]')
      ).toBeInTheDocument();
    });

    // TODO: SQL DEFINATION TAB CHECK
  });
});
