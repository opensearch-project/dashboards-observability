import React from 'react';
import { useOpenSearchDashboards } from '../../../../../../src/plugins/opensearch_dashboards_react/public';
import { ToastInputFields } from '../../../../../../src/core/public';
import { ObservabilityAppServices } from '../../../../common/types/shared';

type Color = 'success' | 'primary' | 'warning' | 'danger' | undefined;

export const useToast = () => {
  const {
    services: { toasts },
  } = useOpenSearchDashboards<ObservabilityAppServices>();

  const setToast = (title: string, color: Color = 'success', text?, side?: string) => {
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
