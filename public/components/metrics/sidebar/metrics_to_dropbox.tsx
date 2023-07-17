/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { MetricName } from './metric_name';

export const mapMetricsToSelectedPanel = (metrics) => {
  const panelComponents = metrics.map((metric) => {
    return <MetricName metric={metric} />;
  });

  return (
    <>
      <div className="vbConfig__content">{panelComponents}</div>
    </>
  );
};
