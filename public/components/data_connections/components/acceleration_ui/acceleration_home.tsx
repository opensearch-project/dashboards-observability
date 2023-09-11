/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HashRouter, Route, Switch } from 'react-router-dom';
import { AccelerationIndices } from './acceleration_indices';

export const AccelerationHome = () => {
  return (
    <HashRouter>
      <Switch>
        <Route
          path={'/acceleration/:id+'}
          render={(routerProps) => (
            <AccelerationIndices dataSource={decodeURIComponent(routerProps.match.params.id)} />
          )}
        />
      </Switch>
    </HashRouter>
  );
};
