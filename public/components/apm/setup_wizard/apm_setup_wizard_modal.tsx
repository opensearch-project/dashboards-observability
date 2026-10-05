/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiOverlayMask,
  EuiSpacer,
  EuiStepsHorizontal,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { NotificationsStart } from '../../../../../../src/core/public';
import { getWorkspaceIdFromUrl } from '../../../../../../src/core/public/utils';
import { coreRefs } from '../../../framework/core_refs';
import { OSDSavedApmConfigClient } from '../../../services/saved_objects/saved_object_client/osd_saved_objects/apm_config';
import { useApmConfig } from '../config/apm_config_context';
import { useDatasets } from '../shared/hooks/use_apm_config';
import { useApmDetection } from './hooks/use_apm_detection';
import { OverviewStep } from './steps/overview_step';
import { TracesStep } from './steps/traces_step';
import { ServicesStep } from './steps/services_step';
import { MetricsStep } from './steps/metrics_step';
import { StepState, WizardStep } from './types';
import './setup_wizard.scss';

export interface ApmSetupWizardModalProps {
  onClose: (saved?: boolean) => void;
  notifications: NotificationsStart;
}

const STEP_ORDER: WizardStep[] = ['overview', 'traces', 'services', 'metrics'];

const STEP_TITLES: Record<WizardStep, string> = {
  overview: i18n.translate('observability.apm.setupWizard.step.overview', {
    defaultMessage: 'Overview',
  }),
  traces: i18n.translate('observability.apm.setupWizard.step.traces', {
    defaultMessage: 'Traces',
  }),
  services: i18n.translate('observability.apm.setupWizard.step.services', {
    defaultMessage: 'Services',
  }),
  metrics: i18n.translate('observability.apm.setupWizard.step.metrics', {
    defaultMessage: 'RED metrics',
  }),
};

const initialStepState: StepState = { status: 'checking' };

/**
 * Four-page guided onboarding wizard for Application Monitoring. Detects and
 * (for traces + services) auto-creates the required saved objects, lets the
 * user reuse existing ones, and on Finish writes the linking APM config via the
 * same client the manual "APM Settings" flow uses.
 */
