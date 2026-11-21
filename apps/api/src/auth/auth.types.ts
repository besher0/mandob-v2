export type AuthUser = {
  id: string;
  organizationId: string | null;
  name: string;
  username: string;
  email?: string | null;
  status?: string;
  roles: string[];
  permissions: string[];
};

export type JwtPayload = {
  sub: string;
  organizationId: string | null;
  username: string;
  roles: string[];
  permissions: string[];
};
