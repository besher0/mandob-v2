export type AuthenticatedUser = {
  sub: string;
  organizationId: string | null;
  username: string;
  roles: string[];
  permissions: string[];
  type: 'access';
};
