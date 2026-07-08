import type { Role } from './roles';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        authMethod: 'jwt' | 'apiKey';
      };
    }
  }
}

export {};
