import { type AuthUser, type AuthRole } from '@/features/auth/types';

export interface FirestoreUserData {
  id?: string;
  name: string;
  email: string;
  role?: AuthRole;
  createdAt?: string;
  updatedAt?: string;
}

export class UserModel {
  public readonly id: string;
  public readonly name: string;
  public readonly email: string;
  public readonly role?: AuthRole;
  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;

  constructor(data: FirestoreUserData & { id: string }) {
    this.id = data.id;
    this.name = data.name || '';
    this.email = data.email || '';
    this.role = data.role;
    this.createdAt = data.createdAt ? new Date(data.createdAt) : undefined;
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt) : undefined;
  }

  public toAuthUser(): AuthUser {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      role: this.role,
    };
  }

  public static fromFirestore(id: string, data: Record<string, unknown>): UserModel {
    const name = typeof data.name === 'string' ? data.name : '';
    const email = typeof data.email === 'string' ? data.email : '';
    const role = (data.role === 'player' || data.role === 'scout') ? (data.role as AuthRole) : undefined;
    const createdAt = typeof data.createdAt === 'string' ? data.createdAt : undefined;
    const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : undefined;

    return new UserModel({
      id,
      name,
      email,
      role,
      createdAt,
      updatedAt,
    });
  }

  public static toFirestore(user: Partial<UserModel>): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    if (user.name !== undefined) data.name = user.name;
    if (user.email !== undefined) data.email = user.email;
    if (user.role !== undefined) data.role = user.role;
    if (user.createdAt !== undefined) data.createdAt = user.createdAt.toISOString();
    if (user.updatedAt !== undefined) data.updatedAt = user.updatedAt.toISOString();
    return data;
  }
}
