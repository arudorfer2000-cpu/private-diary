import type { Notifier } from './reminder';

/** BROWSER TEST HARNESS ONLY: browsers cannot schedule daily local notifications. */
export const expoNotifier: Notifier = {
  requestPermission: async () => 'unsupported',
  cancelAll: async () => {},
  scheduleDaily: async () => {},
};
