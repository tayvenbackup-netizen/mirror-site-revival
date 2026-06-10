import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.2b96dce9e9424a6e9f291cb9322d0ccf',
  appName: 'mirror-site-revival',
  webDir: 'dist',
  server: {
    url: 'https://2b96dce9-e942-4a6e-9f29-1cb9322d0ccf.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  ios: {
    contentInset: 'always',
  },
};

export default config;