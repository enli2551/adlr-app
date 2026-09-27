import type { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.adlr.app',
  appName: 'ADLR',
  webDir: 'dist',
  plugins: {
    // NOTE: CapacitorHttp is intentionally NOT enabled. It patches fetch to go
    // through native HTTP, which returns a non-spec Response that breaks
    // supabase-js (login returned "Type error" while a raw fetch got 200).
    // Supabase sends Access-Control-Allow-Origin: *, so the standard WKWebView
    // fetch works fine from capacitor://localhost.
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#C9A84C',
      sound: 'rest_done.wav',
    },
  },
};

export default config;
