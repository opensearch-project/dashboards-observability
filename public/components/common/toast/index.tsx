/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToastInputFields } from '../../../../../../src/core/public';
import { coreRefs } from '../../../framework/core_refs';

type Color = 'success' | 'primary' | 'warning' | 'danger' | undefined;

export const useToast = () => {
  const toasts = coreRefs.toasts!;

  const setToast = (title: string, color: Color = 'success', text?: string) => {
    const newToast: ToastInputFields = {
      id: new Date().toISOString(),
      title,
      text,
    };
    switch (color) {
      case 'danger': {
        toasts.addDanger(newToast);
        break;
      }
      case 'warning': {
        toasts.addWarning(newToast);
        break;
      }
      default: {
        toasts.addSuccess(newToast);
        break;
      }
    }
  };

  return { setToast };
};
