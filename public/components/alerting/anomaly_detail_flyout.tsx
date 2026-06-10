/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  Axis,
  Chart,
  LineSeries,
  niceTimeFormatter,
  Position,
  RectAnnotation,
  ScaleType,
  Settings,
} from '@elastic/charts';
import {
  EuiAccordion,
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCodeBlock,
  EuiDescriptionList,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiHorizontalRule,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import Plotly, { PlotData } from 'plotly.js-dist';
import plotComponentFactory from 'react-plotly.js/factory';
import { Datasource, UnifiedAlertSummary } from '../../../common/types/alerting';
import { SEVERITY_COLORS, STATE_COLORS } from './shared_constants';

const AD_APP_ID = 'anomaly-detection-dashboards';
const PlotComponent = plotComponentFactory(Plotly);
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HEATMAP_CONTEXT_RANGE_MS = 24 * 60 * 60 * 1000;
const HEATMAP_CONTEXT_TRAILING_PADDING_MS = 30 * 60 * 1000;
const DETAIL_CHART_CONTEXT_RADIUS_MS = 30 * 60 * 1000;
const SPIKE_HALF_WIDTH_MS = 60 * 1000;
const HEATMAP_BUCKET_COUNT = 20;
const HEATMAP_MAX_ENTITIES = 10;
const HEATMAP_CELL_HEIGHT = 28;

const AD_CHART_COLORS = {
  ANOMALY_GRADE_COLOR: '#D13212',
  FEATURE_DATA_COLOR: '#16191F',
  CONFIDENCE_COLOR: '#017F75',
  EXPECTED_VALUE_COLOR: '#0475a2',
};

const ANOMALY_CHART_THEME = [
  {
    colors: {
      vizColors: [AD_CHART_COLORS.CONFIDENCE_COLOR, AD_CHART_COLORS.ANOMALY_GRADE_COLOR],
    },
  },
];

const FEATURE_CHART_THEME = [
  {
    lineSeriesStyle: {
      line: {
        strokeWidth: 2,
        visible: true,
        opacity: 0.5,
      },
      point: {
        visible: true,
        stroke: AD_CHART_COLORS.FEATURE_DATA_COLOR,
      },
    },
  },
  {
    colors: {
      vizColors: [AD_CHART_COLORS.FEATURE_DATA_COLOR],
    },
  },
];

const ANOMALY_HEATMAP_COLORSCALE: Array<[number, string]> = [
  [0, '#F2F2F2'],
  [0.0000001, '#F2F2F2'],
  [0.0000001, '#F7E0B8'],
  [0.2, '#F7E0B8'],
  [0.2, '#F2C596'],
  [0.4, '#F2C596'],
  [0.4, '#ECA976'],
  [0.6, '#ECA976'],
  [0.6, '#E78D5B'],
  [0.8, '#E78D5B'],
  [0.8, '#E8664C'],
  [1, '#E8664C'],
];

export interface AnomalyDetailFlyoutProps {
  anomaly: UnifiedAlertSummary;
  datasources: Datasource[];
  allFindings?: UnifiedAlertSummary[];
  onClose: () => void;
}

export interface AnomalyDetailContentProps {
  anomaly: UnifiedAlertSummary;
  datasources: Datasource[];
  allFindings?: UnifiedAlertSummary[];
  onNavigateToDetectorResults?: () => void;
}

interface EntityParts {
  field: string;
  value: string;
}

interface FeatureValue {
  name: string;
  value: number;
}

interface AnomalyPoint {
  id: string;
  name: string;
  entity: string;
  entityParts: EntityParts;
  startTime: number;
  endTime: number;
  time: number;
  grade: number;
  score: number;
  confidence?: number;
  threshold?: number;
  features: FeatureValue[];
}

interface TimeDomain {
  min: number;
  max: number;
}

interface GradeConfidenceDatum {
  plotTime: number;
  anomalyGrade: number | null;
  confidence: number | null;
}

interface FeatureChartDatum {
  plotTime: number;
  data: number | null;
  expectedValue?: number | null;
}

interface AnnotationDatum {
  coordinates: {
    x0: number;
    x1: number;
  };
  details?: string;
}

export const AnomalyDetailContent: React.FC<AnomalyDetailContentProps> = ({
  anomaly,
  datasources,
  allFindings = [],
  onNavigateToDetectorResults,
}) => {
  const labels = anomaly.labels || {};
  const detectorId = labels.detector_id || anomaly.monitorId;
  const detectorName = labels.detector_name || detectorId || '\u2014';
  const entity = labels.entity || '';
  const selectedEntityParts = parseEntity(entity);
  const selectedPoint = useMemo(() => toAnomalyPoint(anomaly), [anomaly]);
  const dsName =
    datasources.find((datasource) => datasource.id === anomaly.datasourceId)?.name ||
    anomaly.datasourceId ||
    '\u2014';

  const detectorResultsHref = useMemo(
    () => (detectorId ? buildDetectorResultsHref(detectorId, anomaly.datasourceId) : undefined),
    [anomaly.datasourceId, detectorId]
  );

  const relatedAnomalyPoints = useMemo(() => {
    const candidates = new Map<string, UnifiedAlertSummary>();
    [anomaly, ...allFindings].forEach((finding) => {
      candidates.set(finding.id, finding);
    });
    return Array.from(candidates.values())
      .filter((finding) => (finding.findingType || 'alert') === 'anomaly')
      .filter((finding) => {
        const findingDetectorId = finding.labels?.detector_id || finding.monitorId;
        return detectorId ? findingDetectorId === detectorId : finding.id === anomaly.id;
      })
      .map(toAnomalyPoint)
      .sort((a, b) => a.time - b.time);
  }, [allFindings, anomaly, detectorId]);

  const isHighCardinalityDetector = useMemo(
    () => Boolean(entity) || relatedAnomalyPoints.some(hasEntityDimension),
    [entity, relatedAnomalyPoints]
  );

  const selectedEntityPoints = useMemo(() => {
    if (!isHighCardinalityDetector) {
      return relatedAnomalyPoints.length > 0 ? relatedAnomalyPoints : [selectedPoint];
    }
    const points = relatedAnomalyPoints.filter((point) => point.entity === entity);
    return points.length > 0 ? points : [selectedPoint];
  }, [entity, isHighCardinalityDetector, relatedAnomalyPoints, selectedPoint]);

  const selectedChartPoints = useMemo(() => [selectedPoint], [selectedPoint]);
  const selectedFeature = selectedPoint.features[0];
  const chartTimeDomain = useMemo(
    () => buildChartTimeDomain(relatedAnomalyPoints, selectedPoint.time),
    [relatedAnomalyPoints, selectedPoint.time]
  );
  const detailChartTimeDomain = useMemo(
    () => buildFocusedDetailChartTimeDomain(selectedPoint.time),
    [selectedPoint.time]
  );
  const heatmapData = useMemo(
    () => buildHeatmapData(relatedAnomalyPoints, selectedPoint, chartTimeDomain),
    [chartTimeDomain, relatedAnomalyPoints, selectedPoint]
  );
  const gradeConfidenceData = useMemo(
    () => buildGradeConfidenceData(selectedChartPoints, detailChartTimeDomain),
    [detailChartTimeDomain, selectedChartPoints]
  );
  const featureData = useMemo(
    () => buildFeatureChartData(selectedChartPoints, selectedFeature?.name, detailChartTimeDomain),
    [detailChartTimeDomain, selectedChartPoints, selectedFeature?.name]
  );
  const anomalyAnnotations = useMemo(
    () => buildAnomalyAnnotations(selectedChartPoints, detailChartTimeDomain),
    [detailChartTimeDomain, selectedChartPoints]
  );

  const navigateToDetectorResults = () => {
    if (!detectorResultsHref) return;
    if (onNavigateToDetectorResults) {
      onNavigateToDetectorResults();
      return;
    }
    window.location.assign(detectorResultsHref);
  };

  return (
    <>
      <EuiPanel hasBorder paddingSize="m">
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
          <EuiFlexItem>
            <EuiTitle size="xs">
              <h3>
                <FormattedMessage
                  id="observability.alerting.anomalyDetailFlyout.overviewTitle"
                  defaultMessage="Detector result context"
                />
              </h3>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
              {isHighCardinalityDetector && (
                <EuiFlexItem grow={false}>
                  <EuiBadge color="hollow">
                    <FormattedMessage
                      id="observability.alerting.anomalyDetailFlyout.viewBy"
                      defaultMessage="View by: {field}"
                      values={{ field: selectedEntityParts.field || 'entity' }}
                    />
                  </EuiBadge>
                </EuiFlexItem>
              )}
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow">
                  <FormattedMessage
                    id="observability.alerting.anomalyDetailFlyout.relatedCount"
                    defaultMessage="{count} detector anomalies"
                    values={{ count: relatedAnomalyPoints.length }}
                  />
                </EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="s" />
        <EuiCallOut
          size="s"
          iconType={isHighCardinalityDetector ? 'help' : 'iInCircle'}
          title={
            isHighCardinalityDetector
              ? i18n.translate('observability.alerting.anomalyDetailFlyout.heatmapHint', {
                  defaultMessage:
                    'Other detector anomalies are muted; the selected anomaly is highlighted.',
                })
              : i18n.translate('observability.alerting.anomalyDetailFlyout.singleStreamHint', {
                  defaultMessage:
                    'Single-stream detector view for anomaly grade and confidence around the selected anomaly.',
                })
          }
        />
        <EuiSpacer size="m" />
        {isHighCardinalityDetector ? (
          <SafeChart>
            <DetectorHeatmapChart data={heatmapData} />
          </SafeChart>
        ) : (
          <>
            <SelectedAnomalySummaryMetrics
              point={selectedPoint}
              relatedPoints={selectedEntityPoints}
            />
            <EuiSpacer size="m" />
            <SafeChart>
              <DetectorGradeConfidenceChart
                data={gradeConfidenceData}
                annotations={anomalyAnnotations}
                timeDomain={detailChartTimeDomain}
                height={250}
              />
            </SafeChart>
          </>
        )}
      </EuiPanel>

      {isHighCardinalityDetector && (
        <>
          <EuiSpacer size="m" />
          <EuiPanel hasBorder paddingSize="m">
            <EuiTitle size="xs">
              <h3>{formatEntityTitle(selectedEntityParts, anomaly.name)}</h3>
            </EuiTitle>
            <EuiHorizontalRule margin="s" />
            <SelectedAnomalySummaryMetrics
              point={selectedPoint}
              relatedPoints={selectedEntityPoints}
            />
            <EuiSpacer size="m" />
            <SafeChart>
              <DetectorGradeConfidenceChart
                data={gradeConfidenceData}
                annotations={anomalyAnnotations}
                timeDomain={detailChartTimeDomain}
                height={230}
              />
            </SafeChart>
          </EuiPanel>
        </>
      )}

      <EuiSpacer size="m" />
      <EuiPanel hasBorder paddingSize="m">
        <EuiTitle size="xs">
          <h3>
            <FormattedMessage
              id="observability.alerting.anomalyDetailFlyout.featureBreakdown"
              defaultMessage="Feature breakdown"
            />
          </h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiPanel hasBorder={false} color="subdued" paddingSize="m">
          <EuiText size="s">
            <strong>{selectedFeature?.name || '\u2014'}</strong>
          </EuiText>
          <EuiSpacer size="xs" />
          <EuiText size="xs" color="subdued">
            <FormattedMessage
              id="observability.alerting.anomalyDetailFlyout.featureMeta"
              defaultMessage="Field: detector feature - Aggregation method: detector output - State: enabled"
            />
          </EuiText>
          <EuiSpacer size="s" />
          {selectedFeature ? (
            <SafeChart>
              <DetectorFeatureChart
                data={featureData}
                annotations={anomalyAnnotations}
                timeDomain={detailChartTimeDomain}
                height={200}
              />
            </SafeChart>
          ) : (
            <EuiText size="s" color="subdued">
              <FormattedMessage
                id="observability.alerting.anomalyDetailFlyout.noFeatureData"
                defaultMessage="Feature data is not available for this anomaly."
              />
            </EuiText>
          )}
        </EuiPanel>
      </EuiPanel>

      <EuiSpacer size="m" />
      <EuiAccordion
        id={`anomalyDetails-${anomaly.id}`}
        buttonContent={
          <strong>
            <FormattedMessage
              id="observability.alerting.anomalyDetailFlyout.anomalyDetails"
              defaultMessage="Details"
            />
          </strong>
        }
        initialIsOpen={false}
        paddingSize="m"
      >
        <EuiDescriptionList
          type="column"
          compressed
          listItems={[
            {
              title: i18n.translate('observability.alerting.anomalyDetailFlyout.resultId', {
                defaultMessage: 'Result ID',
              }),
              description: labels.anomaly_result_id || anomaly.id || '\u2014',
            },
            {
              title: i18n.translate('observability.alerting.anomalyDetailFlyout.detector', {
                defaultMessage: 'Detector',
              }),
              description: detectorResultsHref ? (
                <EuiLink onClick={navigateToDetectorResults}>{detectorName}</EuiLink>
              ) : (
                detectorName
              ),
            },
            {
              title: i18n.translate('observability.alerting.anomalyDetailFlyout.datasource', {
                defaultMessage: 'Datasource',
              }),
              description: dsName,
            },
            {
              title: i18n.translate('observability.alerting.anomalyDetailFlyout.started', {
                defaultMessage: 'Data start',
              }),
              description: anomaly.startTime
                ? formatDateTime(new Date(anomaly.startTime))
                : '\u2014',
            },
            {
              title: i18n.translate('observability.alerting.anomalyDetailFlyout.ended', {
                defaultMessage: 'Data end',
              }),
              description: anomaly.lastUpdated
                ? formatDateTime(new Date(anomaly.lastUpdated))
                : '\u2014',
            },
            {
              title: i18n.translate('observability.alerting.anomalyDetailFlyout.duration', {
                defaultMessage: 'Duration',
              }),
              description: getDuration(anomaly.startTime, anomaly.lastUpdated),
            },
          ]}
        />
      </EuiAccordion>

      <EuiSpacer size="m" />
      <EuiAccordion
        id={`anomalyRaw-${anomaly.id}`}
        buttonContent={
          <strong>
            <FormattedMessage
              id="observability.alerting.anomalyDetailFlyout.rawFindingData"
              defaultMessage="Raw anomaly data"
            />
          </strong>
        }
        initialIsOpen={false}
        paddingSize="m"
      >
        <EuiCodeBlock language="json" fontSize="s" paddingSize="m" isCopyable>
          {JSON.stringify(anomaly, null, 2)}
        </EuiCodeBlock>
      </EuiAccordion>
    </>
  );
};

export const AnomalyDetailFlyout: React.FC<AnomalyDetailFlyoutProps> = ({
  anomaly,
  datasources,
  allFindings = [],
  onClose,
}) => {
  const labels = anomaly.labels || {};
  const detectorId = labels.detector_id || anomaly.monitorId;
  const detectorName = labels.detector_name || detectorId || '\u2014';
  const entity = labels.entity || '';
  const selectedEntityParts = parseEntity(entity);
  const detectorResultsHref = useMemo(
    () => (detectorId ? buildDetectorResultsHref(detectorId, anomaly.datasourceId) : undefined),
    [anomaly.datasourceId, detectorId]
  );
  const isHighCardinalityDetector = Boolean(entity);

  const navigateToDetectorResults = () => {
    if (!detectorResultsHref) return;
    onClose();
    window.location.assign(detectorResultsHref);
  };

  return (
    <EuiFlyout onClose={onClose} size="l" ownFocus aria-labelledby="anomalyDetailTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem>
            <EuiTitle size="m">
              <h2 id="anomalyDetailTitle">
                <FormattedMessage
                  id="observability.alerting.anomalyDetailFlyout.header"
                  defaultMessage="Anomaly overview"
                />
              </h2>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiText size="s" color="subdued">
              <FormattedMessage
                id="observability.alerting.anomalyDetailFlyout.subtitle"
                defaultMessage="{detectorName} - {entity}"
                values={{
                  detectorName,
                  entity:
                    isHighCardinalityDetector && selectedEntityParts.value
                      ? `${selectedEntityParts.field}: ${selectedEntityParts.value}`
                      : i18n.translate('observability.alerting.anomalyDetailFlyout.singleStream', {
                          defaultMessage: 'Single stream',
                        }),
                }}
              />
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap>
              <EuiFlexItem grow={false}>
                <EuiBadge color="accent">
                  <FormattedMessage
                    id="observability.alerting.anomalyDetailFlyout.typeBadge"
                    defaultMessage="Anomaly"
                  />
                </EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiHealth color={STATE_COLORS[anomaly.state] || 'subdued'}>
                  {anomaly.state}
                </EuiHealth>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color={SEVERITY_COLORS[anomaly.severity] || 'default'}>
                  {anomaly.severity}
                </EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <AnomalyDetailContent
          anomaly={anomaly}
          datasources={datasources}
          allFindings={allFindings}
          onNavigateToDetectorResults={navigateToDetectorResults}
        />
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose}>
              <FormattedMessage
                id="observability.alerting.anomalyDetailFlyout.closeButton"
                defaultMessage="Close"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
          {detectorResultsHref && (
            <EuiFlexItem grow={false}>
              <EuiButton fill size="s" iconType="popout" onClick={navigateToDetectorResults}>
                <FormattedMessage
                  id="observability.alerting.anomalyDetailFlyout.openDetectorResultsFooter"
                  defaultMessage="Open detector results"
                />
              </EuiButton>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};

const SelectedAnomalySummaryMetrics: React.FC<{
  point: AnomalyPoint;
  relatedPoints: AnomalyPoint[];
}> = ({ point, relatedPoints }) => {
  const sortedRelatedPoints = [...relatedPoints].sort((a, b) => a.time - b.time);
  const selectedIndex = sortedRelatedPoints.findIndex((candidate) => candidate.id === point.id);
  const totalOccurrences = Math.max(sortedRelatedPoints.length, 1);
  const selectedOccurrence = selectedIndex >= 0 ? selectedIndex + 1 : 1;
  const occurrenceValue =
    totalOccurrences > 1
      ? `${selectedOccurrence} of ${totalOccurrences}`
      : String(selectedOccurrence);

  return (
    <EuiFlexGroup responsive wrap>
      <SummaryMetric
        label={i18n.translate('observability.alerting.anomalyDetailFlyout.selectedOccurrence', {
          defaultMessage: 'Selected occurrence',
        })}
        value={occurrenceValue}
      />
      <SummaryMetric
        label={i18n.translate('observability.alerting.anomalyDetailFlyout.selectedGrade', {
          defaultMessage: 'Anomaly grade',
        })}
        value={formatFixed(point.grade)}
      />
      <SummaryMetric
        label={i18n.translate('observability.alerting.anomalyDetailFlyout.selectedConfidence', {
          defaultMessage: 'Confidence',
        })}
        value={formatFixed(point.confidence)}
      />
      <SummaryMetric
        label={i18n.translate('observability.alerting.anomalyDetailFlyout.selectedTime', {
          defaultMessage: 'Selected anomaly time',
        })}
        value={formatDateTime(point.time)}
      />
    </EuiFlexGroup>
  );
};

const SummaryMetric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <EuiFlexItem grow={1}>
    <EuiPanel color="subdued" hasBorder={false} paddingSize="s">
      <EuiText size="xs" color="subdued">
        {label}
      </EuiText>
      <EuiSpacer size="xs" />
      <EuiText size="s">
        <strong>{value}</strong>
      </EuiText>
    </EuiPanel>
  </EuiFlexItem>
);

interface ChartErrorBoundaryState {
  error?: Error;
}

class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ChartErrorBoundaryState
> {
  public state: ChartErrorBoundaryState = {};

  public static getDerivedStateFromError(error: Error): ChartErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error) {
    // Keep the rest of the flyout usable if a chart option is rejected at runtime.
    console.error('Failed to render anomaly chart:', error);
  }

  public render() {
    if (this.state.error) {
      return (
        <EuiPanel color="subdued" hasBorder={false} paddingSize="m">
          <EuiText size="s" color="subdued">
            <FormattedMessage
              id="observability.alerting.anomalyDetailFlyout.chartRenderError"
              defaultMessage="Chart could not be rendered: {message}"
              values={{ message: this.state.error.message }}
            />
          </EuiText>
        </EuiPanel>
      );
    }

    return this.props.children;
  }
}

const SafeChart: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ChartErrorBoundary>{children}</ChartErrorBoundary>
);

