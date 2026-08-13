export type RuntimeMode = 'demo';

export const runtimeConfig = {
  mode: 'demo',
  cloudEnabled: false,
  showDeveloperTools: false,
} as const satisfies {
  mode: RuntimeMode;
  cloudEnabled: boolean;
  showDeveloperTools: boolean;
};
