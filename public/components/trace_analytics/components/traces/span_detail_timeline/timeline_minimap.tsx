/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import throttle from 'lodash/throttle';
import { ScaleLinear } from 'd3-scale';
import { TraceAnalyticsMode } from '../../../../../../common/types/trace_analytics';
import { drawSpansOnCanvas, MINIMAP_HEIGHT } from './utils';
import { SpanWithChildren } from './types';

interface TimelineMinimapProps {
  spans: SpanWithChildren[];
  mode: TraceAnalyticsMode;
  min: number;
  selectedDomain: [number, number];
  colorMap: Record<string, string>;
  onDomainUpdate: (newDomain: [number, number]) => void;
  scale: ScaleLinear<number, number>;
}

export const TimelineMinimap = React.forwardRef<HTMLDivElement, TimelineMinimapProps>(
  ({ spans, mode, min, selectedDomain, colorMap, onDomainUpdate, scale }, ref) => {
    const [isMinimapDragging, setIsMinimapDragging] = useState(false);
    const [dragType, setDragType] = useState<'move' | 'resize-left' | 'resize-right' | null>(null);
    const [dragStartPosition, setDragStartPosition] = useState<number>(0);
    const [initialDomain, setInitialDomain] = useState<[number, number]>([0, 100]);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const throttledDomainUpdate = useMemo(() => throttle(onDomainUpdate, 16), [onDomainUpdate]);

    useEffect(() => {
      return () => {
        throttledDomainUpdate.cancel();
      };
    }, [throttledDomainUpdate]);

    const handleMouseDown = (
      e: React.MouseEvent<HTMLDivElement>,
      type: 'move' | 'resize-left' | 'resize-right'
    ) => {
      e.stopPropagation();
      e.preventDefault();
      if (!ref || typeof ref === 'function' || !ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      const clickPosition = (e.clientX - rect.left) / rect.width;

      setIsMinimapDragging(true);
      setDragType(type);
      setDragStartPosition(clickPosition);
      setInitialDomain(selectedDomain);
    };

    const handleGeneralClick = (e: React.MouseEvent<HTMLDivElement>) => {
      // Only handle clicks outside the selection area
      if (!ref || typeof ref === 'function' || !ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      const clickPosition = ((e.clientX - rect.left) / rect.width) * 100;

      // Check if click is outside current selection
      if (clickPosition < selectedDomain[0] || clickPosition > selectedDomain[1]) {
        // Center the view around the click position
        const currentDomainSize = selectedDomain[1] - selectedDomain[0];
        const newStart = Math.max(0, clickPosition - currentDomainSize / 2);
        const newEnd = Math.min(100, newStart + currentDomainSize);

        onDomainUpdate([newStart, newEnd]);
      }
    };

    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isMinimapDragging || !dragType || !ref || typeof ref === 'function' || !ref.current)
          return;

        const rect = ref.current.getBoundingClientRect();
        const currentPosition = ((e.clientX - rect.left) / rect.width) * 100;
        const deltaPosition = currentPosition - dragStartPosition * 100;

        let newDomain: [number, number] = [...selectedDomain];

        switch (dragType) {
          case 'move':
            const domainSize = initialDomain[1] - initialDomain[0];
            const newStart = Math.max(
              0,
              Math.min(100 - domainSize, initialDomain[0] + deltaPosition)
            );
            newDomain = [newStart, newStart + domainSize];
            break;

          case 'resize-left':
            const newLeft = Math.max(
              0,
              Math.min(selectedDomain[1] - 2, initialDomain[0] + deltaPosition)
            );
            newDomain = [newLeft, selectedDomain[1]];
            break;

          case 'resize-right':
            const newRight = Math.min(
              100,
              Math.max(selectedDomain[0] + 2, initialDomain[1] + deltaPosition)
            );
            newDomain = [selectedDomain[0], newRight];
            break;
        }

        throttledDomainUpdate(newDomain);
      },
      [
        isMinimapDragging,
        dragType,
        dragStartPosition,
        initialDomain,
        selectedDomain,
        throttledDomainUpdate,
      ]
    );

    const handleMouseUp = useCallback(() => {
      setIsMinimapDragging(false);
      setDragType(null);
      throttledDomainUpdate.cancel();
    }, [throttledDomainUpdate]);

    useEffect(() => {
      if (isMinimapDragging) {
        const handleDocumentMouseMove = (e: MouseEvent) => {
          handleMouseMove(e as any);
        };

        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('mousemove', handleDocumentMouseMove);

        return () => {
          document.removeEventListener('mouseup', handleMouseUp);
          document.removeEventListener('mousemove', handleDocumentMouseMove);
        };
      }
    }, [isMinimapDragging, handleMouseMove, handleMouseUp]);

    const layoutMetrics = useMemo(() => {
      // Calculate total number of rows needed
      const calculateTotalRows = (spanList: any[], depth: number = 0): number => {
        let maxRows = 0;
        spanList.forEach((span) => {
          maxRows += 1;
          if (span.children.length > 0) {
            maxRows += calculateTotalRows(span.children, depth + 1);
          }
        });
        return maxRows;
      };

      const totalRows = calculateTotalRows(spans);
      const availableHeight = MINIMAP_HEIGHT - 2; // Minimap height - 1px padding (top + bottom)
      const rowHeight = totalRows > 0 ? availableHeight / totalRows : 1;
      const spanBarHeight = Math.min(4, rowHeight); // Max 4px height per span

      const totalContentHeight = totalRows * spanBarHeight;
      const verticalOffset = Math.max(1, (MINIMAP_HEIGHT - totalContentHeight) / 2);

      return {
        totalRows,
        rowHeight,
        spanBarHeight,
        verticalOffset,
      };
    }, [spans]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      drawSpansOnCanvas(canvas, spans, mode, min, scale, colorMap, layoutMetrics);
    }, [spans, mode, min, scale, colorMap, layoutMetrics]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onDomainUpdate([0, 100]);
      }
    };

    return (
      <div
        ref={ref}
        className="span-detail-timeline-minimap"
        data-test-subj="timeline-minimap"
        style={{ height: `${MINIMAP_HEIGHT}px` }}
        onClick={handleGeneralClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <div className="minimap-container" style={{ width: '100%', height: MINIMAP_HEIGHT }}>
          <canvas
            ref={canvasRef}
            className="minimap-canvas"
            data-test-subj="minimap-canvas"
            style={{ width: '100%', height: MINIMAP_HEIGHT }}
          />
          <div
            className="minimap-selection"
            data-test-subj="minimap-selection"
            style={{
              left: `${selectedDomain[0]}%`,
              width: `${selectedDomain[1] - selectedDomain[0]}%`,
            }}
          >
            <div className="minimap-move-area" onMouseDown={(e) => handleMouseDown(e, 'move')} />
            <div
              className="minimap-handle minimap-handle--left"
              onMouseDown={(e) => handleMouseDown(e, 'resize-left')}
            />
            <div
              className="minimap-handle minimap-handle--right"
              onMouseDown={(e) => handleMouseDown(e, 'resize-right')}
            />
          </div>
        </div>
      </div>
    );
  }
);
