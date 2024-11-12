/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { DashboardControls } from '../dashboard_controls';
import { coreRefs } from '../../../../framework/core_refs';
import { setObservabilityDashboardsId } from '../utils';
import { getWorkspaceIdFromUrl } from '../../../../../../../src/core/public/utils';
import { act } from 'react-dom/test-utils';

configure({ adapter: new Adapter() });

jest.mock('../../../getting_started/components/utils', () => ({
  redirectToDashboards: jest.fn(),
}));

jest.mock('../../../../framework/core_refs', () => ({
  coreRefs: {
    savedObjectsClient: {
      find: jest.fn(),
    },
    http: {
      basePath: {
        getBasePath: jest.fn(() => '/basePath'),
      },
    },
  },
}));

jest.mock('../utils', () => ({
  setObservabilityDashboardsId: jest.fn(),
}));

jest.mock('../../../../../common/utils', () => ({
  getOverviewPage: jest.fn(() => ({
    removeSection: jest.fn(),
  })),
}));

jest.mock('../../../../../../../src/core/public/utils', () => ({
  getWorkspaceIdFromUrl: jest.fn(),
}));

describe('Dashboard controls - checkDataSource useEffect simplified', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render', () => {
    const wrapper = mount(<DashboardControls />);
    expect(wrapper).toMatchSnapshot();
  });

  it('should handle no data sources in a workspace', async () => {
    getWorkspaceIdFromUrl.mockReturnValue('workspace123');
    coreRefs.savedObjectsClient.find.mockResolvedValue({ savedObjects: [] });

    const mockSetObservabilityDashboardsId = setObservabilityDashboardsId;

    await act(async () => {
      mount(<DashboardControls />);
      await new Promise((resolve) => setImmediate(resolve));
    });

    expect(mockSetObservabilityDashboardsId).toHaveBeenCalledWith(null);
  });

  it('should handle existing data sources in a workspace', async () => {
    getWorkspaceIdFromUrl.mockReturnValue('workspace123');
    coreRefs.savedObjectsClient.find.mockResolvedValue({ savedObjects: [{ id: 'ds1' }] });

    const mockSetObservabilityDashboardsId = setObservabilityDashboardsId;

    await act(async () => {
      mount(<DashboardControls />);
      await new Promise((resolve) => setImmediate(resolve));
    });

    expect(mockSetObservabilityDashboardsId).not.toHaveBeenCalled();
  });

  it('should handle non-workspace scenario', async () => {
    getWorkspaceIdFromUrl.mockReturnValue(null);

    const mockSetObservabilityDashboardsId = setObservabilityDashboardsId;

    await act(async () => {
      mount(<DashboardControls />);
      await new Promise((resolve) => setImmediate(resolve));
    });

    expect(mockSetObservabilityDashboardsId).not.toHaveBeenCalled();
  });
});
