/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import {
  EuiPanel,
  EuiFlexItem,
  EuiFlexGroup,
  EuiCompressedSuperDatePicker,
  EuiSpacer,
  EuiPageHeader,
  EuiText,
} from '@elastic/eui';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { PlotlyHTMLElement } from 'plotly.js';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import PPLService from '../../../services/requests/ppl';
import { coreRefs } from '../../../framework/core_refs';
import { uiSettingsService } from '../../../../common/utils';
import { Plt } from '../../../components/visualizations/plotly/plot';
import { PLOTLY_COLOR } from '../../../../common/constants/shared';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface IPrometheusQuery {
  cluster: string;
  name: string;
  title: string;
  query: string;
  endpoint: string;
  vis: { component: PlotlyHTMLElement };
}

export interface GroupDashboardsProps {
  prometheusQueries: IPrometheusQuery[];
}

export interface ISchema {
  name: string;
  type: string;
}
export interface IMetrics {
  datarows: any[];
  jsonData: { [key: string]: any };
  schema: ISchema[];
}

const pplService = new PPLService(coreRefs.http);

const layouts = {
  lg: [
    // Top row with global usage and counts
    { i: 'clusterCPUUsage', x: 0, y: 0, w: 5, h: 2 },
    { i: 'clusterMemoryUsage', x: 0, y: 3, w: 5, h: 2 },
    { i: 'nodesCount', x: 5, y: 0, w: 1, h: 1 },
    { i: 'namespacesCount', x: 5, y: 1, w: 1, h: 1 },
    { i: 'runningPodsCount', x: 5, y: 2, w: 1, h: 1 },

    // Middle row with CPU and RAM utilization
    // { i: 'ramUsage', x: 5, y: 4, w: 2, h: 1 },
    // { i: 'clusterCPUUtilization', x: 4, y: 2, w: 2, h: 1 },
    // { i: 'clusterMemoryUtilization', x: 6, y: 2, w: 2, h: 1 },

    // Additional information panels
    { i: 'runningPodsCategory', x: 7, y: 0, w: 2, h: 2 },
    { i: 'cpuCoreCount', x: 5, y: 3, w: 1, h: 1 },
    { i: 'totalNetworkTraffic', x: 3, y: 3, w: 5, h: 2 },

    // Visualization row with detailed charts
    // { i: 'networkTraffic', x: 0, y: 5, w: 4, h: 3 },
    // { i: 'diskIO', x: 4, y: 5, w: 4, h: 3 },

    // Namespace-based CPU and memory usage panels
    { i: 'cpuUsageByNamespace', x: 0, y: 8, w: 4, h: 3 },
    { i: 'memoryUsageByNamespace', x: 4, y: 8, w: 4, h: 3 },

    // Final row with additional utilization details
    { i: 'podNetworkUtilization', x: 0, y: 10, w: 4, h: 3 },
  ],
  md: [
    // Adjustments for medium-sized screens
    { i: 'clusterCPUUsage', x: 0, y: 0, w: 2, h: 2 },
    { i: 'clusterMemoryUsage', x: 2, y: 0, w: 2, h: 2 },
    { i: 'nodesCount', x: 4, y: 0, w: 1, h: 2 },
    { i: 'namespacesCount', x: 5, y: 0, w: 1, h: 2 },
    { i: 'runningPodsCount', x: 6, y: 0, w: 2, h: 2 },
    { i: 'cpuCoreCount', x: 0, y: 2, w: 2, h: 1 },
    { i: 'ramUsage', x: 2, y: 2, w: 2, h: 1 },
    { i: 'clusterCPUUtilization', x: 4, y: 2, w: 2, h: 1 },
    { i: 'clusterMemoryUtilization', x: 6, y: 2, w: 2, h: 1 },
    { i: 'runningPodsCategory', x: 0, y: 3, w: 3, h: 2 },
    { i: 'totalNetworkTraffic', x: 3, y: 3, w: 5, h: 2 },
    { i: 'networkTraffic', x: 0, y: 5, w: 4, h: 3 },
    { i: 'diskIO', x: 4, y: 5, w: 4, h: 3 },
    { i: 'cpuUsageByNamespace', x: 0, y: 8, w: 4, h: 3 },
    { i: 'memoryUsageByNamespace', x: 4, y: 8, w: 4, h: 3 },
    { i: 'podNetworkUtilization', x: 0, y: 11, w: 4, h: 3 },
  ],
  sm: [
    // Adjustments for small screens
    { i: 'clusterCPUUsage', x: 0, y: 0, w: 2, h: 2 },
    { i: 'clusterMemoryUsage', x: 2, y: 0, w: 2, h: 2 },
    { i: 'nodesCount', x: 0, y: 2, w: 2, h: 2 },
    { i: 'namespacesCount', x: 2, y: 2, w: 2, h: 2 },
    { i: 'runningPodsCount', x: 0, y: 4, w: 2, h: 2 },
    { i: 'cpuCoreCount', x: 2, y: 4, w: 2, h: 1 },
    { i: 'ramUsage', x: 0, y: 5, w: 2, h: 1 },
    { i: 'clusterCPUUtilization', x: 2, y: 5, w: 2, h: 1 },
    { i: 'clusterMemoryUtilization', x: 0, y: 6, w: 2, h: 1 },
    { i: 'runningPodsCategory', x: 2, y: 6, w: 2, h: 2 },
    { i: 'totalNetworkTraffic', x: 0, y: 7, w: 4, h: 3 },
    { i: 'networkTraffic', x: 0, y: 10, w: 4, h: 3 },
    { i: 'diskIO', x: 0, y: 13, w: 4, h: 3 },
    { i: 'cpuUsageByNamespace', x: 0, y: 16, w: 4, h: 3 },
    { i: 'memoryUsageByNamespace', x: 0, y: 19, w: 4, h: 3 },
    { i: 'podNetworkUtilization', x: 0, y: 22, w: 4, h: 3 },
  ],
};

