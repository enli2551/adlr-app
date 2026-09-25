import type { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.adlr.app',
  appName: 'ADLR',
  webDir: 'dist',
  plugins: {
    // Route fetch/XHR through native HTTP. Fixes Supabase auth/REST calls
    // failing with "TypeError: Load failed" in the iOS WKWebView (the
    // capacitor://localhost origin trips WebView CORS/ATS on external requests).
    CapacitorHttp: {
      enabled: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#C9A84C',
      sound: 'rest_done.wav',
    },
  },
};

export default config;
