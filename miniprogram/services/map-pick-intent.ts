export interface MapPickIntent {
  readonly requestedAt: number;
  readonly source: 'record-tab';
}

let pendingIntent: MapPickIntent | null = null;

export function setMapPickIntent(intent: MapPickIntent): void {
  pendingIntent = intent;
}

export function consumeMapPickIntent(): MapPickIntent | null {
  const intent = pendingIntent;
  pendingIntent = null;
  return intent;
}
