/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type ObservabilityTransformFn<T> = (obj) => T;

export const ObjectFetcher = <T>({
  savedObjectsType,
  savedObjectsTranform,
  observabilityUrlPath,
}: {
  savedObjectsType: string;
  savedObjectsTranform: ObservabilityTransformFn<T>;
  observabilityUrlPath: string;
}): any => {
  return {
    fetchList: () => {},
  };
};

// Fetches all saved Custom Panels
// const fetchCustomPanels = async () => {
//   setLoading(true);
//
//   const panels$ = concat(fetchSavedObjectPanels$(), fetchObservabilityPanels$()).pipe(
//     tap((res) => console.log('panels$', res))
//   );
//
//   const panels = await panels$.pipe(toArray()).toPromise();
//   console.log({ panels });
//   setcustomPanelData(panels);
//
//   // This opeation separated to simplify debugging
//   // savedObjects$.pipe(toArray()).subscribe(setcustomPanelData);
//
//   //
//   //   .then((res) => {
//   //     console.log('operational-panels', res.panels);
//   //   })
//   //   .catch((err) => {
//   //     console.error('Issue in fetching the operational panels', err.body.message);
//   //   });
//   setLoading(false);
// };
