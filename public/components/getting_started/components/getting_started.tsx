/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiPage, EuiPageBody } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { HomeProps } from 'public/components/getting_started/home';
import { CollectAndShipData } from './getting_started_collectData';
import { observabilityGettingStartedTitle } from '../../../../common/constants/shared';

interface ExtendedHomeProps extends HomeProps {
  selectedDataSourceId: string;
  selectedDataSourceLabel: string;
}

export const NewGettingStarted = (props: ExtendedHomeProps) => {
  const { chrome, selectedDataSourceId, selectedDataSourceLabel } = props;
  const [isPickYourSourceOpen, setIsPickYourSourceOpen] = useState(true);

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: observabilityGettingStartedTitle,
        href: '#/',
      },
    ]);
  }, [chrome]);

  const togglePickYourSource = (isOpen: boolean) => {
    setIsPickYourSourceOpen(isOpen);
  };

  return (
    <EuiPage>
      <EuiPageBody component="div">
        <CollectAndShipData
          isOpen={isPickYourSourceOpen}
          onToggle={togglePickYourSource}
          selectedDataSourceId={selectedDataSourceId}
          selectedDataSourceLabel={selectedDataSourceLabel}
        />
      </EuiPageBody>
    </EuiPage>
  );
};
