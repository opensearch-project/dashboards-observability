/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './accelerate.scss';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiGlobalToastList,
  EuiLoadingSpinner,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiCheckableCard,
  htmlIdGenerator,
  EuiTitle,
  EuiText,
  EuiLink,
  EuiButton,
} from '@elastic/eui';
import React, { ReactChild, useEffect, useState } from 'react';
import httpClientMock from 'test/__mocks__/httpClientMock';
import { AccelerateHeader } from './accelerate_header';
import { AccelerateCallout } from './accelerate_callout';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../common/constants/integrations';
import { AccelerateFlyout } from './accelerate_flyout';

export function TestPage(props: any) {
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);

  return (
    <EuiPage>
      <EuiButton
        onClick={() => {
          setIsFlyoutVisible(true);
        }}
      >
        Click Me
      </EuiButton>

      {isFlyoutVisible && <AccelerateFlyout onClose={() => setIsFlyoutVisible(false)} {...props} />}
    </EuiPage>
  );
}
