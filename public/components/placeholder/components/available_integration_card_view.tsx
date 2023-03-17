import {
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
import DSLService from 'public/services/requests/dsl';
import PPLService from 'public/services/requests/ppl';
import SavedObjects from 'public/services/saved_objects/event_analytics/saved_objects';
import TimestampUtils from 'public/services/timestamp/timestamp';
import React, { ReactChild, useEffect, useState } from 'react';
import { AvailableIntegrationsCardViewProps } from './available_integration_overview_page';

export function AvailableIntegrationsCardView(props: AvailableIntegrationsCardViewProps) {
  const integrations = props.data;

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

  return (
    <EuiPageContent>
      <EuiFlexGroup gutterSize="l">
        {integrations.map((i, v) => {
          return (
            <EuiFlexItem key={v}>
              <EuiCard
                // className={classes}
                layout="vertical"
                icon={getImage(i.assetUrl)}
                titleSize="xs"
                title={i.name}
                description={i.description}
                onClick={() => {
                  window.location.assign(`#/placeholder/${i.name}`);
                }}
                data-test-subj={`homeSynopsisLink${i.name.toLowerCase()}`}
              />
            </EuiFlexItem>
          );
        })}
      </EuiFlexGroup>
      <EuiFlexGroup>
        {integrations.map((i, v) => {
          return (
            <EuiFlexItem key={v + 10}>
              <EuiCard
                // className={classes}
                layout="vertical"
                icon={getImage(i.assetUrl)}
                titleSize="xs"
                title={i.name}
                description={i.description}
                onClick={() => {
                  window.location.assign(`#/placeholder/${i.name}`);
                }}
                data-test-subj={`homeSynopsisLink${i.name.toLowerCase()}`}
              />
            </EuiFlexItem>
          );
        })}
      </EuiFlexGroup>
    </EuiPageContent>
  );
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
