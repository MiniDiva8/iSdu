export type RuntimeMode = 'demo';

export const runtimeConfig = {
  mode: 'demo',
  cloudEnabled: false,
} as const satisfies {
  mode: RuntimeMode;
  cloudEnabled: boolean;
};