const DetectorHeatmapChart: React.FC<{ data: PlotData[] }> = ({ data }) => {
  const entityCount = Math.max(1, ((data[0]?.y as unknown[]) || []).length);
  return (
    <PlotComponent
      data={data}
      style={{ position: 'relative', width: '100%' }}
      layout={{
        height: 65 + HEATMAP_CELL_HEIGHT * entityCount,
        xaxis: {
          showline: true,
          nticks: 5,
          showgrid: false,
          ticklen: 11,
          fixedrange: true,
        },
        yaxis: {
          showline: true,
          showgrid: false,
          fixedrange: true,
          automargin: true,
          type: 'category',
          tickmode: 'array',
          tickvals: data[0]?.y,
          ticktext: ((data[0]?.y as string[]) || []).map(truncateHeatmapLabel),
        },
        margin: {
          l: 100,
          r: 0,
          t: 0,
          b: 50,
          pad: 2,
        },
      }}
      config={{
        responsive: true,
        displayModeBar: false,
        scrollZoom: false,
        displaylogo: false,
      }}
      useResizeHandler
    />
  );
};

const DetectorGradeConfidenceChart: React.FC<{
  data: GradeConfidenceDatum[];
  annotations: AnnotationDatum[];
  timeDomain: TimeDomain;
  height: number;
}> = ({ data, annotations, timeDomain, height }) => {
  const timeFormatter = niceTimeFormatter([timeDomain.min, timeDomain.max]);
  return (
    <div style={{ height, width: '100%' }}>
      <Chart key={`${timeDomain.min}-${timeDomain.max}-${data.length}`}>
        <Settings
          showLegend
          showLegendExtra={false}
          showLegendDisplayValue={false}
          legendPosition={Position.Right}
          theme={ANOMALY_CHART_THEME}
          xDomain={{ min: timeDomain.min, max: timeDomain.max }}
        />
        <RectAnnotation
          dataValues={annotations}
          id="featureAttributionAnnotation"
          style={{
            stroke: AD_CHART_COLORS.ANOMALY_GRADE_COLOR,
            strokeWidth: 1,
            opacity: 0.1,
            fill: AD_CHART_COLORS.ANOMALY_GRADE_COLOR,
          }}
        />
        <Axis id="bottom" position="bottom" tickFormat={timeFormatter} />
        <Axis
          id="left"
          title="Anomaly grade / Confidence"
          position="left"
          domain={{ min: 0, max: 1 }}
          showGridLines
        />
        <LineSeries
          id="Confidence"
          name="Confidence"
          color={AD_CHART_COLORS.CONFIDENCE_COLOR}
          xScaleType={ScaleType.Time}
          yScaleType={ScaleType.Linear}
          xAccessor="plotTime"
          yAccessors={['confidence']}
          data={data}
        />
        <LineSeries
          id="Anomaly grade"
          name="Anomaly grade"
          color={AD_CHART_COLORS.ANOMALY_GRADE_COLOR}
          xScaleType={ScaleType.Time}
          yScaleType={ScaleType.Linear}
          xAccessor="plotTime"
          yAccessors={['anomalyGrade']}
          data={data}
        />
      </Chart>
    </div>
  );
};

