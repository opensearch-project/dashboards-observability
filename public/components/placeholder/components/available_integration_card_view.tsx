import {
  EuiCard,
  EuiHorizontalRule,
  EuiIcon,
  EuiPage,
  EuiPageBody,
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

export function AvailableIntegrationsCardView() {
  const integrations = [
    {
      name: 'nginx',
      description:
        'Open-source, high-performance HTTP server and reverse proxy, as well as an IMAP/POP3 proxy server',
      status: 'Available',
    },
  ];

  const id = 'random';
  const description = 'random';
  const iconUrl =
    'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=350';
  const title = 'nginx';
  //             title={feature}
  //             onClick={() => {
  //               window.location.assign(`#/placeholder/${feature}`);
  //             }}
  const url = 'random';

  let optionalImg;
  if (iconUrl) {
    optionalImg = <img alt="" className="synopsisIcon" src={iconUrl} />;
  } else if (iconType) {
    optionalImg = <EuiIcon color="text" size="l" title="" type={iconType} />;
  }

  // const classes = classNames('homSynopsis__card', {
  //   'homSynopsis__card--noPanel': !wrapInPanel,
  // });

  return (
    <EuiCard
      // className={classes}
      layout="vertical"
      icon={optionalImg}
      titleSize="xs"
      title={title}
      description={description}
      onClick={() => {
        window.location.assign(`#/placeholder/${title}`);
      }}
      data-test-subj={`homeSynopsisLink${id.toLowerCase()}`}
      // betaBadgeLabel={isBeta ? 'Beta' : null}
      titleElement="h3"
    />
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
