/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Span } from '../../common/constants';

export interface SpanWithChildren extends Span {
  children: SpanWithChildren[];
}

export interface SpanReference {
  refType: 'CHILD_OF' | 'FOLLOWS_FROM';
  spanID: string;
}

export type JaegerSpan = Omit<Span, 'spanId'> & {
  spanID: string;
  duration: number;
  references: SpanReference[];
};

export type SpanMap = Record<string, SpanWithChildren>;
