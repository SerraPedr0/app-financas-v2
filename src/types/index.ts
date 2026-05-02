export type TransactionType = 'income' | 'expense';
export type TransactionScope = 'personal' | 'shared';

export interface Invitation {
  id?: string;
  householdId: string;
  householdName: string;
  invitedByEmail: string;
  invitedByName: string;
  invitedUserId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: any;
}

export interface AppNotification {
  id: string;
  type: 'invitation' | 'bill';
  title: string;
  message: string;
  date: Date;
  data?: any;
}

export interface Transaction {
  id?: string;
  amount: number;
  type: TransactionType;
  scope: TransactionScope;
  category: string;
  description: string;
  date: string;
  userId: string;
  userName: string;
  notes?: string;
  createdAt: string;
}

export interface Goal {
  id?: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  icon?: string;
  createdAt: string;
}

export interface RecurringTransaction {
  id?: string;
  amount: number;
  type: TransactionType;
  scope: TransactionScope;
  category: string;
  description: string;
  dayOfMonth: number;
  userId: string;
  lastProcessed?: string;
}

export interface Household {
  id: string;
  name: string;
  memberIds: string[];
  createdBy: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  householdId: string | null;
  createdAt: any;
}
