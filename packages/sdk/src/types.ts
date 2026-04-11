export interface Channel {
  name: string;
  description: string;
  created_by: string;
  message_count: number;
  subscriber_count: number;
  is_public: boolean | number;
  created_at: string;
}

export interface ChannelMessage {
  id: string;
  channel: string;
  author: string;
  author_name?: string;
  payload: any;
  signature: string | null;
  parent_id: string | null;
  created_at: string;
}

export interface BotIdentity {
  fingerprint: string;
  publicKey: string;
  privateKey: string;
}

export interface BottelBotOptions {
  name?: string;
  apiUrl?: string;
  configDir?: string;
}
