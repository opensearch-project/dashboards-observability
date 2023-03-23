import {
  EuiButton,
  EuiFlexGroup,
  EuiLink,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
  EuiFlexItem,
  EuiText,
  EuiPageContentHeaderSection,
} from '@elastic/eui';
import React from 'react';
import { PanelTitle } from '../../../../public/components/trace_analytics/components/common/helper_functions';

export function IntegrationDetails(props: any) {
  let screenshots = undefined;
  if (props.data.data.screenshotUrls) {
    screenshots = Object.values(props.data.data.screenshotUrls)
  }



  return (
    <EuiPanel>
      <PanelTitle title={props.data.data.templateName + ' Details'} />
      <EuiSpacer/>
      <EuiText>
      NginX [pronounced "Engine X"] is an HTTP and reverse proxy server that emphasizes high concurrency, performance, and low memory usage. Nginx can also act as a mail proxy server and a generic TCP proxy server. Nginx is available as open source and in a commercial version (NginX Plus).
As Nginx is a high-speed, lightweight HTTP server engine, more and more web sites and applications are moving to Nginx. According to W3Techs, over 25 percent of all known web servers use Nginx. The performance improvements for serving static content can be significant. Especially at high loads, Nginx is faster than other solutions and consumes less server resources.

        </EuiText>
        <EuiSpacer/>
        <PanelTitle title={'Dashboards'} />
        <EuiFlexGroup gutterSize="l">
            {screenshots?.map((i, v) => {
              return (
                <EuiFlexItem key={v}>
                  <img alt="" className="synopsisIcon" src={i} />
                </EuiFlexItem>
              );
            })}
          </EuiFlexGroup>

        
    </EuiPanel>
  );
}