const DetectorFeatureChart: React.FC<{
  data: FeatureChartDatum[];
  annotations: AnnotationDatum[];
  timeDomain: TimeDomain;
  height: number;
}> = ({ data, annotations, timeDomain, height }) => {
  const timeFormatter = niceTimeFormatter([timeDomain.min, timeDomain.max]);
  const hasExpectedValue = data.some((datum) => datum.expectedValue !== undefined);
  return (
    <div style={{ height, width: '100%' }}>
      <Chart key={`${timeDomain.min}-${timeDomain.max}-${data.length}`}>
        <Settings
          showLegend
          showLegendExtra={false}
          showLegendDisplayValue={false}
          legendPosition={Position.Right}
          theme={FEATURE_CHART_THEME}
          xDomain={{ min: timeDomain.min, max: timeDomain.max }}
        />
        <RectAnnotation
          dataValues={annotations}
          id="annotations"
          style={{
            stroke: '#D5DBDB',
            strokeWidth: 1,
            opacity: 0.8,
            fill: '#D5DBDB',
          }}
        />
        <Axis id="left" title="Feature output" position="left" showGridLines />
        <Axis id="bottom" position="bottom" tickFormat={timeFormatter} />
        <LineSeries
          id="Feature output"
          name="Feature output"
          color={AD_CHART_COLORS.FEATURE_DATA_COLOR}
          xScaleType={ScaleType.Time}
          yScaleType={ScaleType.Linear}
          xAccessor="plotTime"
          yAccessors={['data']}
          data={data}
        />
        {hasExpectedValue ? (
          <LineSeries
            id="ExpectedValue"
            name="Expected Value"
            color={AD_CHART_COLORS.EXPECTED_VALUE_COLOR}
            xScaleType={ScaleType.Time}
            yScaleType={ScaleType.Linear}
            xAccessor="plotTime"
            yAccessors={['expectedValue']}
            data={data}
          />
        ) : null}
      </Chart>
    </div>
  );
};

