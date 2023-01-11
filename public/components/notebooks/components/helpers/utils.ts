/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable no-console */

/*
 * "Utils" This file contains different reused functions in operational panels
 *
 * fetchPanelsList - Get list of Observability Panel from Custom Panels API

 */
import {NOTEBOOKS_API_PREFIX} from "../../../../../common/constants/notebooks";
import {HttpSetup} from "../../../../../../../src/core/public";
import {catchError, map, tap} from "rxjs/operators";
import {from} from "rxjs";

// Fetches path and id for all stored notebooks
export const fetchNotebooksList = (http: HttpSetup) => {
  return from(http.get(`${NOTEBOOKS_API_PREFIX}/`)).pipe(
    map((res) => res.data),
    catchError((err) => {
      console.error('Issue in fetching the operational panels', err.body.message);
      return from([]);
    })
  );
};
