export type RuntimeMode = 'cloud' | 'local';

export const runtimeConfig = {
  mode: 'local',
  cloudEnabled: false,
  cloudTraceUser: false,
  showDeveloperTools: false,
} as const satisfies {
  mode: RuntimeMode;
  cloudEnabled: boolean;
  cloudTraceUser: boolean;
  showDeveloperTools: boolean;
};
