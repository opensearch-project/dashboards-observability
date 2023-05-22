import { EuiFlexGroup, EuiPanel, EuiSpacer, EuiFlexItem, EuiText } from '@elastic/eui';
import React from 'react';
import { PanelTitle } from '../../trace_analytics/components/common/helper_functions';

export function IntegrationDetails(props: any) {
  let screenshots;
  if (props.data.data.screenshotUrls) {
    screenshots = Object.values(props.data.data.screenshotUrls);
  }

  return (
    <EuiPanel>
      <PanelTitle title={props.data.data.templateName + ' Details'} />
      <EuiSpacer />
      <EuiText>
        NginX [pronounced &quot;Engine X&quot;] is an HTTP and reverse proxy server that emphasizes
        high concurrency, performance, and low memory usage. Nginx can also act as a mail proxy
        server and a generic TCP proxy server. Nginx is available as open source and in a commercial
        version (NginX Plus). As Nginx is a high-speed, lightweight HTTP server engine, more and
        more web sites and applications are moving to Nginx. According to W3Techs, over 25 percent
        of all known web servers use Nginx. The performance improvements for serving static content
        can be significant. Especially at high loads, Nginx is faster than other solutions and
        consumes less server resources.
      </EuiText>
      <EuiSpacer />
      <PanelTitle title={'Dashboards'} />
      <EuiFlexGroup gutterSize="l">
        {screenshots?.map((i, v) => {
          return (
            <EuiFlexItem key={v}>
              <img style={{ width: 100, height: 100 }} alt="" className="synopsisIcon" src={i} />
            </EuiFlexItem>
          );
        })}
      </EuiFlexGroup>
    </EuiPanel>
  );
}
