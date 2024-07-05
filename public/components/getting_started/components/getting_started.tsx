/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiPage, EuiPageBody, EuiSpacer } from '@elastic/eui';
import React, { useEffect } from 'react';
import { HomeProps } from 'public/components/getting_started/home';
import { GettingStartedConnectionsHeader } from './getting_started_header';
import { GettingStartedCardView } from './getting_started_card_view';

export const NewGettingStarted = (props: HomeProps) => {
  const { chrome } = props;

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Getting Started',
        href: '#/',
      },
    ]);
  }, []);

  return (
    <EuiPage>
      <EuiPageBody component="div">
        <GettingStartedConnectionsHeader />
        <GettingStartedCardView category="byType" />
        <EuiSpacer size="l" />
        <GettingStartedCardView category="byTechnology" />
        <EuiSpacer size="l" />
        <GettingStartedCardView category="byLanguage" size="small" />
      </EuiPageBody>
    </EuiPage>
  );
};
