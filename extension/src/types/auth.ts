export interface TokenSet {
  access_token: string;
  id_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms — computed client-side from expires_in
}
