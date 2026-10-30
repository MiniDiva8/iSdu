export interface PalAITurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}
export interface PalAIReply {
  readonly id: string;
  readonly type: 'chat' | 'letter';
  readonly title: string;
  readonly text: string;
  readonly action: 'none' | 'happy' | 'rest';
  readonly date: string;
  readonly partnerId: string;
  readonly partnerName: string;
  readonly sourceMemoryId?: string;
  readonly read?: boolean;
}
export interface PalAIStatus {
  readonly enabled: boolean;
  readonly available: boolean;
  readonly paused: boolean;
  readonly reason: string;
  readonly chatsRemaining: number;
  readonly lettersRemaining: number;
  readonly history: readonly PalAITurn[];
  readonly letters: readonly PalAIReply[];
}
export interface PalAIChatRequest {
  readonly requestId: string;
  readonly partnerId: string;
  readonly partnerName: string;
  readonly text: string;
}
export interface PalAILetterRequest {
  readonly requestId: string;
  readonly partnerId: string;
  readonly partnerName: string;
  readonly memoryId: string;
  readonly diaryConsent: true;
  readonly confirmedExcerpt: string;
  readonly confirmedMood: string;
}
export type PalAIGeneration =
  | { readonly state: 'completed'; readonly reply: PalAIReply }
  | { readonly state: 'pending' | 'failed'; readonly code: string };