function buildDetectorResultsHref(detectorId: string, dataSourceId?: string): string {
  const params = new URLSearchParams({
    from: '0',
    size: '20',
    search: '',
    indices: '',
    sortField: 'name',
    sortDirection: 'asc',
    dataSourceId: dataSourceId || '',
  });
  return `${getCurrentWorkspaceBasePath()}/app/${AD_APP_ID}#/detectors/${encodeURIComponent(
    detectorId
  )}/results?${params.toString()}`;
}

function getCurrentWorkspaceBasePath(): string {
  if (typeof window === 'undefined') return '';
  const appIndex = window.location.pathname.indexOf('/app/');
  return appIndex >= 0 ? window.location.pathname.slice(0, appIndex) : '';
}

function toAnomalyPoint(anomaly: UnifiedAlertSummary): AnomalyPoint {
  const annotations = anomaly.annotations || {};
  const entity = anomaly.labels?.entity || anomaly.name;
  const parsedStartTime = new Date(
    anomaly.startTime || anomaly.lastUpdated || Date.now()
  ).getTime();
  const parsedEndTime = new Date(anomaly.lastUpdated || anomaly.startTime || Date.now()).getTime();
  const startTime = Number.isFinite(parsedStartTime) ? parsedStartTime : Date.now();
  const endTime =
    Number.isFinite(parsedEndTime) && parsedEndTime >= startTime ? parsedEndTime : startTime;
  return {
    id: anomaly.id,
    name: anomaly.name,
    entity,
    entityParts: parseEntity(entity),
    startTime,
    endTime,
    time: endTime,
    grade: parseOptionalNumber(annotations.anomaly_grade) ?? 0,
    score: parseOptionalNumber(annotations.anomaly_score) ?? 0,
    confidence: parseOptionalNumber(annotations.confidence),
    threshold: parseOptionalNumber(annotations.threshold),
    features: parseFeatureData(annotations.feature_data),
  };
}

