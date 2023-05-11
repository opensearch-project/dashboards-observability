/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResponseError } from '@opensearch-project/opensearch/lib/errors';
import { schema } from '@osd/config-schema';
import fetch from 'node-fetch';
import { ApplicationType } from 'common/types/application_analytics';
import {
  ILegacyScopedClusterClient,
  IOpenSearchDashboardsResponse,
  IRouter,
} from '../../../../../src/core/server';
import { INTEGRATIONS_BASE, OBSERVABILITY_BASE } from '../../../common/constants/shared';
import { addClickToMetric, getMetrics } from '../../common/metrics/metrics_helper';
import { PlaceholderAdaptor } from '../../../server/adaptors/placeholder/placeholder_adaptor';
import { importFile } from '../../../../../src/plugins/saved_objects_management/public/lib';
import { SavedObject } from '../../../../../src/plugins/data/common';

export function registerPlaceholderRoute(router: IRouter) {
  const appAnalyticsBackend = new PlaceholderAdaptor();

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/repository`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      const opensearchClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );
      let applicationsData: ApplicationType[] = [];
      try {
        console.log('hello');
        applicationsData = await appAnalyticsBackend.fetchApps(opensearchClient);
        console.log(applicationsData);
        return response.ok({
          body: {
            data: applicationsData,
          },
        });
      } catch (err: any) {
        console.error('Error occurred while fetching applications', err);
        return response.custom({
          statusCode: err.statusCode || 500,
          body: err.message,
        });

        // try {
        //   const random = await fetch('http://127.0.0.1:4010/store/id', {
        //     // method: "GET", // *GET, POST, PUT, DELETE, etc.
        //     // mode: "cors", // no-cors, *cors, same-origin
        //     // cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
        //     // credentials: "same-origin", // include, *same-origin, omit
        //     // headers: {
        //     //   "Content-Type": "application/json",
        //     //   // 'Content-Type': 'application/x-www-form-urlencoded',
        //     // },
        //     // redirect: "follow", // manual, *follow, error
        //     // referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
        //     // // body: '{limit: 3}', // body data type must match "Content-Type" header
        //   });
        //   return response.ok({
        //     body: {
        //       data: await random.json(),
        //     },
        //   });
        //   // const metrics = getMetrics();
        //   // return response.ok({
        //   //   body: metrics,
        //   // });
        // } catch (error) {
        //   // console.error(error);
        //   // return response.custom({
        //   //   statusCode: error.statusCode || 500,
        //   //   body: error.message,
        //   // });
        // }
      }
    }
  );

  router.post(
    {
      path: `${INTEGRATIONS_BASE}/store`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      const opensearchClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );
      console.log('poopy');
      const applicationsData: ApplicationType[] = [];
      try {
        // console.log('hello')
        // applicationsData = await appAnalyticsBackend.fetchApps(opensearchClient);
        // console.log(applicationsData)
        // return response.ok({
        //   body: {
        //     data: applicationsData,
        //   },
        // });
        const respons = await context.core.savedObjects.client.bulkCreate([
          {
            type: 'observability-panel',
            id: 'awiehgio;haw;oieghoiwaeg',
            attributes: {},
          },
          {
            type: 'observability-panel',
            id: 'a',
            attributes: {},
          },
        ]);
        return response.ok({
          body: {
            data: {},
          },
        });
      } catch (err: any) {
        console.error('Error occurred while fetching applications', err);
        return response.custom({
          statusCode: err.statusCode || 500,
          body: err.message,
        });

        // try {
        //   const random = await fetch('http://127.0.0.1:4010/store/id', {
        //     // method: "GET", // *GET, POST, PUT, DELETE, etc.
        //     // mode: "cors", // no-cors, *cors, same-origin
        //     // cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
        //     // credentials: "same-origin", // include, *same-origin, omit
        //     // headers: {
        //     //   "Content-Type": "application/json",
        //     //   // 'Content-Type': 'application/x-www-form-urlencoded',
        //     // },
        //     // redirect: "follow", // manual, *follow, error
        //     // referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
        //     // // body: '{limit: 3}', // body data type must match "Content-Type" header
        //   });
        //   return response.ok({
        //     body: {
        //       data: await random.json(),
        //     },
        //   });
        //   // const metrics = getMetrics();
        //   // return response.ok({
        //   //   body: metrics,
        //   // });
        // } catch (error) {
        //   // console.error(error);
        //   // return response.custom({
        //   //   statusCode: error.statusCode || 500,
        //   //   body: error.message,
        //   // });
        // }
      }
    }
  );
  router.get(
    {
      path: `${OBSERVABILITY_BASE}/repository/id`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      try {
        const random = await fetch('http://127.0.0.1:4010/repository/id', {
          // method: "GET", // *GET, POST, PUT, DELETE, etc.
          // mode: "cors", // no-cors, *cors, same-origin
          // cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
          // credentials: "same-origin", // include, *same-origin, omit
          // headers: {
          //   "Content-Type": "application/json",
          //   // 'Content-Type': 'application/x-www-form-urlencoded',
          // },
          // redirect: "follow", // manual, *follow, error
          // referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
          // // body: '{limit: 3}', // body data type must match "Content-Type" header
        });
        return response.ok({
          body: {
            data: await random.json(),
          },
        });
        // const metrics = getMetrics();
        // return response.ok({
        //   body: metrics,
        // });
      } catch (error) {
        // console.error(error);
        // return response.custom({
        //   statusCode: error.statusCode || 500,
        //   body: error.message,
        // });
      }
    }
  );

  router.get(
    {
      path: `${OBSERVABILITY_BASE}/store`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      try {
        const random = await fetch('http://127.0.0.1:4010/store?limit=24', {
          // method: "GET", // *GET, POST, PUT, DELETE, etc.
          // mode: "cors", // no-cors, *cors, same-origin
          // cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
          // credentials: "same-origin", // include, *same-origin, omit
          // headers: {
          //   "Content-Type": "application/json",
          //   // 'Content-Type': 'application/x-www-form-urlencoded',
          // },
          // redirect: "follow", // manual, *follow, error
          // referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
          // // body: '{limit: 3}', // body data type must match "Content-Type" header
        });
        return response.ok({
          body: {
            data: await random.json(),
          },
        });
        // const metrics = getMetrics();
        // return response.ok({
        //   body: metrics,
        // });
      } catch (error) {
        // console.error(error);
        // return response.custom({
        //   statusCode: error.statusCode || 500,
        //   body: error.message,
        // });
      }
    }
  );

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/store`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      const opensearchClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );
      let applicationsData: ApplicationType[] = [];
      try {
        applicationsData = await appAnalyticsBackend.fetchApps(opensearchClient);
        return response.ok({
          body: {
            data: applicationsData,
          },
        });
      } catch (err: any) {
        console.error('Error occurred while fetching applications', err);
        return response.custom({
          statusCode: err.statusCode || 500,
          body: err.message,
        });

        // try {
        //   const random = await fetch('http://127.0.0.1:4010/store/id', {
        //     // method: "GET", // *GET, POST, PUT, DELETE, etc.
        //     // mode: "cors", // no-cors, *cors, same-origin
        //     // cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
        //     // credentials: "same-origin", // include, *same-origin, omit
        //     // headers: {
        //     //   "Content-Type": "application/json",
        //     //   // 'Content-Type': 'application/x-www-form-urlencoded',
        //     // },
        //     // redirect: "follow", // manual, *follow, error
        //     // referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
        //     // // body: '{limit: 3}', // body data type must match "Content-Type" header
        //   });
        //   return response.ok({
        //     body: {
        //       data: await random.json(),
        //     },
        //   });
        //   // const metrics = getMetrics();
        //   // return response.ok({
        //   //   body: metrics,
        //   // });
        // } catch (error) {
        //   // console.error(error);
        //   // return response.custom({
        //   //   statusCode: error.statusCode || 500,
        //   //   body: error.message,
        //   // });
        // }
      }
    }
  );

  // router.post(
  //   {
  //     path: `${OBSERVABILITY_BASE}/store`,
  //     validate: false,
  //   },
  //   async (context, request, response): Promise<any> => {
  //     try {
  //       const random = await fetch('http://127.0.0.1:4010/store', {
  //         method: 'POST', // *GET, POST, PUT, DELETE, etc.
  //         // // mode: "cors", // no-cors, *cors, same-origin
  //         // // cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
  //         // // credentials: "same-origin", // include, *same-origin, omit
  //         headers: {
  //           'Content-Type': 'application/json',
  //           // 'Content-Type': 'application/x-www-form-urlencoded',
  //         },
  //         // // redirect: "follow", // manual, *follow, error
  //         // // referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
  //         body: '{"limit": "5"}', // body data type must match "Content-Type" header
  //       });
  //       return response.ok();
  //       // const metrics = getMetrics();
  //       // return response.ok({
  //       //   body: metrics,
  //       // });
  //     } catch (error) {
  //       return response.custom({
  //         statusCode: error.statusCode || 500,
  //         body: error.message,
  //       });
  //       // console.error(error);
  //       // return response.custom({
  //       //   statusCode: error.statusCode || 500,
  //       //   body: error.message,
  //       // });
  //     }
  //   }
  // );

  // Get all paragraphs of notebooks
  // router.get(
  //   {
  //     path: `${NOTEBOOKS_API_PREFIX}/note/{noteId}`,
  //     validate: {
  //       params: schema.object({
  //         noteId: schema.string(),
  //       }),
  //     },
  //   },
  //   async (
  //     context,
  //     request,
  //     response
  //   ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
  //     const opensearchNotebooksClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
  //       request
  //     );
  //     try {
  //       const notebookinfo = await BACKEND.fetchNote(
  //         opensearchNotebooksClient,
  //         request.params.noteId,
  //         wreckOptions
  //       );
  //       return response.ok({
  //         body: notebookinfo,
  //       });
  //     } catch (error) {
  //       return response.custom({
  //         statusCode: error.statusCode || 500,
  //         body: error.message,
  //       });
  //     }
  //   }
  // );
  // router.get(
  //   {
  //     path: `${OBSERVABILITY_BASE}/repository`,
  //     validate: false,
  //   },
  //   async (
  //     context,
  //     request,
  //     response
  //   ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
  //       console.log('made it in here')
  //     try {
  //       await fetch("http://127.0.0.1:4010/repository", {
  //           method: "POST", // *GET, POST, PUT, DELETE, etc.
  //           mode: "cors", // no-cors, *cors, same-origin
  //           cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
  //           // credentials: "same-origin", // include, *same-origin, omit
  //           headers: {
  //             "Content-Type": "application/zip",
  //             // 'Content-Type': 'application/x-www-form-urlencoded',
  //           },
  //           redirect: "follow", // manual, *follow, error
  //           referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
  //           body: 'UEsDBBQAAAAAAOhpdVYAAAAAAAAAAAAAAAAFAAAAdGVzdC9QSwECPwAUAAAAAADoaXVWAAAAAAAAAAAAAAAABQAkAAAAAAAAABAAAAAAAAAAdGVzdC8KACAAAAAAAAEAGABGQanYMVzZAUZBqdgxXNkBRkGp2DFc2QFQSwUGAAAAAAEAAQBXAAAAIwAAAAA', // body data type must match "Content-Type" header
  //         });
  //         return Promise.reject()
  //       // const metrics = getMetrics();
  //       // return response.ok({
  //       //   body: metrics,
  //       // });
  //     } catch (error) {

  //       console.error(error);
  //       // return response.custom({
  //       //   statusCode: error.statusCode || 500,
  //       //   body: error.message,
  //       // });
  //     }
  //     return Promise.reject()
  //   }
  // );

  //   router.post(
  //     {
  //       path: `${OBSERVABILITY_BASE}/stats`,
  //       validate: {
  //         body: schema.object({
  //           element: schema.string()
  //         }),
  //       },
  //     },
  //     async (
  //       context,
  //       request,
  //       response
  //     ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
  //       try {
  //         const { element } = request.body;
  //         addClickToMetric(element);
  //         return response.ok();
  //       } catch (error) {
  //         console.error(error);
  //         return response.custom({
  //           statusCode: error.statusCode || 500,
  //           body: error.message,
  //         });
  //       }
  //     }
  //   );
}
