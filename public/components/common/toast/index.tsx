/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MountPoint, ToastInputFields } from '../../../../../../src/core/public';
import { coreRefs } from '../../../framework/core_refs';

type Color = 'success' | 'primary' | 'warning' | 'danger' | undefined;

// Monotonic counter so two toasts raised in the same millisecond get distinct
// ids. A bare `new Date().toISOString()` collides when, e.g., a single submit
// raises two failure toasts, and EUI dedupes same-id toasts into one entry.
let toastSeq = 0;

export const useToast = () => {
  const toasts = coreRefs.toasts!;

  // `text` accepts a MountPoint (e.g. toMountPoint(<ClassifiedErrorToastBody/>))
  // in addition to a plain string, so callers can render a rich toast body such
  // as the "See full error" expander.
  const setToast = (title: string, color: Color = 'success', text?: string | MountPoint) => {
    const newToast: ToastInputFields = {
      id: `${new Date().toISOString()}-${(toastSeq += 1)}`,
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
