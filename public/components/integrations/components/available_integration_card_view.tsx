/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButton, EuiCard, EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import _ from 'lodash';
import React from 'react';
import {
  AvailableIntegrationsCardViewProps,
  AvailableIntegrationType,
} from './available_integration_overview_page';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';

export function AvailableIntegrationsCardView(props: AvailableIntegrationsCardViewProps) {
  const getImage = (url?: string) => {
    let optionalImg;
    if (url) {
      optionalImg = (
        <img style={{ height: 100, width: 100 }} alt="" className="synopsisIcon" src={url} />
      );
    }
    return optionalImg;
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
                    `${INTEGRATIONS_BASE}/repository/${i.name}/static/${i.statics.logo.path}`
                  )}
                  title={i.name}
                  description={i.description}
                  data-test-subj={`integration_card_${i.name.toLowerCase()}`}
                  titleElement="span"
                  onClick={() => (window.location.hash = `#/available/${i.name}`)}
                />
              </EuiFlexItem>
            );
          })}
        </EuiFlexGroup>
        <EuiSpacer />
      </>
    );
  };

  return <>{renderRows(props.data.hits)}</>;
}
