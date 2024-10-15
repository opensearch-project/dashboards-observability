/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MappingTypeMapping } from '@opensearch-project/opensearch/api/types';
import { EuiSelectableOption } from '@elastic/eui';
import { coreRefs } from '../../../framework/core_refs';
import { useToast } from '../../../../public/components/common/toast';
import { CollectorOption } from './getting_started_collectData';

export interface ICollectorIndexTemplate {
  name: string;
  templatePath: string;
  template: MappingTypeMapping;
}

export interface ICollectorSchema {
  alias: string;
  content: string;
  description: string;
  'index-pattern-name': string;
  type: string;
  'index-template': string;
  info: string[];
}

const fetchAssets = async (tutorialId: string, assetFilter?: 'dashboards' | 'indexPatterns') => {
  const assetFilterParam = assetFilter ? `${assetFilter}/` : '';
  const http = coreRefs.http;
  const responeData = await http!
    .get(`/api/observability/gettingStarted/${assetFilterParam}${tutorialId}`)
    .then((res: any) => {
      return res;
    })
    .catch((_error) => {
      console.error('failed to fetch file');
    });
  return responeData;
};

export const UploadAssets = async (
  tutorialId: string,
  mdsId: string,
  mdsLabel: string,
  schema: ICollectorSchema[],
  selectedIntegration: Array<EuiSelectableOption<CollectorOption>>
) => {
  const { setToast } = useToast();
  const http = coreRefs.http;

  let curIntegration: string | undefined;
  if (selectedIntegration !== undefined) {
    if (/^otel[A-Za-z]+$/i.test(selectedIntegration[0].value)) {
      curIntegration = 'otel-services';
    } else if (selectedIntegration[0].value === 'nginx') {
      curIntegration = selectedIntegration[0].value;
    }
  }

  try {
    // Auto-generate index templates based on the selected integration
    let templates: ICollectorIndexTemplate[] = [];
    if (curIntegration !== undefined) {
      const indexTemplateMappings = await http!.get(
        `/api/integrations/repository/${curIntegration}/schema`
      );
      templates = schema.reduce((acc: ICollectorIndexTemplate[], sh) => {
        const templateMapping = indexTemplateMappings?.data?.mappings?.[sh.type.toLowerCase()];
        if (!!templateMapping) {
          acc.push({
            name: sh.content.match(/[^/]+$/)?.[0] || '',
            templatePath: sh.content.match(/PUT\s+(.+)/)?.[1] || '',
            template: templateMapping,
          });
        }
        return acc;
      }, []);
    }

    const response = await http!.post(`/api/observability/gettingStarted/createAssets`, {
      body: JSON.stringify({
        mdsId,
        mdsLabel,
        tutorialId,
        indexTemplates: templates,
      }),
    });

    if (response) {
      setToast('Created saved object assets successfully', 'success');
    }
  } catch (err) {
    console.error(err.message);
    setToast('Failed to create saved object assets', 'danger');
  }
};

export const fetchDashboardIds = async (tutorialId: string) => {
  try {
    const responeData = await fetchAssets(tutorialId, 'dashboards');
    return responeData;
  } catch (err) {
    console.error(err.message);
  }
};

export const fetchIndexPatternIds = async (tutorialId: string) => {
  try {
    const responeData = await fetchAssets(tutorialId, 'indexPatterns');
    return responeData;
  } catch (err) {
    console.error(err.message);
  }
};

export const redirectToDashboards = (path: string) => {
  coreRefs?.application!.navigateToApp('dashboards', {
    path: `#/${path}`,
  });
};
