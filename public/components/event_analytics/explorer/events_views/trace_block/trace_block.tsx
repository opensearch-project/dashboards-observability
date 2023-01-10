/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TraceDetailRender } from '../../../../application_analytics/components/flyout_components/trace_detail_render';
import React, { useEffect } from 'react';
import { HttpSetup } from '../../../../../../../../src/core/public';
import { EuiCallOut, EuiLink } from '@elastic/eui';
import { TRACE_ANALYTICS_DOCUMENTATION_LINK } from '../../../../../../common/constants/trace_analytics';
import {
  OPEN_TELEMETRY_LOG_CORRELATION_LINK,
  OTEL_TRACE_ID,
} from '../../../../../../common/constants/explorer';
import { IDocType } from '../docViewRow';
import { isValidTraceId } from '../../../utils';

interface props {
  http: HttpSetup;
  hit: IDocType;
  logTraceId: string;
}

export const TraceBlock = ({ http, hit, logTraceId }: props) => {
  if ((!hit.traceID || hit.traceID.length === 0) && (logTraceId === '' || !isValidTraceId(logTraceId))){
    return (
      <>
        <EuiCallOut iconType="help" title="No Trace Id found in the event.">
          <p>Please make sure to add "{OTEL_TRACE_ID}" field to the logs.</p>
          <p>
            More info on{' '}
            <EuiLink href={TRACE_ANALYTICS_DOCUMENTATION_LINK} target="_blank" external>
              Trace Analytics
            </EuiLink>
            <br />
            More info on{' '}
            <EuiLink href={OPEN_TELEMETRY_LOG_CORRELATION_LINK} target="_blank" external>
              Log Correlation
            </EuiLink>
          </p>
        </EuiCallOut>
      </>
    );
  }
  const mode = (!hit.traceID || hit.traceID.length === 0) ? 'data_prepper' : 'jaeger'

  return <TraceDetailRender traceId={hit.traceID || logTraceId} http={http} mode={mode}/>;
};
