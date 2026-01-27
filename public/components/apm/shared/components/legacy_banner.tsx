/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { EuiCallOut, EuiLink } from '@elastic/eui';
import { LEGACY_BANNER_DISMISSED_KEY } from '../../common/constants';
import { apmEmptyStateI18nTexts as i18nTexts } from '../../common/apm_empty_state_i18n';

/**
 * LegacyBanner - Shared component for displaying the legacy Trace Analytics banner
 *
 * Shows a dismissible callout informing users about the legacy Trace Analytics page
 * and how to enable it. The dismissal state is persisted to localStorage.
 */
export const LegacyBanner: React.FC = () => {
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return localStorage.getItem(LEGACY_BANNER_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    try {
      localStorage.setItem(LEGACY_BANNER_DISMISSED_KEY, 'true');
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  if (isDismissed) {
    return null;
  }

  return (
    <div className="apm-legacy-banner-wrapper">
      <EuiCallOut
        title={i18nTexts.legacyBanner.title}
        iconType="iInCircle"
        size="m"
        dismissible
        onDismiss={handleDismiss}
      >
        <p>
          {i18nTexts.legacyBanner.message}{' '}
          <EuiLink href="/app/settings#Observability">{i18nTexts.legacyBanner.linkText}</EuiLink>
        </p>
      </EuiCallOut>
    </div>
  );
};
