export type RuntimeMode = 'local';

export const runtimeConfig = {
  mode: 'local',
  cloudEnabled: false,
  showDeveloperTools: false,
} as const satisfies {
  mode: RuntimeMode;
  cloudEnabled: boolean;
  showDeveloperTools: boolean;
};
