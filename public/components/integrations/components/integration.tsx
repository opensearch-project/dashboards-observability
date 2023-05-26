/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import { EuiGlobalToastList, EuiOverlayMask, EuiPage, EuiPageBody, EuiSpacer } from '@elastic/eui';
import DSLService from 'public/services/requests/dsl';
import PPLService from 'public/services/requests/ppl';
import SavedObjects from 'public/services/saved_objects/event_analytics/saved_objects';
import TimestampUtils from 'public/services/timestamp/timestamp';
import React, { ReactChild, useEffect, useState } from 'react';
import { last } from 'lodash';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import { TAB_EVENT_ID, TAB_CHART_ID, NEW_TAB } from '../../../../common/constants/explorer';
import { NotificationsStart } from '../../../../../../src/core/public';
import { AppAnalyticsComponentDeps } from '../home';
import {
  ApplicationRequestType,
  ApplicationType,
} from '../../../../common/types/application_analytics';
import { QueryManager } from '../../../../common/query_manager/ppl_query_manager';
import { IntegrationOverview } from './integration_overview_panel';
import { IntegrationDetails } from './integration_details_panel';
import { IntegrationFields } from './integration_fields_panel';
import { IntegrationAssets } from './integration_assets_panel';
import { getAddIntegrationModal } from './add_integration_modal';
import { OBSERVABILITY_BASE } from '../../../../common/constants/shared';

const searchBarConfigs = {
  [TAB_EVENT_ID]: {
    showSaveButton: false,
    showSavePanelOptionsList: false,
  },
  [TAB_CHART_ID]: {
    showSaveButton: true,
    showSavePanelOptionsList: false,
  },
};

interface AppDetailProps extends AppAnalyticsComponentDeps {
  disabled?: boolean;
  appId: string;
  pplService: PPLService;
  dslService: DSLService;
  savedObjects: SavedObjects;
  timestampUtils: TimestampUtils;
  notifications: NotificationsStart;
  queryManager: QueryManager;
  updateApp: (appId: string, updateAppData: Partial<ApplicationRequestType>, type: string) => void;
  callback: (childfunction: () => void) => void;
}

