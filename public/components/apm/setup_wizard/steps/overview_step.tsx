/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { EuiText, EuiSpacer, EuiLink, EuiListGroup } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import { coreRefs } from '../../../../framework/core_refs';
import { RequirementCallout } from '../components/requirement_callout';
import { ApmArchitectureSvgLight, ApmArchitectureSvgDark } from '../../config/apm-architecture-svg';
import { APM_TRACES_INDEX_PATTERN, APM_SERVICE_MAP_INDEX_PATTERN } from '../constants';
import { APM_DOCS_URL, APM_PIPELINE_DOCS_URL } from '../../common/constants';

/**
 * Page 1 — explains what Application Monitoring is, the objects the wizard will
 * set up, and links documentation. No action; the user just proceeds.
 */
export const OverviewStep = () => {
  // Match the settings modal: swap the diagram based on the darkMode uiSetting.
  const [isDarkMode] = useState(() => {
    const theme = coreRefs.core?.uiSettings?.get('theme:darkMode');
    return theme === true || theme === 'true';
  });

  return (
    <div data-test-subj="apmSetupWizardOverviewStep">
      {/* 1. Concept first, so the reader knows what APM is. */}
      <EuiText>
        <h3>
          <FormattedMessage
            id="observability.apm.setupWizard.overview.heading"
            defaultMessage="What is Application Monitoring?"
          />
        </h3>
        <p>
          <FormattedMessage
            id="observability.apm.setupWizard.overview.description"
            defaultMessage="Application Monitoring (APM) correlates distributed traces, service maps, and RED metrics (Rate, Errors, Duration) so you can understand service health and dependencies. This wizard checks for the data it needs and helps you create the required datasets in one click."
          />
        </p>
      </EuiText>

      <EuiSpacer size="s" />

      {/* 2. Application Telemetry Flow diagram (reused from APM settings). */}
      <EuiText size="s">
        <strong>
          {i18n.translate('observability.apm.setupWizard.overview.telemetryFlowTitle', {
            defaultMessage: 'Application Telemetry Flow',
          })}
        </strong>
      </EuiText>
      <EuiText size="xs" color="subdued">
        <p>
          {i18n.translate('observability.apm.setupWizard.overview.telemetryFlowDescription', {
            defaultMessage:
              'Configure Data Prepper pipelines first to collect and export Traces, Logs and Service map into OpenSearch and RED metrics into Prometheus.',
          })}{' '}
          <EuiLink href={APM_PIPELINE_DOCS_URL} target="_blank" external>
            {i18n.translate('observability.apm.setupWizard.overview.pipelineDocs', {
              defaultMessage: 'Sample pipeline setup',
            })}
          </EuiLink>
        </p>
      </EuiText>
      <EuiSpacer size="s" />
      <div style={{ textAlign: 'center', overflow: 'auto' }}>
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(
            isDarkMode ? ApmArchitectureSvgDark : ApmArchitectureSvgLight
          )}`}
          alt={i18n.translate('observability.apm.setupWizard.overview.architectureDiagramAlt', {
            defaultMessage: 'APM Architecture Diagram',
          })}
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>

      <EuiSpacer size="s" />

      {/* 3. What this wizard does + requirements. */}
      <EuiText size="s">
        <strong>
          <FormattedMessage
            id="observability.apm.setupWizard.overview.requirementsHeading"
            defaultMessage="This wizard will set up:"
          />
        </strong>
      </EuiText>
      <EuiListGroup
        size="s"
        listItems={[
          {
            label: i18n.translate('observability.apm.setupWizard.overview.tracesItem', {
              defaultMessage: 'A traces dataset (and correlated logs) from your span data',
            }),
            iconType: 'apmTrace',
          },
          {
            label: i18n.translate('observability.apm.setupWizard.overview.servicesItem', {
              defaultMessage: 'A service map dataset from your service-map data',
            }),
            iconType: 'graphApp',
          },
          {
            label: i18n.translate('observability.apm.setupWizard.overview.metricsItem', {
              defaultMessage: 'A link to a Prometheus data source exposing RED metrics',
            }),
            iconType: 'visLine',
          },
        ]}
      />

      <EuiSpacer size="m" />

      <RequirementCallout
        title={i18n.translate('observability.apm.setupWizard.overview.calloutTitle', {
          defaultMessage: 'Auto-create requirements',
        })}
        docsUrl={APM_PIPELINE_DOCS_URL}
      >
        <p>
          <FormattedMessage
            id="observability.apm.setupWizard.overview.calloutBody"
            defaultMessage="For one-click setup, your data must follow the OpenTelemetry conventions: traces in {tracePattern} and a service map in {serviceMapPattern}."
            values={{
              tracePattern: <code>{APM_TRACES_INDEX_PATTERN}</code>,
              serviceMapPattern: <code>{APM_SERVICE_MAP_INDEX_PATTERN}</code>,
            }}
          />
        </p>
        <p>
          <FormattedMessage
            id="observability.apm.setupWizard.overview.calloutExisting"
            defaultMessage="Already have datasets that don't match these names? You can still select them in APM Settings — the conventions are only needed for the automated setup here."
          />
        </p>
      </RequirementCallout>

      <EuiSpacer size="s" />

      <EuiText size="s">
        <p>
          <EuiLink href={APM_DOCS_URL} target="_blank" external>
            <FormattedMessage
              id="observability.apm.setupWizard.overview.docsLink"
              defaultMessage="View observability documentation"
            />
          </EuiLink>
        </p>
      </EuiText>
    </div>
  );
};
