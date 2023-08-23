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
  EuiSearchBar,
  EuiButton,
  EuiFieldSearch,
  EuiSwitch,
  EuiButtonGroup,
  EuiBadgeGroup,
  EuiBadge,
  EuiToolTip,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useRef, useState } from 'react';
import {
  AvailableIntegrationsCardViewProps,
  AvailableIntegrationType,
} from '../../integrations/components/available_integration_overview_page';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { badges } from '../../integrations/components/integration_category_badge_group';
import { NewDatasourcesDescription } from './new_datasource_description';

export function DatasourcesCardView(props: AvailableIntegrationsCardViewProps) {
  const [toggleIconIdSelected, setToggleIconIdSelected] = useState('1');

  const getImage = (url?: string) => {
    let optionalImg;
    if (url) {
      optionalImg = (
        <img style={{ height: 100, width: 100 }} alt="" className="synopsisIcon" src={url} />
      );
    }
    return optionalImg;
  };

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

  const onChangeIcons = (optionId) => {
    setToggleIconIdSelected(optionId);
    if (optionId === '0') {
      props.setCardView(false);
    } else {
      props.setCardView(true);
    }
  };

  const renderRows = (integrations: AvailableIntegrationType[]) => {
    if (!integrations || !integrations.length) return null;
    return (
      <>
        <EuiFlexGroup gutterSize="l" style={{ flexWrap: 'wrap' }}>
          {integrations.map((i, v) => {
            return (
              <EuiFlexItem key={v} style={{ minWidth: '14rem', maxWidth: '14rem' }}>
                <EuiCard
                  icon={getImage(
                    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Amazon-S3-Logo.svg/1200px-Amazon-S3-Logo.svg.png'
                  )}
                  title={i.displayName ? i.displayName : i.name}
                  description={i.description}
                  data-test-subj={`integration_card_${i.name.toLowerCase()}`}
                  titleElement="span"
                  onClick={() => (window.location.hash = `#/configure`)}
                  footer={badges(i.components)}
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
      <NewDatasourcesDescription />
      <EuiFlexGroup gutterSize="s">
        <EuiFlexItem>
          <EuiFieldSearch
            fullWidth
            isClearable={false}
            placeholder="Search..."
            data-test-subj="search-bar-input-box"
            onChange={(e) => {
              props.setQuery(e.target.value);
            }}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>{props.renderCateogryFilters()}</EuiFlexItem>
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
      {renderRows(props.data.hits.filter((x) => x.name.includes(props.query)))}
    </EuiPanel>
  );
}