function hasEntityDimension(point: AnomalyPoint): boolean {
  return point.entityParts.field !== 'Entity' && Boolean(point.entityParts.value);
}

function buildHeatmapData(
  points: AnomalyPoint[],
  selectedPoint: AnomalyPoint,
  timeDomain: TimeDomain
): PlotData[] {
  const plotPoints = points.length > 0 ? points : [selectedPoint];
  const timeWindows = buildHeatmapTimeWindows(timeDomain);
  const selectedEntity = getHeatmapEntityLabel(selectedPoint);
  const entities = buildHeatmapEntities(plotPoints, selectedEntity);
  const x = timeWindows.map((window) => formatAxisDate(window.min));
  const cellTimeInterval = timeWindows[0]?.max - timeWindows[0]?.min || MINUTE_MS;
  const z = entities.map((entity) =>
    timeWindows.map((window, windowIndex) => {
      const pointsInCell = getPointsInHeatmapCell(
        plotPoints,
        entity,
        window,
        windowIndex === timeWindows.length - 1
      );
      const grades = pointsInCell.map((point) => point.grade).filter(Number.isFinite);
      return grades.length > 0 ? Math.max(...grades) : 0;
    })
  );
  const anomalyOccurrences = entities.map((entity) =>
    timeWindows.map(
      (window, windowIndex) =>
        getPointsInHeatmapCell(
          plotPoints,
          entity,
          window,
          windowIndex === timeWindows.length - 1
        ).filter((point) => point.grade > 0).length
    )
  );
  const entityLists = entities.map((entity) => [{ value: entity }]);
  const baseData = {
    x,
    y: entities,
    z,
    colorscale: ANOMALY_HEATMAP_COLORSCALE,
    zmin: 0,
    zmax: 1,
    type: 'heatmap',
    showscale: false,
    xgap: 2,
    ygap: 2,
    opacity: 0.3,
    text: anomalyOccurrences,
    customdata: entityLists,
    hovertemplate:
      '<b>Entities</b>: %{y}<br>' +
      '<b>Time</b>: %{x}<br>' +
      '<b>Max anomaly grade</b>: %{z}<br>' +
      '<b>Anomaly occurrences</b>: %{text}' +
      '<extra></extra>',
    cellTimeInterval,
  } as PlotData;
  const selectedY = entities.indexOf(selectedEntity);
  const selectedX = findHeatmapWindowIndex(timeWindows, selectedPoint.time);

  if (selectedY < 0 || selectedX < 0) {
    return [baseData];
  }

  const selectedValue = Math.max(selectedPoint.grade, 0.0000001);
  const selectedZData = z.map((row, rowIndex) =>
    row.map((_, columnIndex) =>
      rowIndex === selectedY && columnIndex === selectedX ? selectedValue : null
    )
  );
  const selectedColor = getHeatmapColorByValue(selectedValue);
  const selectedData = {
    ...baseData,
    z: selectedZData,
    colorscale: [
      [0, selectedColor],
      [1, selectedColor],
    ],
    opacity: 1,
    hoverinfo: 'skip',
    hovertemplate: undefined,
  } as PlotData;

  return [baseData, selectedData];
}

