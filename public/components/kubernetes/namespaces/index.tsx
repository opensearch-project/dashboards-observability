/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Router, Route, Switch } from 'react-router-dom';
import { NamespaceOverview } from './overview';
import { Home as ClusterDetails } from '../home';

export const NamespacesOverviewHome = (props) => {
  return (
    <Router history={props.AppMountParametersProp.history}>
      <Switch>
        {/* <Route path="/:nodeName" component={ClusterDetails} /> */}
        <Route path="/" component={ NamespaceOverview } />
      </Switch>
    </Router>
  );
};
