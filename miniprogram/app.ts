import { runtimeConfig } from './config/runtime';

App({
  globalData: {
    runtimeMode: runtimeConfig.mode,
  },
});
