import {
  EuiButton,
  EuiCard,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiPanel,
  EuiSelectOption,
  EuiSpacer,
  EuiTabbedContent,
  EuiTabbedContentTab,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import {
  OuiButton,
  OuiCard,
  OuiIcon,
  OuiFlexGroup,
  OuiFlexItem,
  OuiLink,
  OuiSpacer,
  OuiText,
} from '@opensearch-project/oui';
import _ from 'lodash';
import DSLService from 'public/services/requests/dsl';
import PPLService from 'public/services/requests/ppl';
import SavedObjects from 'public/services/saved_objects/event_analytics/saved_objects';
import TimestampUtils from 'public/services/timestamp/timestamp';
import React, { ReactChild, useEffect, useState } from 'react';
import {
  AvailableIntegrationsCardViewProps,
  AvailableIntegrationType,
} from './available_integration_overview_page';

export function AvailableIntegrationsCardView(props: AvailableIntegrationsCardViewProps) {
  const rowNumber = props.records / 5;
  //   console.log(rowNumber)

  //             title={feature}
  //             onClick={() => {
  //               window.location.assign(`#/placeholder/${feature}`);
  //             }}

  const getImage = (url?: string) => {
    let optionalImg;
    if (url) {
      optionalImg = <img alt="" className="synopsisIcon" src={url} />;
    }
    return optionalImg;
  };

  // const classes = classNames('homSynopsis__card', {
  //   'homSynopsis__card--noPanel': !wrapInPanel,
  // });

  const renderRows = (integrations: AvailableIntegrationType[]) => {
    return _.times(rowNumber).map(() => {
      return (
        <>
          <EuiFlexGroup gutterSize="l">
            {integrations.map((i, v) => {
              return (
                <EuiFlexItem key={v}>
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
                            window.location.assign(`#/placeholder/${i.templateName}`);
                          }}
                        >
                          View Details
                        </EuiButton>
                        <EuiSpacer />
                        <EuiButton aria-label="Go to Developers Tools" onClick={() => {}}>
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
    });
  };

  return <>{renderRows(props.data.data)}</>;
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