function buildGradeConfidenceData(
  points: AnomalyPoint[],
  timeDomain: TimeDomain
): GradeConfidenceDatum[] {
  const visiblePoints = [...points]
    .filter((point) => isInDomain(point.time, timeDomain))
    .sort((a, b) => a.time - b.time);
  const confidenceFallback =
    visiblePoints.find((point) => point.confidence !== undefined)?.confidence ?? null;
  const data: GradeConfidenceDatum[] = [
    {
      plotTime: timeDomain.min,
      anomalyGrade: 0,
      confidence: confidenceFallback,
    },
  ];

  visiblePoints.forEach((point) => {
    const confidence = point.confidence ?? confidenceFallback;
    const leftBase = clamp(point.time - SPIKE_HALF_WIDTH_MS, timeDomain.min, timeDomain.max);
    const rightBase = clamp(point.time + SPIKE_HALF_WIDTH_MS, timeDomain.min, timeDomain.max);
    data.push(
      { plotTime: leftBase, anomalyGrade: 0, confidence },
      { plotTime: point.time, anomalyGrade: point.grade, confidence },
      { plotTime: rightBase, anomalyGrade: 0, confidence }
    );
  });

  data.push({
    plotTime: timeDomain.max,
    anomalyGrade: 0,
    confidence:
      [...visiblePoints].reverse().find((point) => point.confidence !== undefined)?.confidence ??
      confidenceFallback,
  });

  return data.sort((a, b) => a.plotTime - b.plotTime);
}

