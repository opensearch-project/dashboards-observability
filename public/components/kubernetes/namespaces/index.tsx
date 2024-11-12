/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Router, Route, Switch } from 'react-router-dom';
import { NamespaceOverview } from './overview';
import { NamespaceDetails } from './details';

export const NamespacesOverviewHome = (props) => {
  return (
    <Router history={props.AppMountParametersProp.history}>
      <Switch>
        <Route path="/:namespaceName" component={NamespaceDetails} />
        <Route path="/" component={NamespaceOverview} />
      </Switch>
    </Router>
  );
};
