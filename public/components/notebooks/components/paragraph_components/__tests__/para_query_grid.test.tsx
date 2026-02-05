/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '@testing-library/react';
import React from 'react';
import { QueryDataGridMemo } from '../para_query_grid';

describe('<QueryDataGridMemo /> spec', () => {
  it('renders the component', () => {
    const props = {
      rowCount: 5,
      queryColumns: [
        {
          id: 'bytes',
          displayAsText: 'bytes',
        },
      ],
      visibleColumns: ['bytes'],
      dataValues: [
        {
          bytes: 6219,
        },
        {
          bytes: 6850,
        },
        {
          bytes: 0,
        },
        {
          bytes: 14113,
        },
        {
          bytes: 2492,
        },
      ],
    };
    const _utils = render(<QueryDataGridMemo setVisibleColumns={jest.fn()} {...props} />);
    expect(document.body).toMatchSnapshot();
  });
});
