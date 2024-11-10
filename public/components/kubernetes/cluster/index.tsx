/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Router, Route, Switch } from 'react-router-dom';
import { ClusterOverview } from './overview';
import { Home as ClusterDetails } from '../home';

export const clusterOverviewHome = (props) => {
  console.log('clusterOverviewHome props: ', props);
  return (
    <Router
      history={props.AppMountParametersProp.history}
    >
      <Switch>
        <Route path="/:clusterName" component={ClusterDetails} />
        <Route path="/" component={ClusterOverview} />
      </Switch>
    </Router>
  );
};