function buildFeatureChartData(
  points: AnomalyPoint[],
  featureName: string | undefined,
  timeDomain: TimeDomain
): FeatureChartDatum[] {
  const featureValues = [...points]
    .sort((a, b) => a.time - b.time)
    .map((point) => {
      const feature = point.features.find((candidate) => candidate.name === featureName);
      return feature ? { time: point.time, value: feature.value } : undefined;
    })
    .filter((value): value is { time: number; value: number } => !!value)
    .filter((value) => isInDomain(value.time, timeDomain));
  const data: FeatureChartDatum[] = [{ plotTime: timeDomain.min, data: 0, expectedValue: 0 }];

  featureValues.forEach((point) => {
    const leftBase = clamp(point.time - SPIKE_HALF_WIDTH_MS, timeDomain.min, timeDomain.max);
    const rightBase = clamp(point.time + SPIKE_HALF_WIDTH_MS, timeDomain.min, timeDomain.max);
    data.push(
      { plotTime: leftBase, data: 0, expectedValue: 0 },
      { plotTime: point.time, data: point.value, expectedValue: 0 },
      { plotTime: rightBase, data: 0, expectedValue: 0 }
    );
  });

  data.push({ plotTime: timeDomain.max, data: 0, expectedValue: 0 });
  return data.sort((a, b) => a.plotTime - b.plotTime);
}

function buildAnomalyAnnotations(
  points: AnomalyPoint[],
  timeDomain: TimeDomain
): AnnotationDatum[] {
  return points
    .filter((point) => isInDomain(point.time, timeDomain))
    .map((point) => {
      const x0 = clamp(point.time - SPIKE_HALF_WIDTH_MS, timeDomain.min, timeDomain.max);
      const x1 = clamp(point.time + SPIKE_HALF_WIDTH_MS, timeDomain.min, timeDomain.max);
      return {
        coordinates: {
          x0,
          x1: Math.max(x0 + MINUTE_MS, x1),
        },
        details: i18n.translate('observability.alerting.anomalyDetailFlyout.annotationDetails', {
          defaultMessage: 'Anomaly from {start} to {end}',
          values: {
            start: formatDateTime(point.startTime),
            end: formatDateTime(point.endTime),
          },
        }),
      };
    });
}

function buildFocusedDetailChartTimeDomain(selectedTime: number): TimeDomain {
  const selected = Number.isFinite(selectedTime) ? selectedTime : Date.now();
  return {
    min: selected - DETAIL_CHART_CONTEXT_RADIUS_MS,
    max: selected + DETAIL_CHART_CONTEXT_RADIUS_MS,
  };
}

function buildChartTimeDomain(points: AnomalyPoint[], selectedTime: number): TimeDomain {
  const selected = Number.isFinite(selectedTime) ? selectedTime : Date.now();
  const times = [selected, ...points.map((point) => point.time)].filter(Number.isFinite);
  const latest = Math.max(...times);
  let max = roundUpToInterval(latest + HEATMAP_CONTEXT_TRAILING_PADDING_MS, HOUR_MS);
  let min = max - HEATMAP_CONTEXT_RANGE_MS;

  if (selected < min || selected > max) {
    max = roundUpToInterval(selected + HEATMAP_CONTEXT_TRAILING_PADDING_MS, HOUR_MS);
    min = max - HEATMAP_CONTEXT_RANGE_MS;
  }

  return { min, max };
}