export function Integration(props: AppDetailProps) {
  const {
    pplService,
    dslService,
    timestampUtils,
    savedObjects,
    http,
    notifications,
    appId,
    chrome,
    parentBreadcrumbs,
    query,
    filters,
    appConfigs,
    updateApp,
    setAppConfigs,
    setFilters,
    callback,
    queryManager,
    mode,
  } = props;
  const [application, setApplication] = useState<ApplicationType>({
    id: '',
    dateCreated: '',
    dateModified: '',
    name: '',
    description: '',
    baseQuery: '',
    servicesEntities: [],
    traceGroups: [],
    panelId: '',
    availability: { name: '', color: '', availabilityVisId: '' },
  });

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [data, setData] = useState({
    data: {
      name: 'nginx',
      version: '1.0.0',
      author: 'John Doe',
      sourceUrl: 'https://github.com/Swiddis/dashboards-observability/tree/placeholder',
      license: 'Apache-2.0',
      integrationType: 'logs',
      description: 'Nginx HTTP server collector',
      statics: {
        mapping: {
          logo: '/logo',
        },
      },
      components: [
        {
          name: 'communication',
          version: '1.0.0',
          schemaBody:
            '{"$schema":"http://json-schema.org/draft-07/schema#","$id":"https://opensearch.org/schemas/observability/Communication","title":"Communication","type":"object","properties":{"source":{"type":"object","properties":{"sock.family":{"type":"string"},"source":{"$ref":"#/definitions/Source"},"destination":{"$ref":"#/definitions/Destination"}}},"destination":{"type":"object","properties":{}}},"definitions":{"Source":{"$id":"#/definitions/Source","type":"object","additionalProperties":true,"properties":{"address":{"type":"string"},"domain":{"type":"string"},"bytes":{"type":"integer"},"ip":{"type":"string"},"port":{"type":"integer"},"mac":{"type":"string"},"packets":{"type":"integer"}},"title":"Source"},"Destination":{"$id":"#/definitions/Destination","type":"object","additionalProperties":true,"properties":{"address":{"type":"string"},"domain":{"type":"string"},"bytes":{"type":"integer"},"ip":{"type":"string"},"port":{"type":"integer"},"mac":{"type":"string"},"packets":{"type":"integer"}},"title":"Destination"}}}',
          mappingBody:
            '{"template":{"mappings":{"_meta":{"version":"1.0.0","catalog":"observability","type":"logs","component":"communication"},"properties":{"communication":{"properties":{"sock.family":{"type":"keyword","ignore_above":256},"source":{"type":"object","properties":{"address":{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":1024}}},"domain":{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":1024}}},"bytes":{"type":"long"},"ip":{"type":"ip"},"port":{"type":"long"},"mac":{"type":"keyword","ignore_above":1024},"packets":{"type":"long"}}},"destination":{"type":"object","properties":{"address":{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":1024}}},"domain":{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":1024}}},"bytes":{"type":"long"},"ip":{"type":"ip"},"port":{"type":"long"},"mac":{"type":"keyword","ignore_above":1024},"packets":{"type":"long"}}}}}}}}}',
        },
        {
          name: 'http',
          version: '1.0.0',
          schemaBody:
            '{"$schema":"http://json-schema.org/draft-07/schema#","$id":"https://opensearch.org/schemas/observability/Http","title":"Http","type":"object","properties":{"request":{"$ref":"#/definitions/Request"},"response":{"$ref":"#/definitions/Response"},"flavor":{"type":"string"},"user_agent":{"type":"string"},"url":{"type":"string"},"schema":{"type":"string"},"target":{"type":"string"},"route":{"type":"string"},"client_ip":{"type":"string"},"resent_count":{"type":"integer"}},"definitions":{"Request":{"$id":"#/definitions/Request","type":"object","additionalProperties":true,"properties":{"id":{"type":"string"},"body.content":{"type":"string"},"bytes":{"type":"integer"},"method":{"type":"string"},"referrer":{"type":"string"},"header":{"type":"string"},"mime_type":{"type":"object"}},"title":"Request"},"Response":{"$id":"#/definitions/Response","type":"object","additionalProperties":true,"properties":{"id":{"type":"string"},"body.content":{"type":"string"},"bytes":{"type":"integer"},"status_code":{"type":"integer"},"header":{"type":"object"}},"title":"Response"}}}',
          mappingBody:
            '{"template":{"mappings":{"_meta":{"version":"1.0.0","catalog":"observability","type":"logs","component":"http"},"dynamic_templates":[{"request_header_map":{"mapping":{"type":"keyword"},"path_match":"request.header.*"}},{"response_header_map":{"mapping":{"type":"keyword"},"path_match":"response.header.*"}}],"properties":{"http":{"properties":{"flavor":{"type":"keyword","ignore_above":256},"user_agent":{"type":"keyword","ignore_above":2048},"url":{"type":"keyword","ignore_above":2048},"schema":{"type":"keyword","ignore_above":1024},"target":{"type":"keyword","ignore_above":1024},"route":{"type":"keyword","ignore_above":1024},"client.ip":{"type":"ip"},"resent_count":{"type":"integer"},"request":{"type":"object","properties":{"id":{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":256}}},"body.content":{"type":"text"},"bytes":{"type":"long"},"method":{"type":"keyword","ignore_above":256},"referrer":{"type":"keyword","ignore_above":1024},"mime_type":{"type":"keyword","ignore_above":1024}}},"response":{"type":"object","properties":{"id":{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":256}}},"body.content":{"type":"text"},"bytes":{"type":"long"},"status_code":{"type":"integer"}}}}}}}}}',
        },
        {
          name: 'logs',
          version: '1.0.0',
          schemaBody:
            '{"$schema":"http://json-schema.org/draft-07/schema#","$id":"https://opensearch.org/schema/observability/Logs","title":"OpenTelemetry Logs","type":"object","properties":{"severity":{"$ref":"#/definitions/Severity"},"resource":{"type":"object"},"attributes":{"$ref":"#/definitions/Attributes"},"body":{"type":"string"},"@timestamp":{"type":"string","format":"date-time"},"observedTimestamp":{"type":"string","format":"date-time"},"traceId":{"$ref":"https://opensearch.org/schemas/observability/Span#/properties/traceId"},"spanId":{"$ref":"https://opensearch.org/schemas/observability/Span#/properties/spanId"},"schemaUrl":{"type":"string"},"instrumentationScope":{"$ref":"#/definitions/InstrumentationScope"},"event":{"$ref":"#/definitions/Event"}},"required":["body","@timestamp"],"definitions":{"InstrumentationScope":{"$id":"#/definitions/InstrumentationScope","type":"object","additionalProperties":true,"properties":{"name":{"type":"string"},"version":{"type":"string"},"schemaUrl":{"type":"string"}},"title":"InstrumentationScope"},"Severity":{"$id":"#/definitions/Severity","type":"object","additionalProperties":true,"properties":{"text":{"type":"string","enum":["TRACE","DEBUG","INFO","WARN","ERROR","FATAL"]},"number":{"type":"integer"}},"title":"Severity"},"Attributes":{"$id":"#/definitions/Attributes","type":"object","additionalProperties":true,"properties":{"data_stream":{"$ref":"#/definitions/Dataflow"}},"title":"Attributes"},"Dataflow":{"$id":"#/definitions/Dataflow","type":"object","additionalProperties":true,"properties":{"type":{"type":"string"},"namespace":{"type":"string"},"dataset":{"type":"string"}},"title":"Dataflow"},"Exception":{"$id":"#/definitions/Exception","type":"object","additionalProperties":true,"properties":{"message":{"type":"string"},"stacktrace":{"type":"string"},"type":{"type":"string"}},"title":"Exception"},"Event":{"$id":"#/definitions/Event","type":"object","additionalProperties":true,"properties":{"category":{"type":"string","enum":["authentication","configuration","database","driver","email","file","host","iam","intrusion_detection","malware","network","package","process","registry","session","threat","vulnerability","web"]},"kind":{"type":"string","enum":["alert","enrichment","event","metric","state","error","signal"]},"type":{"type":"string","enum":["access","admin","allowed","change","connection","creation","deletion","denied","end","error","group","indicator","info","installation","protocol","start","user"]},"domain":{"type":"string"},"name":{"type":"string"},"source":{"type":"string"},"result":{"type":"string","enum":["failure","success","pending","undetermined"]},"exception":{"$ref":"#/definitions/Exception"}},"title":"Event"}}}',
          mappingBody:
            '{"index_patterns":["sso_logs-*-*"],"data_stream":{},"template":{"mappings":{"_meta":{"version":"1.0.0","catalog":"observability","type":"logs","component":"log","correlations":[{"field":"spanId","foreign-schema":"traces","foreign-field":"spanId"},{"field":"traceId","foreign-schema":"traces","foreign-field":"traceId"}]},"_source":{"enabled":true},"dynamic_templates":[{"resources_map":{"mapping":{"type":"keyword"},"path_match":"resource.*"}},{"attributes_map":{"mapping":{"type":"keyword"},"path_match":"attributes.*"}},{"instrumentation_scope_attributes_map":{"mapping":{"type":"keyword"},"path_match":"instrumentationScope.attributes.*"}}],"properties":{"severity":{"properties":{"number":{"type":"long"},"text":{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":256}}}}},"attributes":{"type":"object","properties":{"data_stream":{"properties":{"dataset":{"ignore_above":128,"type":"keyword"},"namespace":{"ignore_above":128,"type":"keyword"},"type":{"ignore_above":56,"type":"keyword"}}}}},"body":{"type":"text"},"@timestamp":{"type":"date"},"observedTimestamp":{"type":"date"},"observerTime":{"type":"alias","path":"observedTimestamp"},"traceId":{"ignore_above":256,"type":"keyword"},"spanId":{"ignore_above":256,"type":"keyword"},"schemaUrl":{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":256}}},"instrumentationScope":{"properties":{"name":{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":128}}},"version":{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":256}}},"dropped_attributes_count":{"type":"integer"},"schemaUrl":{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":256}}}}},"event":{"properties":{"domain":{"ignore_above":256,"type":"keyword"},"name":{"ignore_above":256,"type":"keyword"},"source":{"ignore_above":256,"type":"keyword"},"category":{"ignore_above":256,"type":"keyword"},"type":{"ignore_above":256,"type":"keyword"},"kind":{"ignore_above":256,"type":"keyword"},"result":{"ignore_above":256,"type":"keyword"},"exception":{"properties":{"message":{"ignore_above":1024,"type":"keyword"},"type":{"ignore_above":256,"type":"keyword"},"stacktrace":{"type":"text"}}}}}}},"settings":{"index":{"mapping":{"total_fields":{"limit":10000}},"refresh_interval":"5s"}}},"composed_of":["http_template","communication_template"],"version":1,"_meta":{"description":"Simple Schema For Observability","catalog":"observability","type":"logs","correlations":[{"field":"spanId","foreign-schema":"traces","foreign-field":"spanId"},{"field":"traceId","foreign-schema":"traces","foreign-field":"traceId"}]}}',
        },
      ],
      displayAssets: [
        {
          body:
            '{"attributes":{"fields":"[{\\"count\\":0,\\"name\\":\\"@timestamp\\",\\"type\\":\\"date\\",\\"esTypes\\":[\\"date\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true},{\\"count\\":0,\\"name\\":\\"_id\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"_id\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"_index\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"_index\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"_score\\",\\"type\\":\\"number\\",\\"scripted\\":false,\\"searchable\\":false,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"_source\\",\\"type\\":\\"_source\\",\\"esTypes\\":[\\"_source\\"],\\"scripted\\":false,\\"searchable\\":false,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"_type\\",\\"type\\":\\"string\\",\\"scripted\\":false,\\"searchable\\":false,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"attributes.data_stream.dataset\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"attributes.data_stream.dataset.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"attributes.data_stream.dataset\\"}}},{\\"count\\":0,\\"name\\":\\"attributes.data_stream.namespace\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"attributes.data_stream.namespace.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"attributes.data_stream.namespace\\"}}},{\\"count\\":0,\\"name\\":\\"attributes.data_stream.type\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"attributes.data_stream.type.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"attributes.data_stream.type\\"}}},{\\"count\\":0,\\"name\\":\\"body\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"body.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"body\\"}}},{\\"count\\":0,\\"name\\":\\"communication.source.address\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"communication.source.address.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"communication.source.address\\"}}},{\\"count\\":0,\\"name\\":\\"communication.source.ip\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"communication.source.ip.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"communication.source.ip\\"}}},{\\"count\\":0,\\"name\\":\\"event.category\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"event.category.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"event.category\\"}}},{\\"count\\":0,\\"name\\":\\"event.domain\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"event.domain.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"event.domain\\"}}},{\\"count\\":0,\\"name\\":\\"event.kind\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"event.kind.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"event.kind\\"}}},{\\"count\\":0,\\"name\\":\\"event.name\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"event.name.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"event.name\\"}}},{\\"count\\":0,\\"name\\":\\"event.result\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"event.result.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"event.result\\"}}},{\\"count\\":0,\\"name\\":\\"event.type\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"event.type.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"event.type\\"}}},{\\"count\\":0,\\"name\\":\\"http.flavor\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"http.flavor.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"http.flavor\\"}}},{\\"count\\":0,\\"name\\":\\"http.request.method\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"http.request.method.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"http.request.method\\"}}},{\\"count\\":0,\\"name\\":\\"http.response.bytes\\",\\"type\\":\\"number\\",\\"esTypes\\":[\\"long\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true},{\\"count\\":0,\\"name\\":\\"http.response.status_code\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"http.response.status_code.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"http.response.status_code\\"}}},{\\"count\\":0,\\"name\\":\\"http.url\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"http.url\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"http.url\\"}}},{\\"count\\":0,\\"name\\":\\"observerTime\\",\\"type\\":\\"date\\",\\"esTypes\\":[\\"date\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true},{\\"count\\":0,\\"name\\":\\"span_id\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"span_id.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"span_id\\"}}},{\\"count\\":0,\\"name\\":\\"trace_id\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"text\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":false,\\"readFromDocValues\\":false},{\\"count\\":0,\\"name\\":\\"trace_id.keyword\\",\\"type\\":\\"string\\",\\"esTypes\\":[\\"keyword\\"],\\"scripted\\":false,\\"searchable\\":true,\\"aggregatable\\":true,\\"readFromDocValues\\":true,\\"subType\\":{\\"multi\\":{\\"parent\\":\\"trace_id\\"}}}]","timeFieldName":"@timestamp","title":"sso_logs-*-*"},"id":"47892350-b495-11ed-af0a-cf5c93b5a3b6","migrationVersion":{"index-pattern":"7.6.0"},"references":[],"type":"index-pattern","updated_at":"2023-02-26T00:34:36.592Z","version":"WzYxLDdd"}',
        },
        {
          body:
            '{"attributes":{"columns":["http.request.method","http.response.status_code"],"description":"","hits":0,"kibanaSavedObjectMeta":{"searchSourceJSON":"{\\n  \\"highlightAll\\": true,\\n  \\"version\\": true,\\n  \\"query\\": {\\n    \\"query\\": \\"event.domain:nginx.access\\",\\n    \\"language\\": \\"kuery\\"\\n  },\\n  \\"filter\\": [],\\n  \\"indexRefName\\": \\"kibanaSavedObjectMeta.searchSourceJSON.index\\"\\n}"},"sort":[],"title":"[NGINX Core Logs 1.0] Nginx Access Logs","version":1},"id":"d80e05b2-518c-4c3d-9651-4c9d8632dce4","migrationVersion":{"search":"7.9.3"},"references":[{"id":"47892350-b495-11ed-af0a-cf5c93b5a3b6","name":"kibanaSavedObjectMeta.searchSourceJSON.index","type":"index-pattern"}],"type":"search","updated_at":"2023-02-26T00:34:36.592Z","version":"WzYyLDdd"}',
        },
        {
          body:
            '{"attributes":{"description":"","kibanaSavedObjectMeta":{"searchSourceJSON":"{\\"query\\":{\\"query\\":\\"\\",\\"language\\":\\"lucene\\"},\\"filter\\":[]}"},"savedSearchRefName":"search_0","title":"[NGINX Core Logs 1.0] Response codes over time","uiStateJSON":"{}","version":1,"visState":"{\\"title\\":\\"[NGINX Core Logs 1.0] Response codes over time\\",\\"type\\":\\"histogram\\",\\"aggs\\":[{\\"id\\":\\"1\\",\\"enabled\\":true,\\"type\\":\\"count\\",\\"params\\":{},\\"schema\\":\\"metric\\"},{\\"id\\":\\"2\\",\\"enabled\\":true,\\"type\\":\\"date_histogram\\",\\"params\\":{\\"field\\":\\"@timestamp\\",\\"timeRange\\":{\\"from\\":\\"now-24h\\",\\"to\\":\\"now\\"},\\"useNormalizedOpenSearchInterval\\":true,\\"scaleMetricValues\\":false,\\"interval\\":\\"auto\\",\\"drop_partials\\":false,\\"min_doc_count\\":1,\\"extended_bounds\\":{}},\\"schema\\":\\"segment\\"},{\\"id\\":\\"3\\",\\"enabled\\":true,\\"type\\":\\"filters\\",\\"params\\":{\\"filters\\":[{\\"input\\":{\\"query\\":\\"http.response.status_code:[200 TO 299]\\",\\"language\\":\\"lucene\\"},\\"label\\":\\"200s\\"},{\\"input\\":{\\"query\\":\\"http.response.status_code:[300 TO 399]\\",\\"language\\":\\"lucene\\"},\\"label\\":\\"300s\\"},{\\"input\\":{\\"query\\":\\"http.response.status_code:[400 TO 499]\\",\\"language\\":\\"lucene\\"},\\"label\\":\\"400s\\"},{\\"input\\":{\\"query\\":\\"http.response.status_code:[500 TO 599]\\",\\"language\\":\\"lucene\\"},\\"label\\":\\"500s\\"},{\\"input\\":{\\"query\\":\\"http.response.status_code:0\\",\\"language\\":\\"lucene\\"},\\"label\\":\\"0\\"}]},\\"schema\\":\\"group\\"}],\\"params\\":{\\"type\\":\\"histogram\\",\\"grid\\":{\\"categoryLines\\":false},\\"categoryAxes\\":[{\\"id\\":\\"CategoryAxis-1\\",\\"type\\":\\"category\\",\\"position\\":\\"bottom\\",\\"show\\":true,\\"style\\":{},\\"scale\\":{\\"type\\":\\"linear\\"},\\"labels\\":{\\"show\\":true,\\"filter\\":true,\\"truncate\\":100},\\"title\\":{}}],\\"valueAxes\\":[{\\"id\\":\\"ValueAxis-1\\",\\"name\\":\\"LeftAxis-1\\",\\"type\\":\\"value\\",\\"position\\":\\"left\\",\\"show\\":true,\\"style\\":{},\\"scale\\":{\\"type\\":\\"linear\\",\\"mode\\":\\"normal\\"},\\"labels\\":{\\"show\\":true,\\"rotate\\":0,\\"filter\\":false,\\"truncate\\":100},\\"title\\":{\\"text\\":\\"Count\\"}}],\\"seriesParams\\":[{\\"show\\":true,\\"type\\":\\"histogram\\",\\"mode\\":\\"stacked\\",\\"data\\":{\\"label\\":\\"Count\\",\\"id\\":\\"1\\"},\\"valueAxis\\":\\"ValueAxis-1\\",\\"drawLinesBetweenPoints\\":true,\\"lineWidth\\":2,\\"showCircles\\":true}],\\"addTooltip\\":true,\\"addLegend\\":true,\\"legendPosition\\":\\"right\\",\\"times\\":[],\\"addTimeMarker\\":false,\\"labels\\":{\\"show\\":false},\\"thresholdLine\\":{\\"show\\":false,\\"value\\":10,\\"width\\":1,\\"style\\":\\"full\\",\\"color\\":\\"#E7664C\\"}}}"},"id":"3b49a65d-54d8-483d-a8f0-3d7c855e1ecf","migrationVersion":{"visualization":"7.10.0"},"references":[{"id":"d80e05b2-518c-4c3d-9651-4c9d8632dce4","name":"search_0","type":"search"}],"type":"visualization","updated_at":"2023-02-26T00:34:36.592Z","version":"WzYzLDdd"}',
        },
        {
          body:
            '{"attributes":{"columns":["_source"],"description":"","hits":0,"kibanaSavedObjectMeta":{"searchSourceJSON":"{\\n  \\"highlightAll\\": true,\\n  \\"query\\": {\\n    \\"query\\": \\"http.response.status_code >= 300 and event.domain:nginx.access\\",\\n    \\"language\\": \\"kuery\\"\\n  },\\n  \\"version\\": true,\\n  \\"highlight\\": {\\n    \\"post_tags\\": [\\n      \\"@/kibana-highlighted-field@\\"\\n    ],\\n    \\"fields\\": {\\n      \\"*\\": {}\\n    },\\n    \\"pre_tags\\": [\\n      \\"@kibana-highlighted-field@\\"\\n    ],\\n    \\"require_field_match\\": false,\\n    \\"fragment_size\\": 2147483647\\n  },\\n  \\"filter\\": [],\\n  \\"indexRefName\\": \\"kibanaSavedObjectMeta.searchSourceJSON.index\\"\\n}"},"sort":[["@timestamp","desc"]],"title":"[NGINX Core Logs 1.0] Nginx Error Logs","version":1},"id":"9f820fbe-ddde-43a2-9402-30bd295c97f6","migrationVersion":{"search":"7.9.3"},"references":[{"id":"47892350-b495-11ed-af0a-cf5c93b5a3b6","name":"kibanaSavedObjectMeta.searchSourceJSON.index","type":"index-pattern"}],"type":"search","updated_at":"2023-02-26T00:34:36.592Z","version":"WzY0LDdd"}',
        },
        {
          body:
            '{"attributes":{"description":"","kibanaSavedObjectMeta":{"searchSourceJSON":"{\\"query\\":{\\"query\\":\\"\\",\\"language\\":\\"lucene\\"},\\"filter\\":[]}"},"savedSearchRefName":"search_0","title":"[NGINX Core Logs 1.0] Errors over time","uiStateJSON":"{}","version":1,"visState":"{\\"title\\":\\"[NGINX Core Logs 1.0] Errors over time\\",\\"type\\":\\"histogram\\",\\"aggs\\":[{\\"id\\":\\"1\\",\\"enabled\\":true,\\"type\\":\\"count\\",\\"params\\":{},\\"schema\\":\\"metric\\"},{\\"id\\":\\"2\\",\\"enabled\\":true,\\"type\\":\\"date_histogram\\",\\"params\\":{\\"field\\":\\"@timestamp\\",\\"timeRange\\":{\\"from\\":\\"now-24h\\",\\"to\\":\\"now\\"},\\"useNormalizedOpenSearchInterval\\":true,\\"scaleMetricValues\\":false,\\"interval\\":\\"auto\\",\\"drop_partials\\":false,\\"min_doc_count\\":1,\\"extended_bounds\\":{}},\\"schema\\":\\"segment\\"}],\\"params\\":{\\"type\\":\\"histogram\\",\\"grid\\":{\\"categoryLines\\":false},\\"categoryAxes\\":[{\\"id\\":\\"CategoryAxis-1\\",\\"type\\":\\"category\\",\\"position\\":\\"bottom\\",\\"show\\":true,\\"style\\":{},\\"scale\\":{\\"type\\":\\"linear\\"},\\"labels\\":{\\"show\\":true,\\"filter\\":true,\\"truncate\\":100},\\"title\\":{}}],\\"valueAxes\\":[{\\"id\\":\\"ValueAxis-1\\",\\"name\\":\\"LeftAxis-1\\",\\"type\\":\\"value\\",\\"position\\":\\"left\\",\\"show\\":true,\\"style\\":{},\\"scale\\":{\\"type\\":\\"linear\\",\\"mode\\":\\"normal\\"},\\"labels\\":{\\"show\\":true,\\"rotate\\":0,\\"filter\\":false,\\"truncate\\":100},\\"title\\":{\\"text\\":\\"Count\\"}}],\\"seriesParams\\":[{\\"show\\":true,\\"type\\":\\"histogram\\",\\"mode\\":\\"stacked\\",\\"data\\":{\\"label\\":\\"Count\\",\\"id\\":\\"1\\"},\\"valueAxis\\":\\"ValueAxis-1\\",\\"drawLinesBetweenPoints\\":true,\\"lineWidth\\":2,\\"showCircles\\":true}],\\"addTooltip\\":true,\\"addLegend\\":true,\\"legendPosition\\":\\"right\\",\\"times\\":[],\\"addTimeMarker\\":false,\\"labels\\":{\\"show\\":false},\\"thresholdLine\\":{\\"show\\":false,\\"value\\":10,\\"width\\":1,\\"style\\":\\"full\\",\\"color\\":\\"#E7664C\\"}}}"},"id":"865e577b-634b-4a65-b9d6-7e324c395d18","migrationVersion":{"visualization":"7.10.0"},"references":[{"id":"9f820fbe-ddde-43a2-9402-30bd295c97f6","name":"search_0","type":"search"}],"type":"visualization","updated_at":"2023-02-26T00:34:36.592Z","version":"WzY1LDdd"}',
        },
        {
          body:
            '{"attributes":{"description":"","kibanaSavedObjectMeta":{"searchSourceJSON":"{\\"query\\":{\\"query\\":\\"\\",\\"language\\":\\"kuery\\"},\\"filter\\":[]}"},"savedSearchRefName":"search_0","title":"Top Paths","uiStateJSON":"{}","version":1,"visState":"{\\"title\\":\\"Top Paths\\",\\"type\\":\\"table\\",\\"aggs\\":[{\\"id\\":\\"1\\",\\"enabled\\":true,\\"type\\":\\"count\\",\\"params\\":{},\\"schema\\":\\"metric\\"},{\\"id\\":\\"2\\",\\"enabled\\":true,\\"type\\":\\"terms\\",\\"params\\":{\\"field\\":\\"http.url\\",\\"orderBy\\":\\"1\\",\\"order\\":\\"desc\\",\\"size\\":10,\\"otherBucket\\":false,\\"otherBucketLabel\\":\\"Other\\",\\"missingBucket\\":false,\\"missingBucketLabel\\":\\"Missing\\",\\"customLabel\\":\\"Paths\\"},\\"schema\\":\\"bucket\\"}],\\"params\\":{\\"perPage\\":10,\\"showPartialRows\\":false,\\"showMetricsAtAllLevels\\":false,\\"showTotal\\":false,\\"totalFunc\\":\\"sum\\",\\"percentageCol\\":\\"\\"}}"},"id":"dc1803f0-b478-11ed-9063-ebe46f9ac203","migrationVersion":{"visualization":"7.10.0"},"references":[{"id":"d80e05b2-518c-4c3d-9651-4c9d8632dce4","name":"search_0","type":"search"}],"type":"visualization","updated_at":"2023-02-26T00:34:36.592Z","version":"WzY2LDdd"}',
        },
        {
          body:
            '{"attributes":{"description":"","kibanaSavedObjectMeta":{"searchSourceJSON":"{\\"query\\":{\\"query\\":\\"\\",\\"language\\":\\"kuery\\"},\\"filter\\":[]}"},"savedSearchRefName":"search_0","title":"Data Volume","uiStateJSON":"{}","version":1,"visState":"{\\"title\\":\\"Data Volume\\",\\"type\\":\\"area\\",\\"aggs\\":[{\\"id\\":\\"1\\",\\"enabled\\":true,\\"type\\":\\"sum\\",\\"params\\":{\\"field\\":\\"http.response.bytes\\",\\"customLabel\\":\\"Response Bytes\\"},\\"schema\\":\\"metric\\"},{\\"id\\":\\"2\\",\\"enabled\\":true,\\"type\\":\\"date_histogram\\",\\"params\\":{\\"field\\":\\"observerTime\\",\\"timeRange\\":{\\"from\\":\\"now-15m\\",\\"to\\":\\"now\\"},\\"useNormalizedOpenSearchInterval\\":true,\\"scaleMetricValues\\":false,\\"interval\\":\\"auto\\",\\"drop_partials\\":false,\\"min_doc_count\\":1,\\"extended_bounds\\":{},\\"customLabel\\":\\"\\"},\\"schema\\":\\"segment\\"}],\\"params\\":{\\"type\\":\\"area\\",\\"grid\\":{\\"categoryLines\\":false},\\"categoryAxes\\":[{\\"id\\":\\"CategoryAxis-1\\",\\"type\\":\\"category\\",\\"position\\":\\"bottom\\",\\"show\\":true,\\"style\\":{},\\"scale\\":{\\"type\\":\\"linear\\"},\\"labels\\":{\\"show\\":true,\\"filter\\":true,\\"truncate\\":100},\\"title\\":{}}],\\"valueAxes\\":[{\\"id\\":\\"ValueAxis-1\\",\\"name\\":\\"LeftAxis-1\\",\\"type\\":\\"value\\",\\"position\\":\\"left\\",\\"show\\":true,\\"style\\":{},\\"scale\\":{\\"type\\":\\"linear\\",\\"mode\\":\\"normal\\"},\\"labels\\":{\\"show\\":true,\\"rotate\\":0,\\"filter\\":false,\\"truncate\\":100},\\"title\\":{\\"text\\":\\"Response Bytes\\"}}],\\"seriesParams\\":[{\\"show\\":true,\\"type\\":\\"area\\",\\"mode\\":\\"stacked\\",\\"data\\":{\\"label\\":\\"Response Bytes\\",\\"id\\":\\"1\\"},\\"drawLinesBetweenPoints\\":true,\\"lineWidth\\":2,\\"showCircles\\":true,\\"interpolate\\":\\"linear\\",\\"valueAxis\\":\\"ValueAxis-1\\"}],\\"addTooltip\\":true,\\"addLegend\\":true,\\"legendPosition\\":\\"right\\",\\"times\\":[],\\"addTimeMarker\\":false,\\"thresholdLine\\":{\\"show\\":false,\\"value\\":10,\\"width\\":1,\\"style\\":\\"full\\",\\"color\\":\\"#E7664C\\"},\\"labels\\":{}}}"},"id":"99acc580-b47a-11ed-9063-ebe46f9ac203","migrationVersion":{"visualization":"7.10.0"},"references":[{"id":"d80e05b2-518c-4c3d-9651-4c9d8632dce4","name":"search_0","type":"search"}],"type":"visualization","updated_at":"2023-02-26T00:34:36.592Z","version":"WzY3LDdd"}',
        },
        {
          body:
            '{"attributes":{"description":"requests per minute aggregation","kibanaSavedObjectMeta":{"searchSourceJSON":"{\\"query\\":{\\"query\\":\\"\\",\\"language\\":\\"kuery\\"},\\"filter\\":[],\\"indexRefName\\":\\"kibanaSavedObjectMeta.searchSourceJSON.index\\"}"},"title":"Req-per-min","uiStateJSON":"{}","version":1,"visState":"{\\"title\\":\\"Req-per-min\\",\\"type\\":\\"table\\",\\"aggs\\":[{\\"id\\":\\"1\\",\\"enabled\\":true,\\"type\\":\\"moving_avg\\",\\"params\\":{\\"metricAgg\\":\\"custom\\",\\"customMetric\\":{\\"id\\":\\"1-metric\\",\\"enabled\\":true,\\"type\\":\\"count\\",\\"params\\":{}},\\"window\\":5,\\"script\\":\\"MovingFunctions.unweightedAvg(values)\\"},\\"schema\\":\\"metric\\"},{\\"id\\":\\"2\\",\\"enabled\\":true,\\"type\\":\\"date_histogram\\",\\"params\\":{\\"field\\":\\"@timestamp\\",\\"timeRange\\":{\\"from\\":\\"2023-02-24T17:25:00.000Z\\",\\"to\\":\\"2023-02-24T17:30:00.000Z\\"},\\"useNormalizedOpenSearchInterval\\":true,\\"scaleMetricValues\\":false,\\"interval\\":\\"m\\",\\"drop_partials\\":false,\\"min_doc_count\\":0,\\"extended_bounds\\":{},\\"customLabel\\":\\"Req/Min\\"},\\"schema\\":\\"bucket\\"}],\\"params\\":{\\"perPage\\":10,\\"showPartialRows\\":false,\\"showMetricsAtAllLevels\\":false,\\"showTotal\\":false,\\"totalFunc\\":\\"sum\\",\\"percentageCol\\":\\"\\"}}"},"id":"01ea64d0-b62f-11ed-a677-43d7aa86763b","migrationVersion":{"visualization":"7.10.0"},"references":[{"id":"47892350-b495-11ed-af0a-cf5c93b5a3b6","name":"kibanaSavedObjectMeta.searchSourceJSON.index","type":"index-pattern"}],"type":"visualization","updated_at":"2023-02-26T23:40:53.020Z","version":"WzcyLDdd"}',
        },
        {
          body:
            '{"attributes":{"description":"Nginx dashboard with basic Observability on access / error logs","hits":0,"kibanaSavedObjectMeta":{"searchSourceJSON":"{\\"query\\":{\\"language\\":\\"kuery\\",\\"query\\":\\"\\"},\\"filter\\":[]}"},"optionsJSON":"{\\"hidePanelTitles\\":false,\\"useMargins\\":true}","panelsJSON":"[{\\"version\\":\\"2.5.0\\",\\"gridData\\":{\\"h\\":8,\\"i\\":\\"1f31e50b-06e3-41e6-972e-e4e5fe1a9872\\",\\"w\\":48,\\"x\\":0,\\"y\\":0},\\"panelIndex\\":\\"1f31e50b-06e3-41e6-972e-e4e5fe1a9872\\",\\"embeddableConfig\\":{},\\"panelRefName\\":\\"panel_0\\"},{\\"version\\":\\"2.5.0\\",\\"gridData\\":{\\"h\\":9,\\"i\\":\\"d91a8da4-b34b-470a-aca6-9c76b47cd6fb\\",\\"w\\":24,\\"x\\":0,\\"y\\":8},\\"panelIndex\\":\\"d91a8da4-b34b-470a-aca6-9c76b47cd6fb\\",\\"embeddableConfig\\":{},\\"panelRefName\\":\\"panel_1\\"},{\\"version\\":\\"2.5.0\\",\\"gridData\\":{\\"h\\":15,\\"i\\":\\"27149e5a-3a77-4f3c-800e-8a160c3765f4\\",\\"w\\":24,\\"x\\":24,\\"y\\":8},\\"panelIndex\\":\\"27149e5a-3a77-4f3c-800e-8a160c3765f4\\",\\"embeddableConfig\\":{},\\"panelRefName\\":\\"panel_2\\"},{\\"version\\":\\"2.5.0\\",\\"gridData\\":{\\"x\\":0,\\"y\\":17,\\"w\\":24,\\"h\\":15,\\"i\\":\\"4d8c2aa7-159c-4a1a-80ff-00a9299056ce\\"},\\"panelIndex\\":\\"4d8c2aa7-159c-4a1a-80ff-00a9299056ce\\",\\"embeddableConfig\\":{},\\"panelRefName\\":\\"panel_3\\"},{\\"version\\":\\"2.5.0\\",\\"gridData\\":{\\"x\\":24,\\"y\\":23,\\"w\\":24,\\"h\\":15,\\"i\\":\\"800b7f19-f50c-417f-8987-21b930531cbe\\"},\\"panelIndex\\":\\"800b7f19-f50c-417f-8987-21b930531cbe\\",\\"embeddableConfig\\":{},\\"panelRefName\\":\\"panel_4\\"}]","timeRestore":false,"title":"[NGINX Core Logs 1.0] Overview","version":1},"id":"96847220-5261-44d0-89b4-65f3a659f13a","migrationVersion":{"dashboard":"7.9.3"},"references":[{"id":"3b49a65d-54d8-483d-a8f0-3d7c855e1ecf","name":"panel_0","type":"visualization"},{"id":"865e577b-634b-4a65-b9d6-7e324c395d18","name":"panel_1","type":"visualization"},{"id":"dc1803f0-b478-11ed-9063-ebe46f9ac203","name":"panel_2","type":"visualization"},{"id":"99acc580-b47a-11ed-9063-ebe46f9ac203","name":"panel_3","type":"visualization"},{"id":"01ea64d0-b62f-11ed-a677-43d7aa86763b","name":"panel_4","type":"visualization"}],"type":"dashboard","updated_at":"2023-02-26T23:44:09.855Z","version":"WzczLDdd"}',
        },
        {
          body: '{"exportedCount":9,"missingRefCount":0,"missingReferences":[]}',
        },
      ],
    },
  });

  const getModal = (name: string) => {
    setModalLayout(
      getAddIntegrationModal(
        () => {
          addIntegrationRequest(name);
          setIsModalVisible(false);
        },
        () => {
          setIsModalVisible(false);
        },
        'Name',
        'Namespace',
        'Tags (optional)',
        name,
        'prod',
        'Add Integration Options',
        'Cancel',
        'Add',
        'test'
      )
    );
    setIsModalVisible(true);
  };

  useEffect(() => {
    chrome.setBreadcrumbs([
      ...parentBreadcrumbs,
      {
        text: 'Placeholder',
        href: '#/integrations',
      },
      {
        text: appId,
        href: `${last(parentBreadcrumbs)!.href}integrations/${appId}`,
      },
    ]);
    handleDataRequest();
  }, [appId]);

  async function handleDataRequest() {
    http.get(`${OBSERVABILITY_BASE}/repository/id`).then((exists) => setData(exists));
  }

  const setToast = (title: string, color = 'success', text?: ReactChild) => {
    if (!text) text = '';
    setToasts([...toasts, { id: new Date().toISOString(), title, text, color } as Toast]);
  };

  async function addIntegrationRequest(name: string) {
    http
      .post(`${OBSERVABILITY_BASE}/store`)
      .then((res) => {
        setToast(
          `${name} integration successfully added!`,
          'success',
          `View the added assets from ${name} in the Added Integrations list`
        );
      })
      .catch((err) =>
        setToast(
          'Failed to load integration. Check Added Integrations table for more details',
          'danger'
        )
      );
  }

  console.log(data);
  return (
    <EuiPage>
      <EuiGlobalToastList
        toasts={toasts}
        dismissToast={(removedToast) => {
          setToasts(toasts.filter((toast) => toast.id !== removedToast.id));
        }}
        toastLifeTimeMs={6000}
      />
      <EuiPageBody>
        <EuiSpacer size="xl" />
        {IntegrationOverview({ data, getModal })}
        <EuiSpacer />
        {IntegrationDetails({ data })}
        <EuiSpacer />
        {IntegrationAssets({ data })}
        <EuiSpacer />
        {IntegrationFields({ data })}
        <EuiSpacer />
      </EuiPageBody>
      {isModalVisible && modalLayout}
    </EuiPage>
  );
}
