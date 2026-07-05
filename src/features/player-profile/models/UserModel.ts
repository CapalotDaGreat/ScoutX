import { createAuthUser, type AuthRole, type AuthUser } from '@/features/auth/types';
import { parseUserDocument } from '@/features/auth/models/UserDocumentModel';

export interface FirestoreUserData {
  id?: string;
  uid?: string;
  name: string;
  email: string;
  role?: AuthRole;
  isAnonymous?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export class UserModel {
  public readonly id: string;
  public readonly name: string;
  public readonly email: string;
  public readonly role?: AuthRole;
  public readonly isAnonymous: boolean;
  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;

  constructor(data: FirestoreUserData & { id: string }) {
    this.id = data.id;
    this.name = data.name || '';
    this.email = data.email || '';
    this.role = data.role;
    this.isAnonymous = data.isAnonymous === true;
    this.createdAt = data.createdAt ? new Date(data.createdAt) : undefined;
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt) : undefined;
  }

  public toAuthUser(): AuthUser {
    return createAuthUser({
      uid: this.id,
      isAnonymous: this.isAnonymous,
      displayName: this.name,
      email: this.email || undefined,
      role: this.role,
    });
  }

  public static fromFirestore(id: string, data: Record<string, unknown>): UserModel {
    const document = parseUserDocument(id, data);

    return new UserModel({
      id,
      name: document.name,
      email: document.email,
      role: document.role,
      isAnonymous: document.isAnonymous,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    });
  }

  public static toFirestore(user: Partial<UserModel>): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    if (user.name !== undefined) data.name = user.name;
    if (user.email !== undefined) data.email = user.email;
    if (user.role !== undefined) data.role = user.role;
    if (user.isAnonymous !== undefined) data.isAnonymous = user.isAnonymous;
    if (user.createdAt !== undefined) data.createdAt = user.createdAt.toISOString();
    if (user.updatedAt !== undefined) data.updatedAt = user.updatedAt.toISOString();
    return data;
  }
}
