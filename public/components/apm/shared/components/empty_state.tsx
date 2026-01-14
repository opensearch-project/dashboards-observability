/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiEmptyPrompt } from '@elastic/eui';
import { i18n } from '@osd/i18n';

// i18n translations
const i18nTexts = {
  errorTitle: i18n.translate('observability.apm.emptyState.errorTitle', {
    defaultMessage: 'Error loading data',
  }),
  noDataTitle: i18n.translate('observability.apm.emptyState.noDataTitle', {
    defaultMessage: 'No services found',
  }),
  errorBody: i18n.translate('observability.apm.emptyState.errorBody', {
    defaultMessage: 'There was an error loading the services. Please try again.',
  }),
  noDataBody: i18n.translate('observability.apm.emptyState.noDataBody', {
    defaultMessage:
      'No services match your search criteria. Try adjusting your filters or time range.',
  }),
};

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
  const defaultTitle = isError ? i18nTexts.errorTitle : i18nTexts.noDataTitle;
  const defaultBody = isError ? i18nTexts.errorBody : i18nTexts.noDataBody;
  const defaultIcon = isError ? 'alert' : 'search';

  return (
    <EuiEmptyPrompt
      iconType={iconType || defaultIcon}
      title={<h2>{title || defaultTitle}</h2>}
      body={<p>{body || defaultBody}</p>}
    />
  );
};
