/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButton, EuiCard, EuiIcon } from '@elastic/eui';
import React from 'react';

export function Synopsis({
  id,
  description,
  iconUrl,
  iconType,
  title,
  url,
  wrapInPanel,
  onClick,
  isBeta,
}) {
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
      onClick={onClick}
      href={url}
      data-test-subj={`homeSynopsisLink${id.toLowerCase()}`}
      // betaBadgeLabel={isBeta ? 'Beta' : null}
      titleElement="h3"
      footer={
        <div>
          <EuiButton aria-label="Go to Developers Tools">Choice One</EuiButton>
        </div>
      }
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
