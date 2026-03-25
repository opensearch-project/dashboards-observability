/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { AssociatedObjectsDetailsFlyout } from '../manage/associated_objects/associated_objects_details_flyout';
import * as plugin from '../../../../plugin';
import { act } from '@testing-library/react';
import { mockAssociatedObjects } from '../../../../../test/datasources';
import { getAccelerationName } from '../manage/accelerations/utils/acceleration_utils';

jest.mock('../../../../plugin', () => ({
  getRenderAccelerationDetailsFlyout: jest.fn(() => jest.fn()),
  getRenderAssociatedObjectsDetailsFlyout: jest.fn(() => jest.fn()),
  getRenderCreateAccelerationFlyout: jest.fn(() => jest.fn()),
}));

describe('AssociatedObjectsDetailsFlyout Integration Tests', () => {
  const mockTableDetail = mockAssociatedObjects[0];

  beforeEach(() => {
    plugin.getRenderAccelerationDetailsFlyout.mockClear();
  });

  it('renders acceleration details correctly and triggers flyout on click', () => {
    const { container } = render(
      <AssociatedObjectsDetailsFlyout tableDetail={mockTableDetail} datasourceName="flint_s3" />
    );
    const tables = container.querySelectorAll('.euiTable');
    const links = tables[0]?.querySelectorAll('.euiLink');
    expect(links.length).toBeGreaterThan(0);

    if (links[0]) {
      fireEvent.click(links[0]);
    }
    expect(plugin.getRenderAccelerationDetailsFlyout).toHaveBeenCalled();
  });

  it('displays no data message for accelerations but still renders schema table', () => {
    const mockDetailNoAccelerations = {
      ...mockTableDetail,
      accelerations: [],
      columns: [
        { fieldName: 'column1', dataType: 'string' },
        { fieldName: 'column2', dataType: 'number' },
      ],
    };

    const { container } = render(
      <AssociatedObjectsDetailsFlyout
        tableDetail={mockDetailNoAccelerations}
        datasourceName="flint_s3"
      />
    );

    expect(container.textContent).toContain('You have no accelerations');
    expect(container.querySelector('.euiTable')).toBeInTheDocument();
    expect(container.textContent).toContain('column1');
    expect(container.textContent).toContain('column2');
  });

  it('renders schema table correctly with column data', () => {
    const { container } = render(
      <AssociatedObjectsDetailsFlyout tableDetail={mockTableDetail} datasourceName="flint_s3" />
    );

    const tables = container.querySelectorAll('.euiTable');
    expect(tables[1]).toBeInTheDocument();
    expect(tables[1].textContent).toContain(mockTableDetail.columns[0].fieldName);
  });

  it('triggers details flyout on acceleration link click', async () => {
    const { container } = render(
      <AssociatedObjectsDetailsFlyout tableDetail={mockTableDetail} datasourceName="flint_s3" />
    );

    await act(async () => {
      // Wait a tick for async updates
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const accName = getAccelerationName(mockTableDetail.accelerations[0]);
    const links = Array.from(container.querySelectorAll('.euiLink'));
    const accLink = links.find((link) => link.textContent === accName);
    expect(accLink).toBeTruthy();

    if (accLink) {
      fireEvent.click(accLink);
    }
    expect(plugin.getRenderAccelerationDetailsFlyout).toHaveBeenCalled();
  });
});
