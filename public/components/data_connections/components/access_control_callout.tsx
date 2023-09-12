/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiCallOut,
  EuiLink,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useState } from 'react';
import { EuiPanel } from '@elastic/eui';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../common/constants/data_connections';

export const AccessControlCallout = () => {
  return (
    <EuiCallOut title="Configurations may be managed elsewhere." iconType="iInCircle">
      Access to data can be managed in other systems outside of OpenSearch. Check with your
      administrator for additional configurations.
    </EuiCallOut>
  );
};
