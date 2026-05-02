export type TransactionType = 'income' | 'expense';
export type TransactionScope = 'personal' | 'shared';

export interface Invitation {
  id?: string;
  householdId: string;
  householdName: string;
  invitedByEmail: string;
  invitedByName: string;
  invitedUserId: string;
  invitedUserEmail?: string;
  invitedByUserId?: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: any;
}

export interface AppNotification {
  id: string;
  type: 'invitation' | 'bill' | 'transaction';
  title: string;
  message: string;
  date: Date;
  data?: any;
}

export interface TransactionSplit {
  userId: string;
  userName: string;
  amount: number;
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
  splits?: TransactionSplit[];
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
  userName: string;
  splits?: TransactionSplit[];
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
  photoURL?: string;
  householdId: string | null; // Currently active group
  householdIds?: string[]; // All groups the user is a member of
  createdAt: any;
}
