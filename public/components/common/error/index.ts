/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export {
  extractClassifiedError,
  classifiedToastColor,
  classifiedToastText,
  showClassifiedErrorToast,
} from './extract';
export type { ToastsLike, ClassifiedToastColor } from './extract';
export { shouldShowCorrelationReference } from './extract';
export { ClassifiedErrorCallout } from './classified_error_callout';
export type { ClassifiedErrorCalloutProps } from './classified_error_callout';
export {
  ClassifiedErrorToastBody,
  ClassifiedErrorModal,
  fullErrorText,
} from './classified_error_toast';
export type {
  ClassifiedErrorToastBodyProps,
  ClassifiedErrorModalProps,
} from './classified_error_toast';
