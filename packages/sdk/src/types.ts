export interface Channel {
  name: string;
  description: string;
  created_by: string;
  message_count: number;
  subscriber_count: number;
  is_public: boolean;
  schema?: unknown;
  created_at: string;
}

export interface ChannelMessage {
  id: string;
  channel: string;
  author: string;
  author_name?: string | null;
  payload: Record<string, unknown> | string;
  signature: string | null;
  parent_id: string | null;
  created_at: string;
}

export interface BotIdentity {
  fingerprint: string;
  publicKey: string;
  privateKey: string;
  /** ML-DSA-65 private key (base64-encoded, 4032 bytes). */
  pqPrivateKey: string;
  /** ML-DSA-65 public key (base64-encoded, 1952 bytes). */
  pqPublicKey: string;
}

export interface BottelBotOptions {
  name?: string;
  apiUrl?: string;
  configDir?: string;
}

export interface DirectChat {
  id: string;
  other_fp: string;
  other_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_by: string;
  status: "pending" | "active";
}

export interface DirectMessage {
  id: string;
  chat_id: string;
  sender: string;
  sender_name: string | null;
  content: string;
  created_at: string;
}
