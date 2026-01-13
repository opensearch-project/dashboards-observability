/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiEmptyPrompt } from '@elastic/eui';

interface EmptyStateProps {
  isError?: boolean;
  title?: string;
  body?: string;
  iconType?: string;
}

/**
 * Empty state component for errors and no data scenarios
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  isError = false,
  title,
  body,
  iconType,
}) => {
  const defaultTitle = isError ? 'Error loading data' : 'No services found';
  const defaultBody = isError
    ? 'There was an error loading the services. Please try again.'
    : 'No services match your search criteria. Try adjusting your filters or time range.';
  const defaultIcon = isError ? 'alert' : 'search';

  return (
    <EuiEmptyPrompt
      iconType={iconType || defaultIcon}
      title={<h2>{title || defaultTitle}</h2>}
      body={<p>{body || defaultBody}</p>}
    />
  );
};
