export type UserRole = 'owner' | 'developer' | 'admin' | 'subscriber' | 'member' | 'suspended';

export interface Profile {
  id: string;
  full_name: string;
  nickname?: string | null;
  avatar_url?: string | null;
  email: string | null;
  role: UserRole;
  is_suspended?: boolean | null;
  phone?: string | null;
  person_id?: string | null;
  created_at?: string;
}

export interface InvitationCode {
  id: string;
  code: string;
  role?: UserRole | null;
  is_used: boolean;
  used_by?: string | null;
  expires_at?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface FamilyPerson {
  id: string;
  full_name: string;
  nickname?: string | null;
  tribe_title?: string | null;
  father_id: string | null;
  mother_id?: string | null;
  spouse_id?: string | null;
  gender?: 'male' | 'female' | string | null;
  generation?: number | null;
  birth_date?: string | null;
  death_date?: string | null;
  birth_year?: string | number | null;
  death_year?: string | number | null;
  is_alive?: boolean | null;
  branch_name?: string | null;
  location?: string | null;
  phone?: string | null;
  biography?: string | null;
  photo_url?: string | null;
  avatar_url?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'blocked';
export type SecurityStatus = 'safe' | 'flagged' | 'blocked';

export interface ChangeRequest {
  id: string;
  person_id: string | null;
  target_person_id?: string | null;
  requested_by: string;
  requester_name?: string | null;
  request_type?: 'add' | 'edit' | 'delete' | 'create' | 'update' | string;
  proposed_data: Record<string, unknown>;
  reason?: string | null;
  status: RequestStatus;
  security_status?: SecurityStatus | string | null;
  security_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export interface MembershipRequest {
  id: string;
  user_id?: string | null;
  full_name: string;
  email: string;
  phone?: string | null;
  lineage_note?: string | null;
  invitation_code_used?: string | null;
  status: RequestStatus;
  security_status?: SecurityStatus | string | null;
  security_notes?: string | null;
  reviewed_by?: string | null;
  created_at: string;
}

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEvent {
  id: string;
  event_type: string;
  severity: SecuritySeverity | string;
  actor_id?: string | null;
  actor_email?: string | null;
  target_table?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
  resolved?: boolean;
  created_at: string;
}

export interface FamilySearchResult {
  id: string;
  full_name: string;
  lineage_name?: string | null;
  nickname?: string | null;
  tribe_title?: string | null;
  generation?: number | null;
  branch_name?: string | null;
  is_alive?: boolean | null;
  photo_url?: string | null;
  father_id?: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  matchedIds?: string[];
  timestamp: string;
  isError?: boolean;
}
