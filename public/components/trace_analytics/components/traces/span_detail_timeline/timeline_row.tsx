/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import sortBy from 'lodash/sortBy';
import { EuiButtonEmpty, EuiText } from '@elastic/eui';
import { ScaleLinear } from 'd3-scale';

import { TraceAnalyticsMode } from '../../../../../../common/types/trace_analytics';
import { SpanWithChildren } from './types';
import {
  getStartTimeInMs,
  getDurationInMs,
  hasError,
  SPAN_ROW_INDENTATION_IN_PIXELS,
} from './utils';

interface TimelineRowProps {
  index: string;
  mode: TraceAnalyticsMode;
  span: SpanWithChildren;
  level: number;
  collapsedSpans: Set<string>;
  onToggleCollapse: (spanId: string) => void;
  onSpanClick: (spanId: string) => void;
  colorMap: Record<string, string>;
  scale: ScaleLinear<number, number>;
  min: number;
  compact?: boolean;
  selectedServices: Set<string>;
}

export const TimelineRow = React.memo<TimelineRowProps>(function TimelineRow({
  index,
  mode,
  span,
  level,
  collapsedSpans,
  onToggleCollapse,
  onSpanClick,
  colorMap,
  scale,
  min,
  compact,
  selectedServices,
}) {
  const start = scale(getStartTimeInMs(mode, span) - min);
  const end = scale(getDurationInMs(mode, span) + getStartTimeInMs(mode, span) - min);
  const barWidth = end - start;
  const hasChildren = span.children.length > 0;

  // Simple placement: start (left) if bar is in the left half, end (right) if bar is in the right half
  // Empty dependency array is intended to avoid replacement on domain/scale change
  const labelPlacement = useMemo(() => {
    return start + barWidth / 2 <= 50 ? 'start' : 'end';
  }, []);

  const handleToggle = () => onToggleCollapse(span.spanId);
  const handleSpanClick = () => onSpanClick(span.spanId);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  };

  const sortedChildren = useMemo(() => {
    return sortBy(span.children, (child) => getStartTimeInMs(mode, child));
  }, [span.children, mode]);

  return (
    <>
      {selectedServices.size > 0 && selectedServices.has(span.serviceName) && (
        <>
          <div
            role={hasChildren ? 'button' : undefined}
            data-index={index}
            data-test-subj={`timeline-row-${index}`}
            onClick={hasChildren ? handleToggle : undefined}
            onKeyDown={hasChildren ? handleKeyDown : undefined}
            tabIndex={hasChildren ? 0 : undefined}
            className="span-row"
            style={{
              paddingLeft: `${level * SPAN_ROW_INDENTATION_IN_PIXELS}px`,
              display: compact ? 'none' : 'block',
            }}
          >
            {Array.from({ length: level + 1 }, (_, i) => (
              <>
                {i !== 0 && (
                  <div
                    key={i}
                    className="span-connector span-connector--vertical"
                    style={{
                      left: `${i * SPAN_ROW_INDENTATION_IN_PIXELS}px`,
                    }}
                  />
                )}
                {i === level && (
                  <div
                    className="span-connector span-connector--horizontal"
                    style={{
                      left: `${i * SPAN_ROW_INDENTATION_IN_PIXELS}px`,
                    }}
                  />
                )}
              </>
            ))}
            <div className="span-toggle-container">
              {hasChildren && (
                <>
                  <EuiButtonEmpty
                    size="xs"
                    color="text"
                    iconType={collapsedSpans.has(span.spanId) ? 'arrowRight' : 'arrowDown'}
                    iconGap="s"
                    aria-label="Toggle collapse"
                    data-test-subj={`span-collapse-${span.spanId}`}
                  >
                    {`${span.children.length}`}
                  </EuiButtonEmpty>
                </>
              )}
            </div>
          </div>
          <div data-index={index} className="span-timeline-bar-container">
            <div
              className="span-timeline-bar"
              data-test-subj={`timeline-span-bar-${span.spanId}`}
              style={{
                backgroundColor: colorMap[span.serviceName],
                left: `${start}%`,
                width: `${barWidth}%`,
              }}
            >
              <button
                className="span-timeline-bar-button"
                onClick={handleSpanClick}
                aria-label="View span details"
                data-test-subj={`timeline-span-button-${span.spanId}`}
              />
            </div>
            <div
              className={`span-timeline-bar-label`}
              style={
                labelPlacement === 'start'
                  ? {
                      left: `${start}%`,
                    }
                  : {
                      left: `${end}%`,
                      transform: 'translateX(-100%)',
                    }
              }
            >
              <div className="eui-textNoWrap span-details">
                <EuiText size="xs">{span.name}</EuiText>
                <EuiText size="xs" color="subdued">
                  {getDurationInMs(mode, span)} ms
                </EuiText>
                {hasError(mode, span) && (
                  <EuiText size="xs" color="danger">
                    &nbsp;&#9888; Error
                  </EuiText>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      {!collapsedSpans.has(span.spanId) && (
        <>
          {sortedChildren.map((child, childIndex) => {
            return (
              <TimelineRow
                index={`${index}-${childIndex}`}
                key={child.spanId}
                mode={mode}
                span={child}
                level={level + 1}
                collapsedSpans={collapsedSpans}
                onToggleCollapse={onToggleCollapse}
                onSpanClick={onSpanClick}
                colorMap={colorMap}
                scale={scale}
                min={min}
                compact={compact}
                selectedServices={selectedServices}
              />
            );
          })}
        </>
      )}
    </>
  );
});
