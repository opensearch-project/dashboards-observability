/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiPanel, EuiCard, EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiIcon } from '@elastic/eui';
import React from 'react';
import { GettingStartedDescription } from './getting_started_description';
import s3Svg from '../icons/s3-logo.svg';
import prometheusSvg from '../icons/prometheus-logo.svg';
import { GettingStartedType } from '../../../../common/types/getting_started';
import { AmazonS3URL, PrometheusURL } from '../../../../common/constants/getting_started';

export interface GettingStartedCard {
  name: GettingStartedType;
  displayName: string;
  description: string;
  displayIcon: JSX.Element;
  onClick: () => void;
}

export function GettingStartedCardView() {
  const Datasources: GettingStartedCard[] = [
    {
      name: 'S3GLUE',
      displayName: 'Amazon S3',
      description: 'Connect to Amazon S3 via AWS Glue Data Catalog',
      displayIcon: <EuiIcon type={s3Svg} size="xl" />,
      onClick: () => (window.location.hash = `#/configure/${AmazonS3URL}`),
    },
    {
      name: 'PROMETHEUS',
      displayName: 'Prometheus',
      description: 'Connect to Prometheus',
      displayIcon: <EuiIcon type={prometheusSvg} size="xl" />,
      onClick: () => (window.location.hash = `#/configure/${PrometheusURL}`),
    },
  ];

  const renderRows = (datasources: GettingStartedCard[]) => {
    return (
      <>
        <EuiFlexGroup gutterSize="l" style={{ flexWrap: 'wrap' }}>
          {datasources.map((i) => {
            return (
              <EuiFlexItem key={i.name} style={{ minWidth: '14rem', maxWidth: '14rem' }}>
                <EuiCard
                  icon={i.displayIcon}
                  title={i.displayName}
                  description={i.description}
                  data-test-subj={`datasource_card_${i.name.toLowerCase()}`}
                  titleElement="span"
                  onClick={i.onClick}
                />
              </EuiFlexItem>
            );
          })}
        </EuiFlexGroup>
        <EuiSpacer />
      </>
    );
  };

  return (
    <EuiPanel>
      <GettingStartedDescription />
      {renderRows(Datasources)}
    </EuiPanel>
  );
}
