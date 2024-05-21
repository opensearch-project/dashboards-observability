/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiCallOut, EuiCallOutProps } from '@elastic/eui';
import React from 'react';

type QueryAssistCallOutProps = Pick<EuiCallOutProps, 'onDismiss'>;

export const ProhibitedQueryCallOut: React.FC<QueryAssistCallOutProps> = (props) => (
  <EuiCallOut
    data-test-subj="query-assist-guard-callout"
    title="I am unable to respond to this query. Try another question."
    size="s"
    color="danger"
    iconType="alert"
    dismissible
    onDismiss={props.onDismiss}
  />
);

export const EmptyIndexCallOut: React.FC<QueryAssistCallOutProps> = (props) => (
  <EuiCallOut
    data-test-subj="query-assist-empty-index-callout"
    title="Select a data source or index to ask a question."
    size="s"
    color="warning"
    iconType="iInCircle"
    dismissible
    onDismiss={props.onDismiss}
  />
);

export const EmptyQueryCallOut: React.FC<QueryAssistCallOutProps> = (props) => (
  <EuiCallOut
    data-test-subj="query-assist-empty-query-callout"
    title="Enter a natural language question to automatically generate a query to view results."
    size="s"
    color="warning"
    iconType="iInCircle"
    dismissible
    onDismiss={props.onDismiss}
  />
);

export const PPLGeneratedCallOut: React.FC<QueryAssistCallOutProps> = (props) => (
  <EuiCallOut
    data-test-subj="query-assist-ppl-callout"
    title="PPL query generated"
    size="s"
    color="success"
    iconType="check"
    dismissible
    onDismiss={props.onDismiss}
  />
);
