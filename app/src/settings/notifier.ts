import * as Notifications from 'expo-notifications';
import type { Notifier } from './reminder';

/** Daily local notification on the phone. Nothing is sent to any server. */
export const expoNotifier: Notifier = {
  async requestPermission() {
    try {
      const current = await Notifications.getPermissionsAsync();
      let status = current.status;
      if (status !== 'granted' && current.canAskAgain) status = (await Notifications.requestPermissionsAsync()).status;
      return status === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'unsupported';
    }
  },
  async cancelAll() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {
      // nothing scheduled or not supported here
    }
  },
  async scheduleDaily(hour, minute, title, body) {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  },
};
