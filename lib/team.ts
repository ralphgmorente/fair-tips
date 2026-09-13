/** Shapes shared between the team server actions and the settings screen. */
export type TeamMember = {
  userId: string;
  email: string;
  fullName: string;
  role: string;
  employeeKey: string | null;
};

export type TeamInvite = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  employee_key: string | null;
  accepted_at: string | null;
};

export type TeamState = {
  members: TeamMember[];
  invites: TeamInvite[];
  canManage: boolean;
};
