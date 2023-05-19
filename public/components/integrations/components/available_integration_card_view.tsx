import {
  EuiButton,
  EuiCard,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
} from '@elastic/eui';
import _ from 'lodash';
import React from 'react';
import {
  AvailableIntegrationsCardViewProps,
  AvailableIntegrationType,
} from './available_integration_overview_page';

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
                  // className={classes}
                  layout="vertical"
                  icon={getImage(i.assetUrl)}
                  titleSize="xs"
                  title={i.templateName}
                  description={i.description}
                  data-test-subj={`homeSynopsisLink${i.templateName.toLowerCase()}`}
                  footer={
                    <div>
                      <EuiButton
                        aria-label="Go to Developers Tools"
                        onClick={() => {
                          window.location.assign(`#/available/${i.templateName}`);
                        }}
                      >
                        View Details
                      </EuiButton>
                      <EuiSpacer />
                      <EuiButton
                        aria-label="Go to Developers Tools"
                        onClick={() => {
                          props.showModal(i.templateName);
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

  return <>{renderRows(props.data.data?.integrations)}</>;
}

//   Synopsis.propTypes = {
//     description: PropTypes.string.isRequired,
//     iconUrl: PropTypes.string,
//     iconType: PropTypes.string,
//     title: PropTypes.string.isRequired,
//     url: PropTypes.string,
//     onClick: PropTypes.func,
//     isBeta: PropTypes.bool,
//   };

//   Synopsis.defaultProps = {
//     isBeta: false,
//   };