export const ApmSetupWizardModal = ({ onClose, notifications }: ApmSetupWizardModalProps) => {
  const { config: existingConfig } = useApmConfig();
  const detection = useApmDetection();
  // Loaded once here and shared with both the traces and services steps, so the
  // dataset list isn't re-fetched each time the user navigates between them.
  const datasets = useDatasets();

  const [currentStep, setCurrentStep] = useState<WizardStep>('overview');
  const [isSaving, setIsSaving] = useState(false);

  // Ids collected across the steps that feed the final config write.
  const [tracesDatasetId, setTracesDatasetId] = useState<string>('');
  const [serviceMapDatasetId, setServiceMapDatasetId] = useState<string>('');
  const [prometheusDataSourceId, setPrometheusDataSourceId] = useState<string>('');

  // Each page picks its own data source (traces and services can target
  // different clusters). '' means the local cluster. `undefined` on traces means
  // not yet defaulted. Services follows the traces source by default (common
  // case: both signals on one cluster) until the user overrides it explicitly.
  const [tracesDataSourceId, setTracesDataSourceId] = useState<string | undefined>(undefined);
  const [servicesDataSourceOverride, setServicesDataSourceOverride] = useState<string | undefined>(
    undefined
  );

  // Per-step status for gating Next/Finish.
  const [tracesState, setTracesState] = useState<StepState>(initialStepState);
  const [servicesState, setServicesState] = useState<StepState>(initialStepState);
  const [metricsState, setMetricsState] = useState<StepState>(initialStepState);

  const workspaceId = getWorkspaceIdFromUrl(
    window.location.href,
    coreRefs.http?.basePath?.serverBasePath || ''
  );

  // Default the traces source to the first source that has trace data, once
  // detection resolves (falls back to the first source overall).
  const { detections } = detection;
  const pickFirstWith = (has: (d: (typeof detections)[number]) => boolean) =>
    (detections.find(has) ?? detections[0])?.dataSourceId || '';

  useEffect(() => {
    if (detections.length === 0) return;
    if (tracesDataSourceId === undefined) {
      setTracesDataSourceId(pickFirstWith((d) => d.tracesDetected));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detections, tracesDataSourceId]);

  // Effective services source: the user's explicit override, else follow the
  // traces source (common single-cluster case). We deliberately do NOT silently
  // jump to a different source when the traces source lacks a service map —
  // instead the Services step keeps that source selected and surfaces a "no
  // service map data" callout, so the user can knowingly switch.
  const servicesDataSourceId = servicesDataSourceOverride ?? tracesDataSourceId ?? '';

  const currentIndex = STEP_ORDER.indexOf(currentStep);
  const isLastStep = currentIndex === STEP_ORDER.length - 1;

  const stepIsComplete = (state: StepState) =>
    state.status === 'exists' || state.status === 'created';

  // Can advance past a data step only once its object exists or was created.
  const canGoNext = useMemo(() => {
    switch (currentStep) {
      case 'overview':
        return true;
      case 'traces':
        return stepIsComplete(tracesState);
      case 'services':
        return stepIsComplete(servicesState);
      case 'metrics':
        return stepIsComplete(metricsState);
      default:
        return false;
    }
  }, [currentStep, tracesState, servicesState, metricsState]);

  const canFinish =
    stepIsComplete(tracesState) &&
    stepIsComplete(servicesState) &&
    stepIsComplete(metricsState) &&
    !!tracesDatasetId &&
    !!serviceMapDatasetId &&
    !!prometheusDataSourceId;

  const goNext = () => {
    if (!isLastStep) {
      setCurrentStep(STEP_ORDER[currentIndex + 1]);
    }
  };

  const goBack = () => {
    if (currentIndex > 0) {
      setCurrentStep(STEP_ORDER[currentIndex - 1]);
    }
  };

  const handleFinish = async () => {
    if (!canFinish) return;

    if (!workspaceId) {
      notifications.toasts.addDanger({
        title: i18n.translate('observability.apm.setupWizard.toast.noWorkspaceTitle', {
          defaultMessage: 'Cannot save configuration',
        }),
        text: i18n.translate('observability.apm.setupWizard.toast.noWorkspaceText', {
          defaultMessage: 'No workspace ID found',
        }),
      });
      return;
    }

    setIsSaving(true);
    try {
      const client = OSDSavedApmConfigClient.getInstance();
      if (existingConfig?.objectId) {
        await client.update({
          objectId: existingConfig.objectId,
          tracesDatasetId,
          serviceMapDatasetId,
          prometheusDataSourceId,
        });
      } else {
        await client.create({
          workspaceId,
          tracesDatasetId,
          serviceMapDatasetId,
          prometheusDataSourceId,
        });
      }

      notifications.toasts.addSuccess({
        title: i18n.translate('observability.apm.setupWizard.toast.savedTitle', {
          defaultMessage: 'Application monitoring is set up',
        }),
        text: i18n.translate('observability.apm.setupWizard.toast.savedText', {
          defaultMessage: 'Your APM configuration has been saved.',
        }),
      });
      onClose(true);
    } catch (error) {
      notifications.toasts.addError(error instanceof Error ? error : new Error(String(error)), {
        title: i18n.translate('observability.apm.setupWizard.toast.saveErrorTitle', {
          defaultMessage: 'Failed to save configuration',
        }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Completion state per step index (overview has no gate).
  const completeByIndex: boolean[] = STEP_ORDER.map((step) => {
    switch (step) {
      case 'overview':
        return true;
      case 'traces':
        return stepIsComplete(tracesState);
      case 'services':
        return stepIsComplete(servicesState);
      case 'metrics':
        return stepIsComplete(metricsState);
      default:
        return false;
    }
  });

  // A step is reachable if it's the current/a prior step, or every step before
  // it is complete — so users can click forward only to validated steps, but
  // can always revisit earlier ones.
  const isReachable = (index: number) =>
    index <= currentIndex || completeByIndex.slice(0, index).every(Boolean);

  const horizontalSteps = STEP_ORDER.map((step, index) => ({
    title: STEP_TITLES[step],
    isSelected: step === currentStep,
    isComplete: index < currentIndex && completeByIndex[index],
    disabled: !isReachable(index),
    onClick: () => {
      if (isReachable(index)) {
        setCurrentStep(step);
      }
    },
  }));

  const renderStep = () => {
    switch (currentStep) {
      case 'overview':
        return <OverviewStep />;
      case 'traces':
        return (
          <TracesStep
            detection={detection}
            datasets={datasets}
            notifications={notifications}
            state={tracesState}
            onStateChange={setTracesState}
            onTracesDatasetIdChange={setTracesDatasetId}
            selectedDataSourceId={tracesDataSourceId ?? ''}
            onSelectedDataSourceIdChange={setTracesDataSourceId}
          />
        );
      case 'services':
        return (
          <ServicesStep
            detection={detection}
            datasets={datasets}
            notifications={notifications}
            state={servicesState}
            onStateChange={setServicesState}
            onServiceMapDatasetIdChange={setServiceMapDatasetId}
            selectedDataSourceId={servicesDataSourceId}
            onSelectedDataSourceIdChange={setServicesDataSourceOverride}
          />
        );
      case 'metrics':
        return (
          <MetricsStep
            state={metricsState}
            onStateChange={setMetricsState}
            onPrometheusDataSourceIdChange={setPrometheusDataSourceId}
          />
        );
      default:
        return null;
    }
  };

  return (
    <EuiOverlayMask>
      <EuiModal
        onClose={() => onClose()}
        style={{ width: 760, maxWidth: '90vw' }}
        data-test-subj="apmSetupWizardModal"
      >
        <EuiModalHeader>
          <EuiModalHeaderTitle>
            {i18n.translate('observability.apm.setupWizard.title', {
              defaultMessage: 'Set up Application Monitoring',
            })}
          </EuiModalHeaderTitle>
        </EuiModalHeader>

        <EuiModalBody>
          <div className="apmSetupWizardSteps">
            <EuiStepsHorizontal steps={horizontalSteps} />
          </div>
          <EuiSpacer size="s" />
          {/* Fixed-height content area keeps the modal from resizing (and
              flickering) as steps and their loading states swap in. */}
          <div className="apmSetupWizardStepContent">{renderStep()}</div>
        </EuiModalBody>

        <EuiModalFooter>
          <EuiButtonEmpty onClick={() => onClose()} data-test-subj="apmSetupWizardCancel">
            {i18n.translate('observability.apm.setupWizard.cancel', {
              defaultMessage: 'Cancel',
            })}
          </EuiButtonEmpty>
          {currentIndex > 0 && (
            <EuiButtonEmpty onClick={goBack} data-test-subj="apmSetupWizardBack">
              {i18n.translate('observability.apm.setupWizard.back', {
                defaultMessage: 'Back',
              })}
            </EuiButtonEmpty>
          )}
          {isLastStep ? (
            <EuiButton
              fill
              onClick={handleFinish}
              isLoading={isSaving}
              isDisabled={!canFinish || isSaving}
              data-test-subj="apmSetupWizardFinish"
            >
              {i18n.translate('observability.apm.setupWizard.finish', {
                defaultMessage: 'Finish',
              })}
            </EuiButton>
          ) : (
            <EuiButton
              fill
              onClick={goNext}
              isDisabled={!canGoNext}
              data-test-subj="apmSetupWizardNext"
            >
              {i18n.translate('observability.apm.setupWizard.next', {
                defaultMessage: 'Next',
              })}
            </EuiButton>
          )}
        </EuiModalFooter>
      </EuiModal>
    </EuiOverlayMask>
  );
};
