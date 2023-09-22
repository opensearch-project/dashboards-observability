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
import _ from 'lodash';
import React, { useState } from 'react';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { NewDatasourceDescription } from './new_datasource_description';
import { coreRefs } from '../../../../public/framework/core_refs';
import { MANAGEMENT_APP_ID } from '../../../../../../src/plugins/management/public';
import sparkSvg from '../icons/apache_spark-icon.svg';

export interface DatasourceType {
  name: string;
  description: string;
  displayIcon: JSX.Element;
}

const Datasources: DatasourceType[] = [
  {
    name: 'OpenSearch',
    description: 'Connect to self managed OpenSearch clusters',
    displayIcon: <EuiIcon type="logoOpenSearch" size="xl" />,
  },
  {
    name: 'Spark',
    description: 'Connect to a self managed instance of Apache Spark',
    displayIcon: <EuiIcon type={sparkSvg} size="xl" />,
  },
];

export function NewDatasourceCardView() {
  const { http } = coreRefs;
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

  const renderRows = (datasources: DatasourceType[]) => {
    return (
      <>
        <EuiFlexGroup gutterSize="l" style={{ flexWrap: 'wrap' }}>
          {datasources.map((i, v) => {
            return (
              <EuiFlexItem key={v} style={{ minWidth: '14rem', maxWidth: '14rem' }}>
                <EuiCard
                  icon={i.displayIcon}
                  title={i.name}
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
