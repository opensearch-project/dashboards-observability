/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiPanel,
  EuiCard,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiFieldSearch,
  EuiButtonGroup,
  EuiIcon,
} from '@elastic/eui';
import React, { useState } from 'react';
import { NewDatasourceDescription } from './new_datasource_description';
import s3Svg from '../../icons/s3-logo.svg';
import prometheusSvg from '../../icons/prometheus-logo.svg';
import { DatasourceType } from '../../../../../common/types/data_connections';

export interface DatasourceCard {
  name: DatasourceType;
  displayName: string;
  description: string;
  displayIcon: JSX.Element;
}

const Datasources: DatasourceCard[] = [
  {
    name: 'OPENSEARCH',
    displayName: 'OpenSearch',
    description: 'Connect to self managed OpenSearch clusters',
    displayIcon: <EuiIcon type="logoOpenSearch" size="xl" />,
  },
  {
    name: 'S3GLUE',
    displayName: 'S3',
    description: 'Connect to Amazon S3 via Amazon Glue',
    displayIcon: <EuiIcon type={s3Svg} size="xl" />,
  },
  {
    name: 'PROMETHEUS',
    displayName: 'Prometheus',
    description: 'Connect to Amazon managed Prometheus',
    displayIcon: <EuiIcon type={prometheusSvg} size="xl" />,
  },
];

export function NewDatasourceCardView() {
  const [toggleIconIdSelected, setToggleIconIdSelected] = useState('1');

  const toggleButtonsIcons = [
    {
      id: '0',
      label: 'list',
      iconType: 'list',
    },
    {
      id: '1',
      label: 'grid',
      iconType: 'grid',
    },
  ];

  const onChangeIcons = (optionId: string) => {
    setToggleIconIdSelected(optionId);
  };

  const renderRows = (datasources: DatasourceCard[]) => {
    return (
      <>
        <EuiFlexGroup gutterSize="l" style={{ flexWrap: 'wrap' }}>
          {datasources.map((i, v) => {
            return (
              <EuiFlexItem key={v} style={{ minWidth: '14rem', maxWidth: '14rem' }}>
                <EuiCard
                  icon={i.displayIcon}
                  title={i.displayName}
                  description={i.description}
                  data-test-subj={`datasource_card_${i.name.toLowerCase()}`}
                  titleElement="span"
                  onClick={() => (window.location.hash = `#/configure/${i.name}`)}
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
      <NewDatasourceDescription />
      <EuiFlexGroup gutterSize="s">
        <EuiFlexItem>
          <EuiFieldSearch
            fullWidth
            isClearable={false}
            placeholder="Search..."
            data-test-subj="search-bar-input-box"
            // TODO: implement searching
            onChange={(e) => {}}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonGroup
            legend="Text align"
            options={toggleButtonsIcons}
            idSelected={toggleIconIdSelected}
            onChange={(id) => onChangeIcons(id)}
            isIconOnly
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer />
      {renderRows(Datasources)}
    </EuiPanel>
  );
}
