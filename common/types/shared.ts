import { CoreStart, ToastsStart } from '../../../../src/core/public';

export interface ObservabilityAppServices extends CoreStart {
  toasts: ToastsStart;
}
