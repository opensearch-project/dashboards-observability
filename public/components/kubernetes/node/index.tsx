/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Router, Route, Switch } from 'react-router-dom';
import { NodeOverview } from './overview';
import { Home as ClusterDetails } from '../home';

export const NodeOverviewHome = (props) => {
  return (
    <Router history={props.AppMountParametersProp.history}>
      <Switch>
        {/* <Route path="/:nodeName" component={ClusterDetails} /> */}
        <Route path="/" component={ NodeOverview } />
      </Switch>
    </Router>
  );
};