export const GroupDashboards = ({
  prometheusQueries,
  setStart,
  setEnd,
  start,
  end,
}: GroupDashboardsProps) => {
  const [metricsData, setMetricsData] = React.useState<any[]>([]);

  useEffect(() => {
    console.log('reredner on date change.....');
    const metrics = prometheusQueries.map((query) => {
      return pplService.fetch({ query: query.query, format: 'viz' });
    });

    Promise.allSettled(metrics)
      .then((data) => {
        setMetricsData(data.map((d) => (d.status === 'fulfilled' ? d.value : null)));
      })
      .catch((error) => {
        console.log(error);
      });
  }, [start, end]);

  const getProcessedMetricsVizData = (
    data: IMetrics,
    xKeys: string[],
    yKeys: string[],
    gKeys: string[],
    traceConfig: {}
  ) => {
    if (traceConfig.type === 'pie') {
      return [
        {
          labels: data.data[xKeys[0]],
          values: data.data[yKeys[0]],
          ...traceConfig,
        },
      ];
    } else if (traceConfig.type === 'indicator') {
      return [
        {
          value: data?.data[yKeys[0]][0] || 0,
          ...traceConfig,
        },
      ];
    } else if (gKeys.length === 0) {
      return [
        {
          x: data.data[xKeys[0]],
          y: data.data[yKeys[0]],
          ...traceConfig,
        },
      ];
    }
    const groupMap = new Map<string, any>();
    data.jsonData.forEach((row) => {
      const groupKey = gKeys.map((gKey) => row[gKey]).join(',');
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          x: [row[xKeys[0]]],
          y: [row[yKeys[0]]],
          name: groupKey === ',' ? yKeys[0] : groupKey,
          ...traceConfig,
        });
      } else {
        const group = groupMap.get(groupKey);
        group.x.push(row[xKeys[0]]);
        group.y.push(row[yKeys[0]]);
      }
    });
    return [...groupMap.values()];

    // data.jsonData.forEach((pair) => {

    // });
  };

  const renderPanel = (metrics: IMetrics[]) => {
    console.log('metrics', metrics);
    return metrics.map((metric, index) => {
      // if (!metric) {
      //   return [];
      // }

      const visXaxisKeys = prometheusQueries[index].vis.xKeys;
      const visYaxisKeys = prometheusQueries[index].vis.yKeys;
      const visGroupingKeys = prometheusQueries[index].vis.gKeys;
      const visualizationData = getProcessedMetricsVizData(
        metric,
        visXaxisKeys,
        visYaxisKeys,
        visGroupingKeys,
        prometheusQueries[index].vis.config
      );

      // metric
      // jdbc
      // metric.datarows.forEach((row) => {
      //   xaxisData.push(row[0]);
      //   yaxisData.push(row[1]);
      //   // row[0] = new Date(row[0]).toISOString();
      // });
      return (
        <div key={prometheusQueries[index].title + index} data-grid={layouts.lg[index]}>
          <EuiPanel paddingSize="m">
            <EuiText>
              <h4>{prometheusQueries[index].title}</h4>
            </EuiText>
            <Plt
              // data={[
              //   {
              //     x: xaxisData,
              //     y: yaxisData,
              //     type: prometheusQueries[index].vis?.type || 'scatter',
              //   },
              // ]}
              data={visualizationData}
              layout={{
                // width: 200, // Set custom width
                // height: 150, // Set custom height
                margin: { t: 0, b: 0, l: 0, r: 0 }, // Minimal margins
                padding: { t: 0, b: 0, l: 0, r: 0 }, // Minimal padding
                showlegend: true,
                ...(prometheusQueries[index].vis.layout || {}),
                xaxis: {
                  // title: {
                  //   text: prometheusQueries[index].vis.x || metric.schema[0]?.name || '',
                  // },
                  showgrid: true,
                  zeroline: false,
                  rangemode: 'normal',
                  automargin: true,
                },
                yaxis: {
                  title: {
                    text: prometheusQueries[index].vis.y || metric.schema[1]?.name || '',
                  },
                  showgrid: true,
                  zeroline: false,
                  rangemode: 'normal',
                },
                colorway: PLOTLY_COLOR
              }}
              // config={prometheusQueries[index].vis.component.config}
            />
            {/* <Visualization
            visualizations={{
              data: {
                userConfigs: {
                  dataConfig: {
                    span: {},
                    [GROUPBY]: metric.schema[1]?.name,
                    [AGGREGATIONS]: metric.schema[0]?.name,
                    queryMetaData: {},
                    metricType: '',
                  },
                },
                explorer: {
                  explorerData: { schema: metric.schema, jsonData: metric.jsonData },
                },
              },
              vis: {
                component: prometheusQueries[index].vis.component,
              },
            }}
          /> */}
          </EuiPanel>
          <EuiSpacer size="m" />
        </div>
      );
    });
  };

  return (
    <div className="group-dashboards">
      <EuiFlexGroup direction="column">
        <EuiFlexGroup direction="row" className="kubernetes-cluster-title">
          <EuiFlexItem>
            <EuiPageHeader pageTitle={'eks-cluster-with-vpc'} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiCompressedSuperDatePicker
              dateFormat={uiSettingsService.get('dateFormat')}
              start={start}
              end={end}
              onTimeChange={(dateSpan) => {
                setStart(dateSpan.start);
                setEnd(dateSpan.end);
              }}
              showUpdateButton={false}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />
        <ResponsiveGridLayout
          className="layout"
          layouts={layouts}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 8, md: 8, sm: 4, xs: 2, xxs: 1 }}
          rowHeight={250} // Adjust as needed for more vertical space
          isDraggable={true}
          isResizable={true}
          width={window.innerWidth}
        >
          {renderPanel(metricsData)}
        </ResponsiveGridLayout>
      </EuiFlexGroup>
    </div>
  );
};
