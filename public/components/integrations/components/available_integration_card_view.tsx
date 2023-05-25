import { EuiButton, EuiCard, EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import _ from 'lodash';
import React from 'react';
import {
  AvailableIntegrationsCardViewProps,
  AvailableIntegrationType,
} from './available_integration_overview_page';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';

export function AvailableIntegrationsCardView(props: AvailableIntegrationsCardViewProps) {
  const rowNumber = _.ceil(props.records / 5);

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
                  // className={classes}
                  layout="vertical"
                  icon={getImage(`${INTEGRATIONS_BASE}/repository/${i.name}/static/logo`)}
                  titleSize="xs"
                  title={i.name}
                  description={i.description}
                  data-test-subj={`homeSynopsisLink${i.name.toLowerCase()}`}
                  footer={
                    <div>
                      <EuiButton
                        aria-label="Go to Developers Tools"
                        onClick={() => {
                          window.location.assign(`#/available/${i.name}`);
                        }}
                      >
                        View Details
                      </EuiButton>
                      <EuiSpacer />
                      <EuiButton
                        aria-label="Go to Developers Tools"
                        onClick={() => {
                          props.showModal(i.name);
                        }}
                        size="s"
                      >
                        Add
                      </EuiButton>
                    </div>
                  }
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
