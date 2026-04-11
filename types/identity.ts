export interface Team {
  team_id: string;
  team_name: string;
  onboarding_mode: 'invite' | 'approval';
  created_at: string;
  updated_at: string;
}

export interface User {
  username: string;
  email: string;
  display_name: string;
  role: 'admin' | 'member';
  status: 'active' | 'pending' | 'disabled';
  created_at: string;
}

export interface ApiKey {
  keyId: string;
  username: string;
  team_id: string;
  keyHash: string;
  status: 'active' | 'revoked';
  label: string;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

export interface AuthorizerContext {
  user_id: string;
  username: string;
  team_id: string;
  role: string;
}

export const DEFAULT_TEAM: Omit<Team, 'created_at' | 'updated_at'> = {
  team_id: 'default',
  team_name: 'Default',
  onboarding_mode: 'invite',
};

export const DEFAULT_USER: Omit<User, 'created_at'> = {
  username: 'owner',
  email: '',
  display_name: 'Owner',
  role: 'admin',
  status: 'active',
};
