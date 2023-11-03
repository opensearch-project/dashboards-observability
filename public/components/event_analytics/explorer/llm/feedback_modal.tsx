/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiForm,
  EuiFormRow,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiRadioGroup,
  EuiTextArea,
} from '@elastic/eui';
import React, { useState } from 'react';
import { HttpStart } from '../../../../../../../src/core/public';
import { getPPLService } from '../../../../../common/utils';
import { coreRefs } from '../../../../framework/core_refs';

export interface LabelData {
  formHeader: string;
  inputPlaceholder: string;
  outputPlaceholder: string;
}

export interface FeedbackFormData {
  input: string;
  output: string;
  correct: boolean | undefined;
  expectedOutput: string;
  comment: string;
}

interface FeedbackMetaData {
  type: 'event_analytics' | 'chat' | 'ppl_submit';
  chatId?: string;
  sessionId?: string;
  error?: boolean;
  selectedIndex?: string;
}

interface FeedbackModelProps {
  input?: string;
  output?: string;
  metadata: FeedbackMetaData;
  onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModelProps> = (props) => {
  const [formData, setFormData] = useState<FeedbackFormData>({
    input: props.input ?? '',
    output: props.output ?? '',
    correct: undefined,
    expectedOutput: '',
    comment: '',
  });
  return (
    <EuiModal onClose={props.onClose}>
      <FeedbackModalContent
        formData={formData}
        setFormData={setFormData}
        metadata={props.metadata}
        onClose={props.onClose}
      />
    </EuiModal>
  );
};

interface FeedbackModalContentProps {
  formData: FeedbackFormData;
  setFormData: React.Dispatch<React.SetStateAction<FeedbackFormData>>;
  metadata: FeedbackMetaData;
  displayLabels?: Partial<Record<keyof FeedbackFormData, string>> & Partial<LabelData>;
  onClose: () => void;
}

export const FeedbackModalContent: React.FC<FeedbackModalContentProps> = (props) => {
  const labels: NonNullable<Required<typeof props.displayLabels>> = Object.assign(
    {
      formHeader: 'Olly Skills Feedback',
      inputPlaceholder: 'Your input question',
      input: 'Input question',
      outputPlaceholder: 'The LLM response',
      output: 'Output',
      correct: 'Does the output match your expectations?',
      expectedOutput: 'Expected output',
      comment: 'Comment',
    },
    props.displayLabels
  );
  const { loading, submitFeedback } = useSubmitFeedback(
    props.formData,
    props.metadata,
    coreRefs.http!
  );
  const [formErrors, setFormErrors] = useState<
    Partial<{ [x in keyof FeedbackFormData]: string[] }>
  >({
    input: [],
    output: [],
    expectedOutput: [],
  });

  const hasError = (key?: keyof FeedbackFormData) => {
    if (!key) return Object.values(formErrors).some((e) => !!e.length);
    return !!formErrors[key]?.length;
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors = {
      input: validator
        .input(props.formData.input)
        .concat(await validator.validateQuery(props.formData.input, props.metadata.type)),
      output: validator.output(props.formData.output),
      correct: validator.correct(props.formData.correct),
      expectedOutput: validator.expectedOutput(
        props.formData.expectedOutput,
        props.formData.correct === false
      ),
    };
    if (Object.values(errors).some((e) => !!e.length)) {
      setFormErrors(errors);
      return;
    }

    try {
      await submitFeedback();
      props.setFormData({
        input: '',
        output: '',
        correct: undefined,
        expectedOutput: '',
        comment: '',
      });
      coreRefs.toasts?.addSuccess('Thanks for your feedback!');
      props.onClose();
    } catch (e) {
      coreRefs.toasts?.addError(e, { title: 'Failed to submit feedback' });
    }
  };

  return (
    <>
      <EuiModalHeader>
        <EuiModalHeaderTitle>{labels.formHeader}</EuiModalHeaderTitle>
      </EuiModalHeader>

      <EuiModalBody>
        <EuiForm
          isInvalid={hasError()}
          error={Object.values(formErrors).flat()}
          component="form"
          id="feedback-form"
          onSubmit={onSubmit}
        >
          <EuiFormRow label={labels.input} isInvalid={hasError('input')} error={formErrors.input}>
            <EuiTextArea
              compressed
              placeholder={labels.inputPlaceholder}
              value={props.formData.input}
              onChange={(e) => props.setFormData({ ...props.formData, input: e.target.value })}
              onBlur={(e) => {
                setFormErrors({ ...formErrors, input: validator.input(e.target.value) });
              }}
              isInvalid={hasError('input')}
            />
          </EuiFormRow>
          <EuiFormRow
            label={labels.output}
            isInvalid={hasError('output')}
            error={formErrors.output}
          >
            <EuiTextArea
              compressed
              placeholder={labels.outputPlaceholder}
              value={props.formData.output}
              onChange={(e) => props.setFormData({ ...props.formData, output: e.target.value })}
              onBlur={(e) => {
                setFormErrors({ ...formErrors, output: validator.output(e.target.value) });
              }}
              isInvalid={hasError('output')}
            />
          </EuiFormRow>
          {props.metadata.type !== 'ppl_submit' && (
            <EuiFormRow
              label={labels.correct}
              isInvalid={hasError('correct')}
              error={formErrors.correct}
            >
              <EuiRadioGroup
                options={[
                  { id: 'yes', label: 'Yes' },
                  { id: 'no', label: 'No' },
                ]}
                idSelected={
                  props.formData.correct === undefined
                    ? undefined
                    : props.formData.correct === true
                    ? 'yes'
                    : 'no'
                }
                onChange={(id) => {
                  props.setFormData({ ...props.formData, correct: id === 'yes' });
                  setFormErrors({ ...formErrors, expectedOutput: [] });
                }}
                onBlur={() => setFormErrors({ ...formErrors, correct: [] })}
              />
            </EuiFormRow>
          )}
          {props.formData.correct === false && (
            <EuiFormRow
              label={labels.expectedOutput}
              isInvalid={hasError('expectedOutput')}
              error={formErrors.expectedOutput}
            >
              <EuiTextArea
                compressed
                placeholder="The expected response from LLM"
                value={props.formData.expectedOutput}
                onChange={(e) =>
                  props.setFormData({ ...props.formData, expectedOutput: e.target.value })
                }
                onBlur={(e) => {
                  setFormErrors({
                    ...formErrors,
                    expectedOutput: validator.expectedOutput(
                      e.target.value,
                      props.formData.correct === false
                    ),
                  });
                }}
                isInvalid={hasError('expectedOutput')}
              />
            </EuiFormRow>
          )}
          <EuiFormRow label={labels.comment}>
            <EuiTextArea
              compressed
              placeholder="Additional feedback you would like to leave"
              value={props.formData.comment}
              onChange={(e) => props.setFormData({ ...props.formData, comment: e.target.value })}
            />
          </EuiFormRow>
        </EuiForm>
      </EuiModalBody>

      <EuiModalFooter>
        <EuiButtonEmpty onClick={props.onClose}>Cancel</EuiButtonEmpty>
        <EuiButton type="submit" form="feedback-form" fill isLoading={loading}>
          Send
        </EuiButton>
      </EuiModalFooter>
    </>
  );
};

const useSubmitFeedback = (data: FeedbackFormData, metadata: FeedbackMetaData, http: HttpStart) => {
  const [loading, setLoading] = useState(false);
  return {
    loading,
    submitFeedback: async () => {
      setLoading(true);
      const auth = await http
        .get<{ data: { user_name: string; user_requested_tenant: string; roles: string[] } }>(
          '/api/v1/configuration/account'
        )
        .then((res) => ({ user: res.data.user_name, tenant: res.data.user_requested_tenant }));

      return http
        .post('/api/assistant/feedback', {
          body: JSON.stringify({ metadata: { ...metadata, ...auth }, ...data }),
        })
        .finally(() => setLoading(false));
    },
  };
};

const validatePPLQuery = async (logsQuery: string, feedBackType: FeedbackMetaData['type']) => {
  let responseMessage: [] | string[] = [];
  const errorMessage = [' Invalid PPL Query, please re-check the ppl syntax'];

  if (feedBackType === 'ppl_submit') {
    const pplService = getPPLService();
    await pplService
      .fetch({ query: logsQuery, format: 'jdbc' })
      .then((res) => {
        if (res === undefined) responseMessage = errorMessage;
      })
      .catch((error: Error) => {
        responseMessage = errorMessage;
      });
  }
  return responseMessage;
};

const validator = {
  input: (text: string) => (text.trim().length === 0 ? ['Input is required'] : []),
  output: (text: string) => (text.trim().length === 0 ? ['Output is required'] : []),
  correct: (correct: boolean | undefined) =>
    correct === undefined ? ['Correctness is required'] : [],
  expectedOutput: (text: string, required: boolean) =>
    required && text.trim().length === 0 ? ['expectedOutput is required'] : [],
  validateQuery: async (logsQuery: string, feedBackType: FeedbackMetaData['type']) =>
    await validatePPLQuery(logsQuery, feedBackType),
};
