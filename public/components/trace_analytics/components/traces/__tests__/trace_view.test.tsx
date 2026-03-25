/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { TraceView } from '..';
import { coreRefs } from '../../../../../framework/core_refs';

describe('Trace view component', () => {
  it('renders trace view', async () => {
    const { http, chrome } = coreRefs;
    render(
      <TraceView
        http={http!}
        chrome={chrome!}
        parentBreadcrumbs={[{ text: 'test', href: 'test#/' }]}
        traceId="test"
        mode="data_prepper"
        dataSourceMDSId={[{ id: '', label: '' }]}
        attributesFilterFields={[]}
      />
    );
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
