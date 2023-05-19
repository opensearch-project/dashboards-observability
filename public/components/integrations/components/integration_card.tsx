import {
  EuiButton,
  EuiCard,
  EuiIcon,
} from '@elastic/eui';
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
      titleElement="h3"
      footer={
        <div>
          <EuiButton aria-label="Go to Developers Tools">Choice One</EuiButton>
        </div>
      }
    />
  );
}
