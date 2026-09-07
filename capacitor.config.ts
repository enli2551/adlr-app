import type { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.adlr.app',
  appName: 'ADLR',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#C9A84C',
      sound: 'rest_done.wav',
    },
  },
};

export default config;
