/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { scaleLinear } from 'd3-scale';
import throttle from 'lodash/throttle';
import classNames from 'classnames';
import {
  EuiText,
  EuiButtonIcon,
  EuiSelectable,
  EuiSelectableOption,
  EuiIcon,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiEmptyPrompt,
} from '@elastic/eui';
import './span_detail_timeline.scss';
import { TraceAnalyticsMode } from '../../../../../../common/types/trace_analytics';
import { parseHits } from '../../common/helper_functions';
import { Span, TraceFilter } from '../../common/constants';
import { SpanWithChildren } from './types';
import { TimelineMinimap } from './timeline_minimap';
import { TimelineRow } from './timeline_row';
import {
  DEFAULT_DOMAIN,
  MINIMAP_HEIGHT,
  RULER_HEIGHT,
  isDefaultDomain,
  buildHierarchy,
  getStartTimeInMs,
  getDurationInMs,
} from './utils';

interface SpanDetailTimelineProps {
  mode: TraceAnalyticsMode;
  payloadData: string;
  colorMap: Record<string, string>;
  onSpanClick: (spanId: string) => void;
  filters: TraceFilter[];
  compact?: boolean;
}

export function SpanDetailTimeline(props: SpanDetailTimelineProps) {
  const [collapsedSpans, setCollapsedSpans] = useState<Set<string>>(new Set());
  const [showCollapseButton, setShowCollapseButton] = useState(true);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [selection, setSelection] = useState<{ start?: number; end?: number }>({});
  const [selectedDomain, setSelectedDomain] = useState<[number, number]>(DEFAULT_DOMAIN);
  const [options, setOptions] = useState<EuiSelectableOption[]>([]);

  const isCompact = props.compact;

  const { spans, min, max } = useMemo(() => {
    if (!props.payloadData) return { spans: [], min: 0, max: 0 };

    let spanList: Span[] = [];
    let minTime = Number.POSITIVE_INFINITY;
    let maxTime = Number.NEGATIVE_INFINITY;

    parseHits(props.payloadData).forEach((hit) => {
      const span = hit._source;
      spanList.push(span);

      const minStartTime = getStartTimeInMs(props.mode, span);
      const duration = getDurationInMs(props.mode, span);

      minTime = Math.min(minTime, minStartTime);
      maxTime = Math.max(maxTime, minStartTime + duration);
    });

    if (props.filters.length > 0) {
      spanList = spanList.filter((span) => {
        return props.filters.every(({ field, value }) => (span as any)[field] === value);
      });
    }

    const hierarchy = buildHierarchy(props.mode, spanList);
    return {
      spans: hierarchy,
      min: minTime,
      max: maxTime,
    };
  }, [props.payloadData, props.filters, props.mode]);

  // Get service names from spans and initialize filter options
  const serviceOptions = useMemo(() => {
    const extractServiceNamesAndCounts = (spanList: SpanWithChildren[]): Map<string, number> => {
      const serviceCounts = new Map<string, number>();
      const traverse = (_spanList: SpanWithChildren[]) => {
        _spanList.forEach((span) => {
          serviceCounts.set(span.serviceName, (serviceCounts.get(span.serviceName) || 0) + 1);
          if (span.children.length > 0) {
            traverse(span.children);
          }
        });
      };
      traverse(spanList);
      return serviceCounts;
    };

    const serviceNameCounts = extractServiceNamesAndCounts(spans);
    const serviceNames: EuiSelectableOption[] = Array.from(serviceNameCounts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([serviceName, count]) => ({
        key: serviceName,
        label: `${serviceName} (${count})`,
        prepend: <EuiIcon type="dot" color={props.colorMap[serviceName]} />,
      }));
    return serviceNames;
  }, [spans, props.colorMap]);

  // Initialize options with service names on first load
  useEffect(() => {
    if (options.length === 0 && serviceOptions.length > 0) {
      setOptions(serviceOptions);
    }
  }, [serviceOptions, options.length]);

  // Get currently selected services
  const selectedServices = useMemo(() => {
    const checkedOptions = options.filter((option) => option.checked === 'on');

    // If no services are checked, select all services
    if (checkedOptions.length === 0) {
      return new Set(
        options.map((option) => option.key).filter((key): key is string => key !== undefined)
      );
    }

    return new Set(
      checkedOptions.map((option) => option.key).filter((key): key is string => key !== undefined)
    );
  }, [options]);

  // Default is min width of reset button + 8px padding
  const [collapsibleColumnWidth, setCollapsibleColumnWidth] = useState<number>(112 + 8);

  const timeScale = useMemo(() => {
    const totalRange = max - min;
    const currentStartTime = (selectedDomain[0] / 100) * totalRange;
    const currentEndTime = (selectedDomain[1] / 100) * totalRange;

    const scale = scaleLinear().domain([currentStartTime, currentEndTime]).range([0, 100]);
    if (isDefaultDomain(selectedDomain)) {
      return scale.nice();
    }
    return scale;
  }, [selectedDomain, min, max]);

  const minimapScale = useMemo(() => {
    return scaleLinear()
      .domain([0, max - min])
      .range([0, 100]);
  }, [min, max]);

  const handleMinimapDomainUpdate = (newDomain: [number, number]) => {
    setSelectedDomain(newDomain);
  };

  const throttledSelectionUpdate = useMemo(
    () =>
      throttle((newSelection: { start?: number; end?: number }) => {
        setSelection(newSelection);
      }, Math.round(1000 / 60)),
    []
  );

  useEffect(() => {
    return () => {
      throttledSelectionUpdate.cancel();
    };
  }, [throttledSelectionUpdate]);

  const handleToggleCollapse = useCallback((spanId: string) => {
    setCollapsedSpans((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(spanId)) {
        newSet.delete(spanId);
      } else {
        newSet.add(spanId);
      }
      return newSet;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setCollapsedSpans(new Set());
    setShowCollapseButton(true);
  }, []);

  const handleCollapseAll = useCallback(() => {
    const collectSpansWithChildren = (spanList: SpanWithChildren[]): string[] => {
      const spansWithChildren: string[] = [];
      const traverse = (_spanList: SpanWithChildren[]) => {
        _spanList.forEach((span) => {
          if (span.children.length > 0) {
            spansWithChildren.push(span.spanId);
            traverse(span.children);
          }
        });
      };
      traverse(spanList);
      return spansWithChildren;
    };

    const allParentSpanIds = collectSpansWithChildren(spans);
    setCollapsedSpans(new Set(allParentSpanIds));
    setShowCollapseButton(false);
  }, [spans]);

  const ticks = useMemo(() => {
    return timeScale.ticks(isCompact ? 2 : isDefaultDomain(selectedDomain) ? 10 : 5);
  }, [timeScale, isCompact, selectedDomain]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!gridRef.current) return;

    const gridRect = gridRef.current.getBoundingClientRect();
    const gridLeft = gridRect.left;
    const gridRight = gridRect.right;
    const gridWidth = gridRect.width;

    if (e.clientX < gridLeft || e.clientX > gridRight) return;

    const dragStartPosition = (e.clientX - gridLeft) / gridWidth;
    setIsDragging(true);
    setDragStart(dragStartPosition);
    setSelection({ start: dragStartPosition, end: dragStartPosition });
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging || !gridRef.current || dragStart === null) return;

      const gridRect = gridRef.current.getBoundingClientRect();
      const gridLeft = gridRect.left;
      const gridWidth = gridRect.width;

      const currentPosition = Math.max(0, Math.min(1, (e.clientX - gridLeft) / gridWidth));
      const start = Math.min(dragStart, currentPosition);
      const end = Math.max(dragStart, currentPosition);

      // Use throttled update to reduce re-renders during dragging
      throttledSelectionUpdate({ start, end });
    },
    [isDragging, dragStart, throttledSelectionUpdate]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging && selection.start !== undefined && selection.end !== undefined) {
      const selectionStart = Math.min(selection.start, selection.end);
      const selectionEnd = Math.max(selection.start, selection.end);

      // Calculate the new domain relative to the current domain
      const currentDomainSize = selectedDomain[1] - selectedDomain[0];
      const newStart = selectedDomain[0] + selectionStart * currentDomainSize;
      const newEnd = selectedDomain[0] + selectionEnd * currentDomainSize;

      if (Math.abs(newStart - newEnd) > 2) {
        setSelectedDomain([newStart, newEnd]);
      }
    }
    setIsDragging(false);
    setDragStart(null);
    setSelection({});
    // Cancel any pending throttled updates
    throttledSelectionUpdate.cancel();
  }, [isDragging, selection, selectedDomain, throttledSelectionUpdate]);

  const gridRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseUp]);

  const onOptionsChange = (selectedOptions: EuiSelectableOption[]) => {
    setOptions(selectedOptions);
  };

  const isResetButtonDisabled = isDefaultDomain(selectedDomain) && collapsedSpans.size === 0;

  const handleReset = () => {
    setSelectedDomain(DEFAULT_DOMAIN);
    handleExpandAll();
  };

  if (!spans.length) {
    return (
      <EuiEmptyPrompt
        title={<h2>No spans found</h2>}
        body={<p>No spans found for the selected filters</p>}
      />
    );
  }

  return (
    <>
      <EuiFlexGroup direction="row" alignItems="flexStart" gutterSize="m">
        {!isCompact && (
          <EuiFlexItem grow={false} style={{ width: 280 }}>
            <EuiSelectable
              options={options}
              onChange={onOptionsChange}
              searchable
              searchProps={{
                placeholder: 'Service name',
                append: (
                  <EuiButtonIcon
                    size="xs"
                    iconType="refresh"
                    aria-label="Clear focus and service filter selection"
                    disabled={selectedServices.size === serviceOptions.length}
                    style={{
                      display: selectedServices.size === serviceOptions.length ? 'none' : undefined,
                    }}
                    onClick={() => {
                      setOptions(
                        serviceOptions.map((option) => ({
                          ...option,
                          checked: undefined,
                          isFocused: false,
                        }))
                      );
                    }}
                  />
                ),
              }}
              listProps={{
                bordered: true,
                'data-test-subj': 'service-filter-list',
              }}
              height={Math.min(400, options.length * 32)}
              data-test-subj="service-filter"
            >
              {(list, search) => (
                <>
                  {search}
                  {list}
                </>
              )}
            </EuiSelectable>
          </EuiFlexItem>
        )}
        <EuiFlexItem
          className="span-detail-timeline"
          data-test-subj="span-detail-timeline"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <div
            className="timeline-container"
            style={{
              gridTemplateColumns: isCompact ? '1fr' : 'auto 1fr',
            }}
          >
            <div
              ref={gridRef}
              className="timeline-grid"
              data-test-subj="timeline-grid"
              style={{
                display: collapsibleColumnWidth ? 'block' : 'none',
                top: MINIMAP_HEIGHT + RULER_HEIGHT,
                left: collapsibleColumnWidth,
              }}
            >
              {ticks.map((tick, index) => (
                <div
                  key={index}
                  data-test-subj="timeline-grid-line"
                  className={classNames('timeline-grid-line', {
                    'timeline-grid-line--transform-end': index === ticks.length - 1,
                  })}
                  style={{
                    left: `${timeScale(tick)}%`,
                  }}
                />
              ))}
              {selection.start !== undefined && selection.end !== undefined && (
                <div
                  className="timeline-selection"
                  data-test-subj="timeline-selection"
                  style={{
                    left: `${selection.start * 100}%`,
                    width: `${(selection.end - selection.start) * 100}%`,
                  }}
                />
              )}
            </div>
            <div
              className="timeline-controls"
              style={{
                display: isCompact ? 'none' : 'flex',
              }}
            >
              <EuiButton
                size="s"
                onClick={handleReset}
                data-test-subj="timeline-reset-button"
                isDisabled={isResetButtonDisabled}
                style={{
                  visibility: isResetButtonDisabled ? 'hidden' : 'visible',
                }}
              >
                Reset
              </EuiButton>
            </div>
            <TimelineMinimap
              ref={minimapRef}
              spans={spans}
              mode={props.mode}
              min={min}
              selectedDomain={selectedDomain}
              colorMap={props.colorMap}
              onDomainUpdate={handleMinimapDomainUpdate}
              scale={minimapScale}
              data-test-subj="timeline-minimap"
            />
            <div
              ref={(el) => {
                if (el) {
                  const width = el.getBoundingClientRect().width;
                  if (width > (collapsibleColumnWidth ?? 0)) {
                    setCollapsibleColumnWidth(width);
                  }
                }
              }}
              className="timeline-header"
              data-test-subj="timeline-controls"
              style={{
                display: isCompact ? 'none' : 'block',
                top: MINIMAP_HEIGHT,
                height: RULER_HEIGHT,
                minWidth: collapsibleColumnWidth ? collapsibleColumnWidth + 'px' : 'auto',
              }}
            >
              {showCollapseButton ? (
                <EuiButtonIcon
                  size="xs"
                  iconType="fold"
                  aria-label="Collapse all spans"
                  onClick={handleCollapseAll}
                />
              ) : (
                <EuiButtonIcon
                  size="xs"
                  iconType="unfold"
                  aria-label="Expand all spans"
                  onClick={handleExpandAll}
                />
              )}
            </div>
            <div
              className="timeline-header timeline-header--time"
              data-test-subj="timeline-ruler"
              style={{
                top: MINIMAP_HEIGHT,
                height: RULER_HEIGHT,
              }}
            >
              {ticks.map((tick, index) => {
                return (
                  <div
                    key={index}
                    data-test-subj="timeline-tick-mark"
                    className={classNames('timeline-tick-mark', {
                      'timeline-tick-mark--transform-end': index === ticks.length - 1,
                    })}
                    style={{
                      left: `${timeScale(tick)}%`,
                    }}
                  >
                    <EuiText
                      size="xs"
                      color="subdued"
                      data-test-subj="timeline-tick-label"
                      className={classNames('eui-textNoWrap', 'timeline-tick-label', {
                        'timeline-tick-label--transform-start': index === 0,
                        'timeline-tick-label--transform-end': index === ticks.length - 1,
                      })}
                    >
                      {`${tick} ms`}
                    </EuiText>
                  </div>
                );
              })}
            </div>
            {spans.map((span, index) => (
              <TimelineRow
                key={span.spanId}
                index={`${index}`}
                mode={props.mode}
                span={span}
                level={0}
                collapsedSpans={collapsedSpans}
                onToggleCollapse={handleToggleCollapse}
                onSpanClick={props.onSpanClick}
                colorMap={props.colorMap}
                scale={timeScale}
                min={min}
                compact={isCompact}
                selectedServices={selectedServices}
              />
            ))}
          </div>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
}
