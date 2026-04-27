/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared ECharts render component following the OSD core pattern
 * from src/plugins/explore/public/components/visualizations/echarts_render.tsx.
 *
 * Usage: <EchartsRender spec={echartsOption} height={200} />
 */
import React, { useRef, useEffect, useMemo } from 'react';
import * as echarts from 'echarts';

interface EchartsRenderProps {
  spec: echarts.EChartsOption;
  height?: number | string;
  width?: string;
}

export const EchartsRender = React.memo(
  ({ spec, height = 200, width = '100%' }: EchartsRenderProps) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const instanceRef = useRef<echarts.ECharts | null>(null);

    // ResizeObserver for responsive resizing
    const resizeObserver = useMemo(
      () =>
        new ResizeObserver(() => {
          instanceRef.current?.resize();
        }),
      []
    );

    // Initialize ECharts instance
    useEffect(() => {
      if (containerRef.current) {
        instanceRef.current = echarts.init(containerRef.current);
        resizeObserver.observe(containerRef.current);
      }
      return () => {
        resizeObserver.disconnect();
        instanceRef.current?.dispose();
        instanceRef.current = null;
      };
    }, [resizeObserver]);

    // Apply spec to instance
    useEffect(() => {
      if (instanceRef.current && spec) {
        instanceRef.current.setOption(spec, { notMerge: true });
      }
    }, [spec]);

    return <div ref={containerRef} style={{ height, width }} />;
  }
);

EchartsRender.displayName = 'EchartsRender';
