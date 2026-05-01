export type TransactionType = 'income' | 'expense';
export type TransactionScope = 'personal' | 'shared';

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
  householdId: string;
  createdAt: string;
}
