import type { Insertable, Selectable, Updateable } from "kysely";

// Column types are kept identical on SQLite and PostgreSQL so data can be copied
// as-is between engines: ids are text, booleans are 0/1 integers, dates are ISO strings,
// structured values are JSON text.

export interface UsersTable {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: "admin" | "creator";
  active: number;
  locale: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface SessionsTable {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
  ip: string | null;
  user_agent: string | null;
}

export interface PasswordResetsTable {
  id: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface CalendarsTable {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  slug: string;
  start_date: string;
  end_date: string;
  timezone: string;
  theme: string;
  door_animation: string;
  open_animation: string;
  unlock_mode: "date" | "all";
  password_hash: string | null;
  published: number;
  qr_config: string | null;
  created_at: string;
  updated_at: string;
}

export interface DaysTable {
  id: string;
  calendar_id: string;
  date: string;
  position: number;
  label: string | null;
  cover_url: string | null;
  content_type: "image" | "video" | "youtube" | "vimeo" | "link" | "text";
  content_url: string | null;
  content_text: string | null;
  open_animation: string | null;
  challenge: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaTable {
  id: string;
  owner_id: string;
  filename: string;
  original_name: string;
  mime: string;
  size: number;
  created_at: string;
}

export interface VisitsTable {
  id: string;
  calendar_id: string;
  visitor_id: string;
  ip_hash: string | null;
  user_agent: string | null;
  referrer: string | null;
  source: string;
  created_at: string;
}

export interface DayEventsTable {
  id: string;
  calendar_id: string;
  day_id: string;
  visitor_id: string;
  type: "open" | "close" | "attempt" | "fail" | "solve" | "hint" | "locked";
  payload: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface SettingsTable {
  key: string;
  value: string;
  updated_at: string;
}

export interface LoginAttemptsTable {
  id: string;
  ip: string;
  identifier: string | null;
  scope: string;
  success: number;
  created_at: string;
}

export interface IpBlocksTable {
  id: string;
  ip: string | null;
  identifier: string | null;
  scope: string;
  until: string;
  reason: string | null;
  created_at: string;
}

export interface IpRulesTable {
  id: string;
  cidr: string;
  type: "allow" | "deny";
  note: string | null;
  created_at: string;
}

export interface Database {
  users: UsersTable;
  sessions: SessionsTable;
  password_resets: PasswordResetsTable;
  calendars: CalendarsTable;
  days: DaysTable;
  media: MediaTable;
  visits: VisitsTable;
  day_events: DayEventsTable;
  settings: SettingsTable;
  login_attempts: LoginAttemptsTable;
  ip_blocks: IpBlocksTable;
  ip_rules: IpRulesTable;
}

/** Table order respecting foreign keys, used for engine-to-engine copies. */
export const TABLE_ORDER: (keyof Database)[] = [
  "users",
  "sessions",
  "password_resets",
  "settings",
  "media",
  "calendars",
  "days",
  "visits",
  "day_events",
  "login_attempts",
  "ip_blocks",
  "ip_rules",
];

export type User = Selectable<UsersTable>;
export type Calendar = Selectable<CalendarsTable>;
export type CalendarUpdate = Updateable<CalendarsTable>;
export type Day = Selectable<DaysTable>;
export type NewDay = Insertable<DaysTable>;
export type Media = Selectable<MediaTable>;
export type IpRule = Selectable<IpRulesTable>;
