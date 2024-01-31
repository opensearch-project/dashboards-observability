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
  EuiText,
  EuiLoadingDashboards,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useState } from 'react';
import {
  AvailableIntegrationsCardViewProps,
  AvailableIntegrationType,
} from './available_integration_overview_page';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { badges } from './integration_category_badge_group';
import { HttpSetup } from '../../../../../../src/core/public';

function NoIntegrationsAvailable() {
  return (
    <>
      <EuiSpacer size="xxl" />
      <EuiText textAlign="center">
        <h2>No Integrations Available</h2>
        <p>
          You can get bundles from{' '}
          <a href="https://github.com/opensearch-project/opensearch-catalog">
            the OpenSearch Catalog.
          </a>
        </p>
      </EuiText>
      <EuiSpacer size="m" />
    </>
  );
}

function LoadingIntegrations() {
  return (
    <>
      <EuiSpacer size="xxl" />
      <EuiText textAlign="center">
        <EuiLoadingDashboards size="xxl" />
        <p>Loading Integrations...</p>
      </EuiText>
    </>
  );
}

function RenderRows({
  loading,
  integrations,
  http,
}: {
  loading: boolean;
  integrations: AvailableIntegrationType[];
  http: HttpSetup;
}) {
  const getImage = (url?: string) => {
    let optionalImg;
    if (url) {
      optionalImg = (
        <img style={{ height: 100, width: 100 }} alt="" className="synopsisIcon" src={url} />
      );
    }
    return optionalImg;
  };

  if (loading) return <LoadingIntegrations />;
  if (!integrations.length) return <NoIntegrationsAvailable />;
  return (
    <>
      <EuiFlexGroup gutterSize="l" style={{ flexWrap: 'wrap' }}>
        {integrations.map((i, v) => {
          return (
            <EuiFlexItem key={v} style={{ minWidth: '14rem', maxWidth: '14rem' }}>
              <EuiCard
                icon={getImage(
                  http.basePath.prepend(
                    `${INTEGRATIONS_BASE}/repository/${i.name}/static/${i.statics.logo.path}`
                  )
                )}
                title={i.displayName ? i.displayName : i.name}
                description={i.description}
                data-test-subj={`integration_card_${i.name.toLowerCase()}`}
                titleElement="span"
                onClick={() => (window.location.hash = `#/available/${i.name}`)}
                footer={badges(i.labels ?? [])}
              />
            </EuiFlexItem>
          );
        })}
      </EuiFlexGroup>
      <EuiSpacer />
    </>
  );
}

export function AvailableIntegrationsCardView(props: AvailableIntegrationsCardViewProps) {
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
    if (optionId === '0') {
      props.setCardView(false);
    } else {
      props.setCardView(true);
    }
  };

  return (
    <EuiPanel>
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
      <RenderRows
        loading={props.loading}
        integrations={props.data.hits.filter((x) => x.name.includes(props.query))}
        http={props.http}
      />
    </EuiPanel>
  );
}
