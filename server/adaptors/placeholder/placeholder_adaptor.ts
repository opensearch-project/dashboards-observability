/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ApplicationRequestType,
  ApplicationType,
} from '../../../common/types/application_analytics';
import { ILegacyScopedClusterClient } from '../../../../../src/core/server';

export class PlaceholderAdaptor {
  // Fetch all existing integrations
  fetchApps = async (client: ILegacyScopedClusterClient): Promise<any[]> => {
    try {
      console.log('poopy')
      const response = await client.callAsCurrentUser('integrations.getObject');
      console.log(response)
      // return response.observabilityObjectList.map((object: any) => {
      return response
      //   return {
      //   };
      // });
    } catch (err: any) {
      throw new Error('Fetch All Applications Error: ' + err);
    }
  };

  fetchAdded = async (client: ILegacyScopedClusterClient): Promise<any[]> => {
    try {
      const response = await client.callAsCurrentUser('integrations.getAdded', {});
      console.log(response)
      // return response.observabilityObjectList.map((object: any) => {
        return response.list
      //   return {
      //   };
      // });
    } catch (err: any) {
      throw new Error('Fetch All Applications Error: ' + err);
    }
  }

  // // Fetch application by id
  // fetchAppById = async (
  //   client: ILegacyScopedClusterClient,
  //   appId: string
  // ): Promise<ApplicationType> => {
  //   try {
  //     const response = await client.callAsCurrentUser('observability.getObjectById', {
  //       objectId: appId,
  //     });
  //     const app = response.observabilityObjectList[0];
  //     return {
  //       id: appId,
  //       dateCreated: app.createdTimeMs,
  //       dateModified: app.lastUpdatedTimeMs,
  //       name: app.application.name,
  //       description: app.application.description,
  //       baseQuery: app.application.baseQuery,
  //       servicesEntities: app.application.servicesEntities.map((rec: string) => decodeURI(rec)),
  //       traceGroups: app.application.traceGroups.map((rec: string) => decodeURI(rec)),
  //       panelId: app.application.panelId,
  //       availability: {
  //         name: '',
  //         color: '',
  //         availabilityVisId: app.application.availabilityVisId || '',
  //       },
  //     };
  //   } catch (err: any) {
  //     throw new Error('Fetch Application By Id Error: ' + err);
  //   }
  // };

  // // Create a new application
  // createNewApp = async (
  //   client: ILegacyScopedClusterClient,
  //   appBody: Partial<ApplicationRequestType>
  // ) => {
  //   try {
  //     const response = await client.callAsCurrentUser('observability.createObject', {
  //       body: {
  //         application: appBody,
  //       },
  //     });
  //     return response.objectId;
  //   } catch (err) {
  //     throw new Error('Create New Application Error: ' + err);
  //   }
  // };

  // // Rename an existing application
  // renameApp = async (client: ILegacyScopedClusterClient, appId: string, name: string) => {
  //   const updateApplicationBody = {
  //     name,
  //   };
  //   try {
  //     const response = await client.callAsCurrentUser('observability.updateObjectById', {
  //       objectId: appId,
  //       body: {
  //         application: updateApplicationBody,
  //       },
  //     });
  //     return response.objectId;
  //   } catch (err: any) {
  //     throw new Error('Rename Application Error: ' + err);
  //   }
  // };

  // // Update an existing application
  // updateApp = async (
  //   client: ILegacyScopedClusterClient,
  //   appId: string,
  //   updateAppBody: Partial<ApplicationRequestType>
  // ) => {
  //   try {
  //     const response = await client.callAsCurrentUser('observability.updateObjectById', {
  //       objectId: appId,
  //       body: {
  //         application: updateAppBody,
  //       },
  //     });
  //     return response.objectId;
  //   } catch (err: any) {
  //     throw new Error('Update Panel Error: ' + err);
  //   }
  // };

  // // Delete existing applications
  // deleteApp = async (client: ILegacyScopedClusterClient, appList: string) => {
  //   try {
  //     const response = await client.callAsCurrentUser('observability.deleteObjectByIdList', {
  //       objectIdList: appList,
  //     });
  //     return { status: 'OK', message: response };
  //   } catch (err: any) {
  //     throw new Error('Delete Application Error: ' + err);
  //   }
  // };
}
