/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiErrorBoundary, EuiLink, EuiSpacer, EuiText } from '@elastic/eui';
import React from 'react';
import {
  OBSERVABILITY_GITHUB_ISSUE_URL,
  OPENSEARCH_OBSERVABILITY_FORUM_URL,
} from '../../../common/constants/shared';

export function ObservabilityErrorBoundary(props: { children: React.ReactNode }) {
  return (
    <div>
      <EuiErrorBoundary children={props.children} />
      <EuiSpacer size="l" />
      <EuiText size="s" color="subdued">
      An unexpected error occurred. Please refresh the page, and if the issue persists, report it by creating an issue on{' '}
        <EuiLink external={true} href={OBSERVABILITY_GITHUB_ISSUE_URL} target="blank">
        GitHub
        </EuiLink>{' '}
        or posting on the{' '}
        <EuiLink external={true} href={OPENSEARCH_OBSERVABILITY_FORUM_URL} target="blank">
        community forum
        </EuiLink>
      </EuiText>
    </div>
  );
}