function isInDomain(time: number, timeDomain: TimeDomain): boolean {
  return time >= timeDomain.min && time <= timeDomain.max;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundUpToInterval(value: number, interval: number): number {
  return Math.ceil(value / interval) * interval;
}

function buildHeatmapTimeWindows(timeDomain: TimeDomain): TimeDomain[] {
  const range = Math.max(timeDomain.max - timeDomain.min, MINUTE_MS);
  const interval = Math.max(Math.ceil(range / HEATMAP_BUCKET_COUNT), MINUTE_MS);
  const windows: TimeDomain[] = [];

  for (let currentTime = timeDomain.min; currentTime < timeDomain.max; currentTime += interval) {
    windows.push({
      min: currentTime,
      max: Math.min(currentTime + interval, timeDomain.max),
    });
  }

  return windows.length > 0 ? windows : [{ min: timeDomain.min, max: timeDomain.max }];
}

function buildHeatmapEntities(points: AnomalyPoint[], selectedEntity: string): string[] {
  const entityTotals = new Map<string, number>();
  points.forEach((point) => {
    const entity = getHeatmapEntityLabel(point);
    entityTotals.set(entity, Math.max(entityTotals.get(entity) || 0, point.grade));
  });

  const sortedEntities = Array.from(entityTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([entity]) => entity);
  const topEntities = sortedEntities.slice(0, HEATMAP_MAX_ENTITIES);
  const entities = topEntities.includes(selectedEntity)
    ? topEntities
    : [selectedEntity, ...topEntities].slice(0, HEATMAP_MAX_ENTITIES);

  return entities.reverse();
}

function getHeatmapEntityLabel(point: AnomalyPoint): string {
  return point.entityParts.value || point.entity || point.name || 'Entity';
}

function getPointsInHeatmapCell(
  points: AnomalyPoint[],
  entity: string,
  window: TimeDomain,
  isLastWindow: boolean
): AnomalyPoint[] {
  return points.filter((point) => {
    if (getHeatmapEntityLabel(point) !== entity) return false;
    return (
      point.time >= window.min &&
      (point.time < window.max || (isLastWindow && point.time <= window.max))
    );
  });
}

function findHeatmapWindowIndex(windows: TimeDomain[], time: number): number {
  return windows.findIndex((window, index) => {
    const isLastWindow = index === windows.length - 1;
    return time >= window.min && (time < window.max || (isLastWindow && time <= window.max));
  });
}

function getHeatmapColorByValue(value: number): string {
  if (value >= ANOMALY_HEATMAP_COLORSCALE[ANOMALY_HEATMAP_COLORSCALE.length - 1][0]) {
    return ANOMALY_HEATMAP_COLORSCALE[ANOMALY_HEATMAP_COLORSCALE.length - 1][1];
  }

  if (value <= ANOMALY_HEATMAP_COLORSCALE[0][0]) {
    return ANOMALY_HEATMAP_COLORSCALE[0][1];
  }

  for (let index = 0; index < ANOMALY_HEATMAP_COLORSCALE.length - 1; index++) {
    if (
      value >= ANOMALY_HEATMAP_COLORSCALE[index][0] &&
      value < ANOMALY_HEATMAP_COLORSCALE[index + 1][0]
    ) {
      return ANOMALY_HEATMAP_COLORSCALE[index + 1][1];
    }
  }

  return ANOMALY_HEATMAP_COLORSCALE[ANOMALY_HEATMAP_COLORSCALE.length - 1][1];
}

function truncateHeatmapLabel(label: string): string {
  return label.length > 28 ? `${label.slice(0, 25)}...` : label;
}

function parseEntity(entity?: string): EntityParts {
  if (!entity) return { field: 'Entity', value: '' };
  const separator = entity.indexOf('=');
  if (separator < 0) return { field: 'Entity', value: entity };
  return {
    field: entity.slice(0, separator) || 'Entity',
    value: entity.slice(separator + 1) || entity,
  };
}

function formatEntityTitle(entity: EntityParts, fallback: string): string {
  if (!entity.value) return fallback;
  return `${entity.field}: ${entity.value}`;
}

function parseFeatureData(featureData?: string): FeatureValue[] {
  if (!featureData) return [];
  return featureData
    .split(',')
    .map((part) => part.trim())
    .map((part) => {
      const separator = part.indexOf('=');
      const name = separator >= 0 ? part.slice(0, separator).trim() : part;
      const rawValue = separator >= 0 ? part.slice(separator + 1).trim() : '';
      const value = Number(rawValue);
      return Number.isFinite(value) ? { name: name || 'feature', value } : undefined;
    })
    .filter((value): value is FeatureValue => !!value);
}

function parseOptionalNumber(value?: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatFixed(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return '\u2014';
  return value.toFixed(2);
}

function formatDateTime(value: number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '\u2014';
  return date.toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAxisDate(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDuration(startTime?: string, endTime?: string): string {
  if (!startTime || !endTime) return '\u2014';
  const ms = new Date(endTime).getTime() - new Date(startTime).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '\u2014';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
