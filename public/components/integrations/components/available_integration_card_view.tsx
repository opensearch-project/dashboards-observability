import { EuiButton, EuiCard, EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import _ from 'lodash';
import React from 'react';
import {
  AvailableIntegrationsCardViewProps,
  AvailableIntegrationType,
} from './available_integration_overview_page';

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
    console.log(integrations.length);
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
                  icon={getImage(i.assetUrl)}
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

  console.log(props);
  return <>{props.data.data === undefined ? props.data.hits : renderRows(props.data.data.hits)}</>;
}
