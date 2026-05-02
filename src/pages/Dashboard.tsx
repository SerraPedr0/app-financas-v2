import React, { useEffect, useState } from 'react';
import { 
  collection, query, onSnapshot, orderBy, addDoc, deleteDoc, 
  doc, serverTimestamp, where, limit, or, getDocs, 
  updateDoc, arrayUnion, getDoc, setDoc, writeBatch 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Transaction, Goal, RecurringTransaction, Household, Invitation, AppNotification, UserProfile } from '../types';
import { formatCurrency, cn, handleFirestoreError, OperationType } from '../lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { 
  Plus, TrendingUp, TrendingDown, Wallet, Target, 
  Clock, ArrowUpRight, ArrowDownRight, LogOut, Settings,
  PieChart as PieChartIcon, Calendar, User, Filter, MoreVertical,
  ChevronRight, Trash2, CalendarClock, UserPlus, Link as LinkIcon,
  Bell, Calendar as CalendarIcon, CheckCircle2, AlertCircle,
  X, Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const Dashboard: React.FC = () => {
  const { profile, user } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'goals' | 'recurring' | 'group'>('overview');
  
  // Profile Photo State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviteLoading, setIsInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [sentInvitations, setSentInvitations] = useState<Invitation[]>([]);
  const [groupMembers, setGroupMembers] = useState<UserProfile[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    amount: '',
    type: 'expense' as 'income' | 'expense',
    scope: 'shared' as 'personal' | 'shared',
    category: 'Alimentação',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
    isEqualSplit: true,
    splits: [] as { userId: string, userName: string, amount: string }[]
  });

  const [recurringFormData, setRecurringFormData] = useState({
    amount: '',
    type: 'expense' as 'income' | 'expense',
    scope: 'personal' as 'personal' | 'shared',
    category: 'Moradia',
    description: '',
    dayOfMonth: '1'
  });

  const [dashboardFilter, setDashboardFilter] = useState<'all' | 'personal' | 'shared'>('all');

  useEffect(() => {
    if (!user) return;

    const unsubs: (() => void)[] = [];

    // --- Personal Data Fetching ---
    const personalTransactionsPath = `users/${user.uid}/transactions`;
    const qPersonalTransactions = query(
      collection(db, personalTransactionsPath),
      orderBy('date', 'desc'),
      limit(100)
    );

    const unsubPersonalTransactions = onSnapshot(qPersonalTransactions, (snapshot) => {
      const personalData = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        scope: 'personal' // Force scope for personal data
      })) as Transaction[];
      
      setTransactions(prev => {
        const sharedData = prev.filter(t => t.scope === 'shared');
        return [...personalData, ...sharedData].sort((a, b) => b.date.localeCompare(a.date));
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, personalTransactionsPath);
    });
    unsubs.push(unsubPersonalTransactions);

    const personalGoalsPath = `users/${user.uid}/goals`;
    const unsubPersonalGoals = onSnapshot(query(collection(db, personalGoalsPath)), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Goal[];
      setGoals(prev => {
        const shared = prev.filter(g => g.id?.includes('shared_')); // Simple way to mark shared
        return [...data, ...shared];
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, personalGoalsPath);
    });
    unsubs.push(unsubPersonalGoals);

    const personalRecurringPath = `users/${user.uid}/recurring`;
    const unsubPersonalRecurring = onSnapshot(query(collection(db, personalRecurringPath)), (snapshot) => {
      const personalData = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        scope: 'personal'
      })) as RecurringTransaction[];
      
      setRecurring(prev => {
        const sharedData = prev.filter(r => r.scope === 'shared');
        return [...personalData, ...sharedData];
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, personalRecurringPath);
    });
    unsubs.push(unsubPersonalRecurring);

    // --- Shared Data Fetching ---
    if (profile?.householdId) {
      const householdRef = doc(db, 'households', profile.householdId);
      const unsubHousehold = onSnapshot(householdRef, (snapshot) => {
        if (snapshot.exists()) {
          setHousehold({ id: snapshot.id, ...snapshot.data() } as Household);
        } else {
          setHousehold(null);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `households/${profile.householdId}`);
      });
      unsubs.push(unsubHousehold);

      const sharedTransactionsPath = `households/${profile.householdId}/transactions`;
      const qShared = query(collection(db, sharedTransactionsPath), orderBy('date', 'desc'), limit(100));
      const unsubSharedTransactions = onSnapshot(qShared, (snapshot) => {
        const sharedData = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          scope: 'shared'
        })) as Transaction[];
        
        setTransactions(prev => {
          const personalData = prev.filter(t => t.scope === 'personal');
          return [...personalData, ...sharedData].sort((a, b) => b.date.localeCompare(a.date));
        });
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, sharedTransactionsPath);
      });
      unsubs.push(unsubSharedTransactions);

      const sharedRecurringPath = `households/${profile.householdId}/recurring`;
      const unsubSharedRecurring = onSnapshot(query(collection(db, sharedRecurringPath)), (snapshot) => {
        const sharedData = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          scope: 'shared'
        })) as RecurringTransaction[];
        
        setRecurring(prev => {
          const personalData = prev.filter(r => r.scope === 'personal');
          return [...personalData, ...sharedData];
        });
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, sharedRecurringPath);
      });
      unsubs.push(unsubSharedRecurring);
    } else {
      setHousehold(null);
      setTransactions(prev => prev.filter(t => t.scope === 'personal'));
      setGroupMembers([]);
    }

    const invitationsPath = 'invitations';
    const qInvitations = query(
      collection(db, invitationsPath),
      where('invitedUserId', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsubInvitations = onSnapshot(qInvitations, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Invitation[];
      setInvitations(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, invitationsPath);
    });
    unsubs.push(unsubInvitations);

    // Fetch sent invitations for current household
    if (profile?.householdId) {
      const qSentInvitations = query(
        collection(db, invitationsPath),
        where('householdId', '==', profile.householdId),
        where('status', '==', 'pending'),
        where('memberIds', 'array-contains', user.uid) // Ensure user is a member of the invitation's recorded member list
      );
      const unsubSentInvitations = onSnapshot(qSentInvitations, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Invitation[];
        setSentInvitations(data);
      }, (error) => {
        // Log the error but don't necessarily crash the whole app if sent invitations fails
        console.error("Error listening to sent invitations:", error);
      });
      unsubs.push(unsubSentInvitations);
    } else {
      setSentInvitations([]);
    }

    return () => unsubs.forEach(unsub => unsub());
  }, [profile?.householdId, user?.uid]);

  useEffect(() => {
    if (!household?.memberIds || household.memberIds.length === 0) {
      setGroupMembers([]);
      return;
    }
    
    const q = query(collection(db, 'users'), where('uid', 'in', household.memberIds));
    const unsubMembers = onSnapshot(q, (snapshot) => {
      const members = snapshot.docs.map(doc => doc.data() as UserProfile);
      setGroupMembers(members);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });
    
    return () => unsubMembers();
  }, [household?.memberIds]);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    const isShared = formData.scope === 'shared' && profile.householdId;
    const path = isShared 
      ? `households/${profile.householdId}/transactions`
      : `users/${user.uid}/transactions`;

    // Process splits if shared and expense
    let finalSplits = undefined;
    if (isShared && formData.type === 'expense' && groupMembers.length > 0) {
      finalSplits = formData.splits.length > 0 
        ? formData.splits.map(s => ({
            userId: s.userId,
            userName: s.userName,
            amount: parseFloat(s.amount) || 0
          }))
        : groupMembers.map(m => ({
            userId: m.uid,
            userName: m.displayName,
            amount: parseFloat(formData.amount) / groupMembers.length
          }));
      
      const totalAmountFromSplits = finalSplits.reduce((acc, s) => acc + s.amount, 0);
      if (totalAmountFromSplits > 0) {
        formData.amount = totalAmountFromSplits.toString();
      }
    }

    try {
      if (editingTransactionId) {
        await updateDoc(doc(db, path, editingTransactionId), {
          ...formData,
          amount: parseFloat(formData.amount),
          splits: finalSplits,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, path), {
          ...formData,
          amount: parseFloat(formData.amount),
          userId: user.uid,
          userName: profile.displayName,
          memberIds: isShared ? household?.memberIds : [user.uid],
          splits: finalSplits,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      setEditingTransactionId(null);
      setFormData({
        amount: '',
        type: 'expense',
        scope: isShared ? 'shared' : 'personal',
        category: 'Alimentação',
        description: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        notes: '',
        isEqualSplit: true,
        splits: []
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const startEditTransaction = (t: Transaction) => {
    setEditingTransactionId(t.id!);
    setFormData({
      amount: t.amount.toString(),
      type: t.type,
      scope: t.scope,
      category: t.category,
      description: t.description,
      date: t.date,
      notes: t.notes || '',
      isEqualSplit: t.splits ? false : true, // or some logic to determine if it was equal
      splits: t.splits ? t.splits.map(s => ({ ...s, amount: s.amount.toString() })) : []
    });
    setIsModalOpen(true);
  };

  const deleteTransaction = async (id: string) => {
    if (!user || !profile || !window.confirm('Excluir esta transação?')) return;
    
    // Find transaction to know its scope
    const t = transactions.find(item => item.id === id);
    if (!t) return;

    const path = t.scope === 'shared' && profile.householdId
      ? `households/${profile.householdId}/transactions/${id}`
      : `users/${user.uid}/transactions/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleAddRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    const path = (recurringFormData.scope === 'shared' && profile.householdId)
      ? `households/${profile.householdId}/recurring` 
      : `users/${user.uid}/recurring`;

    try {
      await addDoc(collection(db, path), {
        ...recurringFormData,
        amount: parseFloat(recurringFormData.amount),
        dayOfMonth: parseInt(recurringFormData.dayOfMonth),
        userId: user.uid,
        userName: profile.displayName,
        memberIds: (recurringFormData.scope === 'shared' && profile.householdId) ? household?.memberIds : [user.uid],
        createdAt: serverTimestamp()
      });
      setIsRecurringModalOpen(false);
      setRecurringFormData({
        amount: '',
        type: 'expense',
        scope: profile.householdId ? 'shared' : 'personal',
        category: 'Moradia',
        description: '',
        dayOfMonth: '1'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const deleteRecurring = async (id: string) => {
    if (!user || !profile || !window.confirm('Excluir esta conta fixa?')) return;
    
    // Find in local state to check scope
    const r = recurring.find(item => item.id === id);
    if (!r) return;

    const path = r.scope === 'shared' && profile.householdId
      ? `households/${profile.householdId}/recurring/${id}`
      : `users/${user.uid}/recurring/${id}`;

    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.householdId || !user || !inviteEmail || !household) return;

    setIsInviteLoading(true);
    setInviteError('');
    try {
      const q = query(collection(db, 'users'), where('email', '==', inviteEmail.trim()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setInviteError('Usuário não encontrado. O parceiro deve ter uma conta no app.');
        return;
      }

      const invitedUser = querySnapshot.docs[0];
      const invitedUserId = invitedUser.id;

      if (household.memberIds.includes(invitedUserId)) {
        setInviteError('Este usuário já faz parte do seu grupo.');
        return;
      }

      if (invitedUserId === user.uid) {
        setInviteError('Você não pode convidar a si mesmo.');
        return;
      }

      // Create invitation with deterministic ID instead of direct update
      const invitationId = `${invitedUserId}_${profile.householdId}`;
      await setDoc(doc(db, 'invitations', invitationId), {
        householdId: profile.householdId,
        householdName: household.name,
        memberIds: household.memberIds,
        invitedByEmail: user.email,
        invitedByName: profile.displayName,
        invitedByUserId: user.uid,
        invitedUserId: invitedUserId,
        invitedUserEmail: inviteEmail,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      setInviteEmail('');
      alert('Convite enviado com sucesso! O parceiro precisará aceitar.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'invitations');
    } finally {
      setIsInviteLoading(false);
    }
  };

  const handleAcceptInvitation = async (invitation: Invitation) => {
    if (!user || !profile) return;
    
    const currentGroups = profile.householdIds || (profile.householdId ? [profile.householdId] : []);
    
    if (currentGroups.length >= 2) {
      alert('Você já atingiu o limite de 2 grupos. Saia de um grupo para entrar em outro.');
      return;
    }

    setIsInviteLoading(true);
    try {
      const batch = writeBatch(db);

      // Join new household
      batch.update(doc(db, 'households', invitation.householdId), {
        memberIds: arrayUnion(user.uid)
      });

      // Update user profile
      const newGroups = [...currentGroups, invitation.householdId];
      batch.update(doc(db, 'users', user.uid), {
        householdId: invitation.householdId,
        householdIds: newGroups
      });

      // Mark invitation as accepted
      batch.update(doc(db, 'invitations', invitation.id!), {
        status: 'accepted'
      });

      await batch.commit();
      alert('Você entrou no novo grupo!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'invitations/households');
      alert('Erro ao aceitar convite. Verifique se o convite ainda é válido.');
    } finally {
      setIsInviteLoading(false);
    }
  };

  const handleDeclineInvitation = async (invitationId: string) => {
    try {
      await updateDoc(doc(db, 'invitations', invitationId), {
        status: 'declined'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'invitations');
    }
  };

  const updateProfilePhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newPhotoUrl.trim()) return;

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        photoURL: newPhotoUrl.trim()
      });
      setIsProfileModalOpen(false);
      setNewPhotoUrl('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  const handleLeaveGroup = async () => {
    if (!profile?.householdId || !user || !household) return;
    
    if (!window.confirm('Tem certeza que deseja sair deste grupo? Suas finanças compartilhadas continuarão no grupo, mas você terá seu espaço individual novamente.')) return;

    setIsInviteLoading(true);
    try {
      // 1. Remove user from household
      const remainingMembers = household.memberIds.filter(id => id !== user.uid);
      
      if (remainingMembers.length === 0) {
        await deleteDoc(doc(db, 'households', profile.householdId));
      } else {
        await updateDoc(doc(db, 'households', profile.householdId), {
          memberIds: remainingMembers
        });
      }

      // 2. Update user profile
      const currentGroups = profile.householdIds || (profile.householdId ? [profile.householdId] : []);
      const newGroups = currentGroups.filter(id => id !== profile.householdId);
      const nextActiveGroup = newGroups.length > 0 ? newGroups[0] : null;
      
      await updateDoc(doc(db, 'users', user.uid), {
        householdId: nextActiveGroup,
        householdIds: newGroups
      });

      alert('Você saiu do grupo com sucesso.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'households');
    } finally {
      setIsInviteLoading(false);
    }
  };

  const handleRemoveMember = async (targetUid: string) => {
    if (!profile?.householdId || !household || !user) return;
    
    if (household.createdBy !== user.uid) {
      alert("Apenas o criador do grupo pode remover membros.");
      return;
    }

    if (!window.confirm('Deseja remover este membro do grupo?')) return;

    setIsInviteLoading(true);
    try {
      // 1. Update removed user's profile
      const userSnap = await getDoc(doc(db, 'users', targetUid));
      if (userSnap.exists()) {
        const userData = userSnap.data() as UserProfile;
        const currentGroups = userData.householdIds || (userData.householdId ? [userData.householdId] : []);
        const newGroups = currentGroups.filter(id => id !== profile.householdId);
        await updateDoc(doc(db, 'users', targetUid), {
          householdId: userData.householdId === profile.householdId 
            ? (newGroups.length > 0 ? newGroups[0] : null)
            : userData.householdId,
          householdIds: newGroups
        });
      }

      // 2. Remove from current household memberIds
      const remainingMembers = household.memberIds.filter(id => id !== targetUid);
      await updateDoc(doc(db, 'households', profile.householdId), {
        memberIds: remainingMembers
      });

      alert('Membro removido com sucesso.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'households');
    } finally {
      setIsInviteLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!user || !profile) return;

    const currentGroups = profile.householdIds || (profile.householdId ? [profile.householdId] : []);
    if (currentGroups.length >= 2) {
      alert('Você já atingiu o limite de 2 grupos.');
      return;
    }
    
    const name = window.prompt('Dê um nome para o seu grupo:', 'Nosso Grupo');
    if (!name) return;

    setIsInviteLoading(true);
    try {
      const householdId = Math.random().toString(36).substring(2, 10).toUpperCase();
      const householdRef = doc(db, 'households', householdId);
      
      await setDoc(householdRef, {
        name,
        createdBy: user.uid,
        memberIds: [user.uid],
        createdAt: serverTimestamp()
      });

      const newGroups = [...currentGroups, householdId];
      await updateDoc(doc(db, 'users', user.uid), {
        householdId: householdId,
        householdIds: newGroups
      });

      alert('Grupo criado! Agora você pode convidar alguém na aba de Gestão de Grupo.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'households');
    } finally {
      setIsInviteLoading(false);
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !joinCode || !profile) return;

    const currentGroups = profile.householdIds || (profile.householdId ? [profile.householdId] : []);
    if (currentGroups.length >= 2) {
      alert('Você já atingiu o limite de 2 grupos.');
      return;
    }

    setIsInviteLoading(true);
    try {
      const householdRef = doc(db, 'households', joinCode.trim());
      const householdSnap = await getDoc(householdRef);

      if (!householdSnap.exists()) {
        alert('Grupo não encontrado.');
        return;
      }

      await updateDoc(householdRef, {
        memberIds: arrayUnion(user.uid)
      });

      const newGroups = [...currentGroups, joinCode.trim()];
      await updateDoc(doc(db, 'users', user.uid), {
        householdId: joinCode.trim(),
        householdIds: newGroups
      });

      setJoinCode('');
      alert('Você entrou no grupo com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'households');
    } finally {
      setIsInviteLoading(false);
    }
  };

  const copyHouseholdId = () => {
    if (profile?.householdId) {
      navigator.clipboard.writeText(profile.householdId);
      alert('ID do Grupo copiado para a área de transferência!');
    }
  };

  // Build Notification Feed
  const notifications: AppNotification[] = [
    ...invitations.map(inv => ({
      id: inv.id!,
      type: 'invitation' as const,
      title: 'Novo Convite',
      message: `${inv.invitedByName} convidou você para o grupo "${inv.householdName}".`,
      date: inv.createdAt?.toDate() || new Date(),
      data: inv
    })),
    ...recurring.filter(item => {
      const today = new Date().getDate();
      const diff = item.dayOfMonth - today;
      return diff >= 0 && diff <= 5; // Bills in next 5 days
    }).map(bill => ({
      id: bill.id!,
      type: 'bill' as const,
      title: 'Próxima Conta',
      message: `${bill.description} vence no dia ${bill.dayOfMonth} (Valor: ${formatCurrency(bill.amount)}).`,
      date: new Date(),
      data: bill
    })),
    ...transactions.filter(t => {
      if (t.scope !== 'shared') return false;
      const tDate = parseISO(t.date);
      const diffTime = Math.abs(new Date().getTime() - tDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 3; // Transactions from last 3 days
    }).map(t => ({
      id: t.id!,
      type: 'transaction' as const,
      title: 'Novo Lançamento',
      message: `${t.userName} adicionou "${t.description || t.category}" no valor de ${formatCurrency(t.amount)}.`,
      date: parseISO(t.date),
      data: t
    }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  // Filtered lists based on current dashboard filter
  // Filter transactions based on active filters and history state
  const filteredTransactions = transactions.filter(t => {
    const tDate = parseISO(t.date);
    const dateMatch = tDate.getMonth() === selectedMonth && tDate.getFullYear() === selectedYear;
    if (!dateMatch) return false;
    
    // Scope filter
    if (dashboardFilter === 'all') return true;
    return t.scope === dashboardFilter;
  });

  const filteredRecurring = recurring.filter(r => {
    if (dashboardFilter === 'all') return true;
    return r.scope === dashboardFilter;
  });

  // Calculations based on filtered list
  const recurringIncome = filteredRecurring.reduce((acc, r) => r.type === 'income' ? acc + r.amount : acc, 0);
  const recurringExpense = filteredRecurring.reduce((acc, r) => r.type === 'expense' ? acc + r.amount : acc, 0);

  const income = filteredTransactions.reduce((acc, t) => t.type === 'income' ? acc + t.amount : acc, 0) + recurringIncome;
  const expense = filteredTransactions.reduce((acc, t) => t.type === 'expense' ? acc + t.amount : acc, 0) + recurringExpense;
  const balance = income - expense;

  const categoryData = Object.entries(
    [
      ...filteredTransactions.filter(t => t.type === 'expense'),
      ...filteredRecurring.filter(r => r.type === 'expense')
    ].reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  const CATEGORY_COLORS: Record<string, string> = {
    'Alimentação': '#fbbf24', // Amber
    'Transporte': '#60a5fa', // Blue
    'Lazer': '#f87171', // Red
    'Moradia': '#818cf8', // Indigo
    'Saúde': '#34d399', // Emerald
    'Mercado': '#fb923c', // Orange
    'Serviços': '#a78bfa', // Violet
    'Outros': '#94a3b8', // Slate
    'Educação': '#2dd4bf', // Teal
    'Vestuário': '#f472b6', // Pink
  };

  const getCategoryColor = (index: number, category: string) => {
    return CATEGORY_COLORS[category] || ['#18181b', '#3f3f46', '#71717a', '#a1a1aa', '#d4d4d8'][index % 5];
  };

  const COLORS = ['#18181b', '#3f3f46', '#71717a', '#a1a1aa', '#d4d4d8'];

  // Calculate daily data for Line Chart
  const dailyData = Array.from({ length: 31 }, (_, i) => {
    const day = i + 1;
    const dayTransactions = filteredTransactions.filter(t => parseISO(t.date).getDate() === day && t.type === 'expense');
    const total = dayTransactions.reduce((acc, t) => acc + t.amount, 0);
    return { day, total };
  }).filter(d => {
    // Only show up to current day if it's the current month/year
    const now = new Date();
    if (selectedMonth === now.getMonth() && selectedYear === now.getFullYear()) {
      return d.day <= now.getDate();
    }
    return true;
  });

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  return (
    <div className="min-h-screen bg-zinc-50 pb-20 md:pb-0">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-zinc-900 text-white flex-col p-6 z-20">
        <div className="flex items-center gap-3 mb-12">
          <div className="bg-white p-2 rounded-xl">
            <Wallet className="w-6 h-6 text-zinc-900" />
          </div>
          <span className="font-bold text-xl tracking-tight">FinanceLink</span>
        </div>

        <nav className="flex-1 space-y-2">
            {[
              { id: 'overview', label: 'Visão Geral', icon: PieChartIcon },
              { id: 'transactions', label: 'Transações', icon: Clock },
              { id: 'goals', label: 'Metas', icon: Target },
              { id: 'recurring', label: 'Contas Fixas', icon: CalendarClock },
              { id: 'group', label: 'Gestão de Grupo', icon: UserPlus },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl transition-all",
                  activeTab === item.id ? "bg-white text-zinc-900 shadow-lg" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
        </nav>

        <div className="mt-auto space-y-4 pt-6 border-t border-zinc-800">
          <div className="flex items-center gap-3 px-2">
            <button 
              onClick={() => {
                setNewPhotoUrl(profile?.photoURL || '');
                setIsProfileModalOpen(true);
              }}
              className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold border border-zinc-700 overflow-hidden hover:border-zinc-500 transition-all cursor-pointer"
            >
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                profile?.displayName[0].toUpperCase()
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.displayName}</p>
              <p className="text-[10px] text-zinc-500 truncate uppercase font-mono">
                {!profile?.householdId ? 'Sem Grupo' : (household ? household.name : 'Carregando...')}
              </p>
            </div>
          </div>
          <button 
            onClick={() => auth.signOut()}
            className="w-full flex items-center gap-3 p-3 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="md:ml-64 p-4 md:p-8">
        <header className="flex flex-col lg:flex-row lg:items-center justify-between mb-8 gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900">
                {activeTab === 'overview' ? 'Visão Geral' : activeTab === 'transactions' ? 'Transações' : activeTab === 'goals' ? 'Metas' : activeTab === 'recurring' ? 'Contas Fixas' : 'Gestão de Grupo'}
              </h2>
              <p className="text-zinc-500">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
            </div>

            {/* History Selector */}
            <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-zinc-200 shadow-sm">
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="bg-transparent text-xs font-bold text-zinc-900 px-3 py-1.5 focus:outline-none appearance-none cursor-pointer hover:bg-zinc-50 rounded-lg transition-colors"
              >
                {months.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <div className="w-[1px] h-4 bg-zinc-200" />
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="bg-transparent text-xs font-bold text-zinc-900 px-3 py-1.5 focus:outline-none appearance-none cursor-pointer hover:bg-zinc-50 rounded-lg transition-colors"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            {activeTab !== 'group' && (
              <div className="flex bg-zinc-200/50 p-1 rounded-2xl w-fit">
                {[
                  { id: 'all', label: 'Tudo' },
                  { id: 'personal', label: 'Meu' },
                  { id: 'shared', label: household?.name || 'Casal' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setDashboardFilter(f.id as any)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                      dashboardFilter === f.id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {activeTab === 'transactions' && (
                <button
                  onClick={() => {
                    const headers = ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Responsável'];
                    const csvContent = [
                      headers.join(','),
                      ...transactions.map(t => [
                        t.date,
                        t.type,
                        t.category,
                        `"${t.description.replace(/"/g, '""')}"`,
                        t.amount,
                        `"${t.userName.replace(/"/g, '""')}"`
                      ].join(','))
                    ].join('\n');
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `financas_${format(new Date(), 'yyyy-MM-dd')}.csv`;
                    link.click();
                  }}
                  className="hidden sm:flex bg-white text-zinc-900 px-4 py-3 rounded-2xl font-medium border border-zinc-200 hover:bg-zinc-50 transition-all items-center gap-2"
                >
                  <MoreVertical className="w-5 h-5 rotate-90" /> Exportar
                </button>
              )}
              {activeTab === 'recurring' ? (
                <button
                  onClick={() => setIsRecurringModalOpen(true)}
                  className="bg-amber-600 text-white px-6 py-3 rounded-2xl font-medium shadow-lg hover:bg-amber-700 transition-all flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  <span className="hidden sm:inline">Nova Conta Fixa</span>
                </button>
              ) : activeTab !== 'group' && (
                <button
                  onClick={() => {
                    setEditingTransactionId(null);
                    setFormData({
                      amount: '',
                      type: 'expense',
                      scope: profile?.householdId ? 'shared' : 'personal',
                      category: 'Alimentação',
                      description: '',
                      date: format(new Date(), 'yyyy-MM-dd'),
                      notes: '',
                      isEqualSplit: true,
                      splits: []
                    });
                    setIsModalOpen(true);
                  }}
                  className="bg-zinc-900 text-white px-6 py-3 rounded-2xl font-medium shadow-lg hover:bg-zinc-800 transition-all flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  <span className="hidden sm:inline">Nova Transação</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Stats & Charts */}
            <div className="lg:col-span-2 space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn(
                  "p-6 rounded-3xl text-white shadow-xl flex flex-col justify-between h-40",
                  balance < 0 ? "bg-rose-600" : "bg-zinc-900"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="p-2 bg-white/10 rounded-xl"><Wallet className="w-6 h-6 text-white" /></div>
                    <span className="text-[10px] text-zinc-300 font-black uppercase tracking-widest">Saldo</span>
                  </div>
                  <div>
                    <h3 className="text-3xl font-black">{formatCurrency(balance)}</h3>
                    {balance < 1000 && balance > 0 && <p className="text-[10px] text-rose-200 font-bold flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" /> Saldo Baixo</p>}
                  </div>
                </motion.div>

                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }} className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex flex-col justify-between h-40">
                  <div className="flex items-center justify-between">
                    <div className="p-2 bg-emerald-50 rounded-xl"><TrendingUp className="w-6 h-6 text-emerald-600" /></div>
                    <span className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Receitas</span>
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-zinc-900">{formatCurrency(income)}</h3>
                    <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mt-1">Este mês</p>
                  </div>
                </motion.div>

                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }} className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex flex-col justify-between h-40">
                  <div className="flex items-center justify-between">
                    <div className="p-2 bg-rose-50 rounded-xl"><TrendingDown className="w-6 h-6 text-rose-600" /></div>
                    <span className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Despesas</span>
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-zinc-900">{formatCurrency(expense)}</h3>
                    <p className="text-[10px] text-rose-600 font-bold uppercase tracking-widest mt-1">Este mês</p>
                  </div>
                </motion.div>
              </div>

              {/* Spend Evolution Chart */}
              <motion.div 
                initial={{ y: 20, opacity: 0 }} 
                animate={{ y: 0, opacity: 1 }} 
                transition={{ delay: 0.3 }}
                className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm"
              >
                <h4 className="font-bold text-zinc-900 mb-6 flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-zinc-400" /> Evolução Diária de Gastos
                </h4>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="day" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#94a3b8' }} 
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        tickFormatter={(value) => `R$ ${value}`}
                      />
                      <Tooltip 
                        formatter={(value: number) => [formatCurrency(value), 'Gasto']}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="total" 
                        stroke="#18181b" 
                        strokeWidth={3} 
                        dot={{ r: 4, fill: '#18181b', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              {/* Main Content Area */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm">
                  <h4 className="font-bold text-zinc-900 mb-6 flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5 text-zinc-400" /> Gastos
                  </h4>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getCategoryColor(index, entry.name)} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    {categoryData.slice(0, 4).map((c, i) => (
                      <div key={c.name} className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getCategoryColor(i, c.name) }} />
                        <span className="truncate">{c.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="font-bold text-zinc-900 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-zinc-400" /> Recentes
                    </h4>
                    <button onClick={() => setActiveTab('transactions')} className="text-zinc-400 hover:text-zinc-900 text-xs font-bold transition-colors uppercase tracking-widest">Tudo</button>
                  </div>
                  <div className="flex-1 space-y-4">
                    {filteredTransactions.slice(0, 4).map((t) => (
                      <div key={t.id} className="flex items-center gap-4 transition-colors group">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm border border-zinc-100",
                          t.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                        )}>
                          {t.type === 'income' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                        </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between group">
                                  <div className="flex flex-col">
                                    <p className="font-bold text-zinc-900 group-hover:text-zinc-700 transition-colors uppercase tracking-tight text-xs">{t.description || t.category}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className={cn(
                                        "text-[7px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider",
                                        t.scope === 'shared' ? "bg-amber-100 text-amber-700" : "bg-indigo-50 text-indigo-500"
                                      )}>
                                        {t.scope === 'shared' ? (household?.name || 'Casal') : 'Pessoal'}
                                      </span>
                                      <div className="flex -space-x-1">
                                        {t.splits ? t.splits.map((s, idx) => (
                                          <div key={idx} className="w-4 h-4 rounded-full bg-zinc-900 border border-white flex items-center justify-center text-[6px] text-white font-bold" title={`${s.userName}: ${formatCurrency(s.amount)}`}>
                                            {s.userName[0]}
                                          </div>
                                        )) : (
                                          <span className="text-[9px] text-zinc-400 font-medium uppercase font-mono">{t.userName}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className={cn("font-black text-sm font-mono", t.type === 'income' ? "text-emerald-600" : "text-rose-600")}>
                                      {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                                    </p>
                                    <p className="text-[9px] text-zinc-400 font-bold uppercase italic">{t.category}</p>
                                  </div>
                                </div>
                              </div>
                      </div>
                    ))}
                    {filteredTransactions.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-zinc-400 py-10 opacity-30 italic text-xs">
                        Nenhuma transação registrada
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Notification Feed */}
            <div className="space-y-8">
              <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm flex flex-col h-full md:min-h-[550px]">
                <h3 className="text-lg font-black text-zinc-900 mb-6 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-indigo-600" /> Atividade & Feed
                </h3>
                <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                  {notifications.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-400 py-10">
                      <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle2 className="w-8 h-8 opacity-20" />
                      </div>
                      <p className="text-xs font-black text-center uppercase tracking-widest">Tudo em dia!</p>
                      <p className="text-[10px] text-center mt-1 text-zinc-400">Sem notificações no momento.</p>
                    </div>
                  )}
                  {notifications.map((n) => (
                    <div key={n.id} className="relative pl-6 border-l border-zinc-100 last:border-0 pb-6">
                      <div className={cn(
                        "absolute top-0 -left-[5px] w-2.5 h-2.5 rounded-full ring-4 ring-white",
                        n.type === 'invitation' ? "bg-indigo-600 animate-pulse" : 
                        n.type === 'bill' ? "bg-amber-500" : "bg-emerald-500"
                      )} />
                      <div className={cn(
                        "p-4 rounded-2xl transition-all border",
                        n.type === 'invitation' ? "bg-indigo-50/50 border-indigo-100 hover:bg-indigo-50" :
                        n.type === 'bill' ? "bg-amber-50/50 border-amber-100 hover:bg-amber-50" :
                        "bg-emerald-50/50 border-emerald-100 hover:bg-emerald-50"
                      )}>
                        <p className={cn(
                          "text-[9px] font-black uppercase tracking-widest mb-1",
                          n.type === 'invitation' ? "text-indigo-600" :
                          n.type === 'bill' ? "text-amber-600" : "text-emerald-600"
                        )}>{n.title}</p>
                        <p className="text-sm text-zinc-900 font-semibold mb-3 leading-snug">{n.message}</p>
                        
                        {n.type === 'invitation' && (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleAcceptInvitation(n.data)}
                              className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20"
                            >
                              Aceitar
                            </button>
                            <button 
                              onClick={() => handleDeclineInvitation(n.id)}
                              className="flex-1 py-2 bg-white text-zinc-600 border border-zinc-200 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-zinc-50 transition-colors"
                            >
                              Recusar
                            </button>
                          </div>
                        )}
                        
                        <p className="mt-2 text-[9px] text-zinc-400 font-bold uppercase italic flex items-center gap-1">
                          <CalendarIcon className="w-3 h-3" /> {format(n.date, "d 'de' MMMM", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-zinc-500 bg-zinc-50 px-3 py-2 rounded-xl border border-zinc-200 w-fit">
                <Filter className="w-4 h-4" />
                <span className="text-sm font-medium">Filtrar por período</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-100 font-bold">
                  <tr>
                    <th className="px-6 py-4">Data</th>
                    <th className="px-6 py-4">Descrição</th>
                    <th className="px-6 py-4">Categoria</th>
                    <th className="px-6 py-4">Responsável</th>
                    <th className="px-6 py-4 text-right">Valor</th>
                    <th className="px-6 py-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredTransactions.map((t) => (
                    <tr key={t.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">{format(parseISO(t.date), 'dd/MM/yyyy')}</td>
                      <td className="px-6 py-4 font-bold text-zinc-900">
                        <div className="flex items-center gap-2">
                          {t.description || '-'}
                          <span className={cn(
                            "text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                            t.scope === 'shared' ? "bg-zinc-100 text-zinc-500" : "bg-indigo-50 text-indigo-500"
                          )}>
                            {t.scope === 'shared' ? (household?.name || 'Casal') : 'Meu'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-zinc-100 rounded-full text-xs text-zinc-600 font-medium">{t.category}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {t.splits ? (
                            <div className="flex flex-wrap gap-2">
                              {t.splits.map((s, idx) => (
                                <div key={idx} className="flex items-center gap-1.5 bg-zinc-50 px-2 py-1 rounded-lg border border-zinc-100">
                                  <div className="w-5 h-5 rounded-full bg-zinc-900 flex items-center justify-center text-[8px] text-white">
                                    {s.userName[0]}
                                  </div>
                                  <span className="text-[10px] font-bold text-zinc-700 truncate">{s.userName}: {formatCurrency(s.amount)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-zinc-900 flex items-center justify-center text-[10px] text-white">
                                {t.userName[0]}
                              </div>
                              <span className="text-sm text-zinc-700">{t.userName}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={cn("px-6 py-4 text-right font-bold whitespace-nowrap", t.type === 'income' ? "text-emerald-600" : "text-rose-600")}>
                        {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => startEditTransaction(t)} className="p-2 text-zinc-400 hover:text-indigo-600 transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => deleteTransaction(t.id!)} className="p-2 text-zinc-400 hover:text-rose-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'goals' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             <div className="bg-white p-6 rounded-3xl border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center h-[200px] text-zinc-400">
                <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center mb-2">
                  <Plus className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium">Nova Meta</p>
             </div>
             {goals.map(goal => (
               <div key={goal.id} className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-2xl">{goal.icon || '🎯'}</span>
                    <Settings className="w-4 h-4 text-zinc-400" />
                  </div>
                  <h4 className="font-bold text-zinc-900 mb-1">{goal.title}</h4>
                  <p className="text-zinc-500 text-sm mb-4">Meta: {formatCurrency(goal.targetAmount)}</p>
                  
                  <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden mb-2">
                    <div 
                      className="h-full bg-zinc-900 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                    <span>{Math.round((goal.currentAmount / goal.targetAmount) * 100)}% concluído</span>
                    <span>{formatCurrency(goal.targetAmount - goal.currentAmount)} faltam</span>
                  </div>
               </div>
             ))}
          </div>
        )}
        {activeTab === 'recurring' && (
          <div className="space-y-6">
            <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl flex items-start gap-4">
              <div className="bg-amber-100 p-3 rounded-2xl text-amber-600 shrink-0">
                <CalendarClock className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-amber-900">Programar Lançamentos</h4>
                <p className="text-amber-800 text-sm opacity-80">
                  Configure contas que se repetem todo mês. Use isto para Aluguel, Academias e Assinaturas.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               <button 
                onClick={() => setIsRecurringModalOpen(true)}
                className="bg-white p-8 rounded-3xl border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center text-zinc-400 min-h-[200px] hover:border-zinc-900 hover:text-zinc-900 transition-all"
               >
                  <Plus className="w-8 h-8 mb-2" />
                  <p className="font-bold">Nova Conta Recorrente</p>
               </button>

               {filteredRecurring.map(item => (
                 <div key={item.id} className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm relative group">
                    <button 
                      onClick={() => deleteRecurring(item.id!)}
                      className="absolute top-4 right-4 p-2 text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center mb-4 font-bold text-xl",
                      item.type === 'expense' ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                    )}>
                      {item.description ? item.description[0].toUpperCase() : item.category[0].toUpperCase()}
                    </div>
                    <h4 className="font-bold text-zinc-900 mb-1">{item.description || item.category}</h4>
                    <p className="text-zinc-500 text-sm mb-4">{item.category} • Dia {item.dayOfMonth}</p>
                    <p className={cn("text-xl font-bold", item.type === 'expense' ? "text-rose-600" : "text-emerald-600")}>
                      {formatCurrency(item.amount)}
                    </p>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeTab === 'group' && (
          <div className="w-full space-y-8">
            <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tight">Gestão de Grupo</h3>
                  <p className="text-sm text-zinc-500 font-medium">Compartilhe finanças com seu parceiro(a)</p>
                </div>
                {(profile?.householdIds || []).length < 2 && (
                  <button 
                    onClick={handleCreateGroup}
                    disabled={isInviteLoading}
                    className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                  >
                    <Plus className="w-4 h-4" /> Criar Novo Grupo
                  </button>
                )}
              </div>

              {/* Group Switcher if multi-group */}
              {(profile?.householdIds && profile.householdIds.length > 1) && (
                <div className="space-y-4 pt-4 border-t border-zinc-100">
                  <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Seus Grupos (Limite: 2)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {profile.householdIds.map((hid) => (
                      <button
                        key={hid}
                        onClick={async () => {
                          if (hid === profile.householdId) return;
                          await updateDoc(doc(db, 'users', user.uid), { householdId: hid });
                        }}
                        className={cn(
                          "p-4 rounded-2xl border transition-all text-left group",
                          profile.householdId === hid 
                            ? "bg-zinc-900 border-zinc-900 text-white shadow-lg" 
                            : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-900 hover:text-zinc-900"
                        )}
                      >
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">
                          {profile.householdId === hid ? 'Ativo' : 'Trocar para'}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="font-bold truncate">{hid}</span>
                          <ChevronRight className={cn("w-4 h-4 opacity-0 group-hover:opacity-100 transition-all", profile.householdId === hid && "hidden")} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!profile?.householdId ? (
                <section className="space-y-6 pt-4 border-t border-zinc-100">
                  <div className="flex items-center gap-3 mb-2">
                    <LinkIcon className="w-5 h-5 text-indigo-600" />
                    <h4 className="font-bold text-zinc-900">Entrar em Grupo Existente</h4>
                  </div>
                  <form onSubmit={handleJoinGroup} className="flex gap-4">
                    <input 
                      type="text" 
                      placeholder="Cole o ID do Grupo aqui"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      className="flex-1 px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all font-mono"
                    />
                    <button 
                      type="submit"
                      disabled={isInviteLoading || !joinCode}
                      className="px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 disabled:opacity-50 transition-all whitespace-nowrap"
                    >
                      {isInviteLoading ? 'Entrando...' : 'Entrar'}
                    </button>
                  </form>
                  <div className="bg-zinc-50 p-6 rounded-2xl border border-zinc-100 border-dashed">
                    <p className="text-xs text-zinc-500 text-center">Você não faz parte de nenhum grupo compartilhado no momento. Você pode criar um novo grupo ou pedir para o seu parceiro copiar o ID do grupo dele para você entrar.</p>
                  </div>
                </section>
              ) : (
                <div className="space-y-8">
                  <div className="p-6 bg-zinc-900 rounded-3xl text-white shadow-xl flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">ID do Grupo</p>
                      <h4 className="text-lg font-mono font-black">{profile.householdId}</h4>
                    </div>
                    <button 
                      onClick={copyHouseholdId}
                      className="p-3 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"
                      title="Copiar ID"
                    >
                      <LinkIcon className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="border-t border-zinc-100" />

                  <section className="space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                      <User className="w-5 h-5 text-indigo-600" />
                      <h4 className="font-bold text-zinc-900 uppercase tracking-tight text-sm">Membros do Grupo</h4>
                    </div>
                    <div className="space-y-3">
                      {groupMembers.map((member) => (
                        <div key={member.uid} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "w-12 h-12 rounded-full flex items-center justify-center text-zinc-600 font-bold shadow-sm",
                              member.uid === user?.uid ? "bg-indigo-50 border border-indigo-100" : "bg-white"
                            )}>
                              {member.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                                {member.displayName}
                                {member.uid === household?.createdBy && <span className="text-[8px] bg-zinc-900 text-white px-1.5 py-0.5 rounded-full uppercase tracking-widest font-black">Líder</span>}
                                {member.uid === user?.uid && <span className="text-[8px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full uppercase tracking-widest font-black">Você</span>}
                              </p>
                              <p className="text-[10px] text-zinc-500 font-medium uppercase">{member.email}</p>
                            </div>
                          </div>
                          {household?.createdBy === user?.uid && member.uid !== user?.uid && (
                            <button 
                              onClick={() => handleRemoveMember(member.uid)}
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}

                      {sentInvitations.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between p-4 bg-zinc-50/50 rounded-2xl border border-dashed border-zinc-200">
                          <div className="flex items-center gap-4 opacity-70">
                            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-zinc-400 font-bold shadow-sm border-2 border-dashed border-zinc-100 italic">
                              {inv.invitedUserEmail?.charAt(0).toUpperCase() || '?'}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                                {inv.invitedUserEmail || 'Convidado'}
                                <span className={cn(
                                  "text-[8px] px-1.5 py-0.5 rounded-full uppercase tracking-widest font-black",
                                  inv.status === 'pending' ? "bg-amber-50 text-amber-600 animate-pulse" : 
                                  inv.status === 'accepted' ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-400"
                                )}>
                                  {inv.status === 'pending' ? 'Pendente' : inv.status === 'accepted' ? 'Aceito' : 'Recusado'}
                                </span>
                              </p>
                              <p className="text-[10px] text-zinc-500 font-medium uppercase font-mono tracking-tight italic">
                                {inv.status === 'pending' ? 'Convite enviado' : inv.status === 'accepted' ? 'Fazem parte do grupo' : 'Convite encerrado'}
                              </p>
                            </div>
                          </div>
                          {inv.status === 'pending' && inv.invitedByUserId === user?.uid && (
                            <button 
                              onClick={() => handleDeclineInvitation(inv.id!)}
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Cancelar Convite"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-4 pt-6 border-t border-zinc-100">
                    <div className="flex items-center gap-3 mb-2">
                      <UserPlus className="w-5 h-5 text-emerald-600" />
                      <h4 className="font-bold text-zinc-900 uppercase tracking-tight text-sm">Convidar Parceiro</h4>
                    </div>
                    <form onSubmit={handleInvite} className="flex gap-4">
                      <input 
                        type="email" 
                        placeholder="E-mail do parceiro" 
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="flex-1 px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
                      />
                      <button 
                        type="submit"
                        disabled={isInviteLoading || !inviteEmail}
                        className="px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 disabled:opacity-50 transition-all flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" /> <span>{isInviteLoading ? 'Enviando...' : 'Convidar'}</span>
                      </button>
                    </form>
                    {inviteError && <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest">{inviteError}</p>}
                  </section>

                  <div className="border-t border-zinc-100" />

                  <section className="space-y-4 p-6 bg-rose-50/30 rounded-3xl border border-rose-100">
                    <div className="flex items-center gap-3 mb-2">
                      <LogOut className="w-5 h-5 text-rose-600" />
                      <h4 className="font-bold text-zinc-900 font-mono text-xs uppercase tracking-widest">Sessão e Grupo</h4>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed">Gerencie sua participação no grupo ou saia da sua conta.</p>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {profile?.householdId && (
                        <button 
                          onClick={handleLeaveGroup}
                          disabled={isInviteLoading}
                          className="py-3 bg-white text-rose-600 border border-rose-200 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-rose-50 transition-all"
                        >
                          {isInviteLoading ? 'Saindo...' : 'Sair do Grupo'}
                        </button>
                      )}
                      <button 
                        onClick={() => {
                          if (window.confirm('Deseja realmente sair da conta?')) {
                            auth.signOut();
                          }
                        }}
                        className="py-3 bg-zinc-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-zinc-800 transition-all shadow-lg"
                      >
                        Sair da Conta
                      </button>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Mobile Navbar */}
      <nav className="md:hidden fixed bottom-6 left-6 right-6 h-16 bg-zinc-900 text-white rounded-2xl flex items-center justify-around px-4 shadow-2xl z-20">
        <button onClick={() => setActiveTab('overview')} className={cn("p-2", activeTab === 'overview' ? "text-white" : "text-zinc-500")} title="Visão Geral"><PieChartIcon className="w-5 h-6" /></button>
        <button onClick={() => setActiveTab('transactions')} className={cn("p-2", activeTab === 'transactions' ? "text-white" : "text-zinc-500")} title="Extrato"><CalendarClock className="w-6 h-6" /></button>
        <button 
          onClick={() => {
            if (activeTab === 'group') return;
            setIsModalOpen(true);
          }} 
          className={cn(
            "bg-white text-zinc-900 p-3 rounded-xl shadow-xl -mt-8 border-4 border-zinc-50 transition-all",
            activeTab === 'group' && "opacity-0 scale-0 pointer-events-none"
          )} 
          title="Novo Lançamento"
        >
          <Plus className="w-6 h-6" />
        </button>
        <button onClick={() => setActiveTab('goals')} className={cn("p-2", activeTab === 'goals' ? "text-white" : "text-zinc-500")} title="Metas"><Target className="w-6 h-6" /></button>
        <button onClick={() => setActiveTab('group')} className={cn("p-1.5 rounded-full overflow-hidden", activeTab === 'group' ? "ring-2 ring-white" : "")} title="Perfil e Grupo">
          {profile?.photoURL ? (
            <img src={profile.photoURL} alt="Profile" className="w-6 h-6 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <User className={cn("w-6 h-6", activeTab === 'group' ? "text-white" : "text-zinc-500")} />
          )}
        </button>
      </nav>

      {/* Modal - Nova Transação */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden shadow-zinc-900/20"
            >
              <div className="bg-zinc-900 p-6 text-white flex items-center justify-between">
                <h3 className="text-xl font-bold">{editingTransactionId ? 'Editar Transação' : 'Nova Transação'}</h3>
                <button onClick={() => {
                  setIsModalOpen(false);
                  setEditingTransactionId(null);
                }} className="text-white/60 hover:text-white transition-colors">Voltar</button>
              </div>
              <form onSubmit={handleAddTransaction} className="p-8 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-2xl">
                  {(['expense', 'income'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData({ ...formData, type })}
                      className={cn(
                        "py-3 rounded-xl font-bold text-sm transition-all capitalize",
                        formData.type === type ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                      )}
                    >
                      {type === 'expense' ? 'Despesa' : 'Receita'}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 block text-center">Escopo do Lançamento</label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-2xl">
                    {[
                      { id: 'personal', label: 'Pessoal (Meu)' },
                      { id: 'shared', label: `${household?.name || 'Casal'} (Grupo)` },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, scope: s.id as any })}
                        className={cn(
                          "py-3 rounded-xl font-bold text-xs transition-all",
                          formData.scope === s.id ? "bg-indigo-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {formData.scope === 'shared' && formData.type === 'expense' && groupMembers.length > 0 && (
                  <div className="p-5 bg-gradient-to-br from-indigo-50/50 to-zinc-50 rounded-3xl border border-indigo-100 animate-in fade-in slide-in-from-top-2 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-600 rounded-lg">
                          <User className="w-3 h-3 text-white" />
                        </div>
                        <label className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Divisores do Gasto</label>
                      </div>
                      <button 
                        type="button"
                        onClick={() => {
                          const total = parseFloat(formData.amount) || 0;
                          const splitAmount = (total / groupMembers.length).toFixed(2);
                          setFormData({ 
                            ...formData, 
                            isEqualSplit: true,
                            splits: groupMembers.map(m => ({ userId: m.uid, userName: m.displayName, amount: splitAmount }))
                          });
                        }}
                        className="text-[10px] font-black text-indigo-600 uppercase hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-all border border-indigo-200 bg-white"
                      >
                        Dividir Igual
                      </button>
                    </div>

                    <div className="space-y-4">
                      {groupMembers.map(member => {
                        const currentSplit = formData.splits.find(s => s.userId === member.uid) || { userId: member.uid, userName: member.displayName, amount: '' };
                        return (
                          <div key={member.uid} className="flex items-center justify-between gap-4 group">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-zinc-800">{member.displayName}</span>
                              {member.uid === user?.uid && <span className="text-[8px] text-indigo-500 font-black uppercase tracking-tighter">Você</span>}
                            </div>
                            <div className="flex items-center gap-2 group-focus-within:translate-x-[-4px] transition-transform">
                              <span className="text-[10px] text-zinc-400 font-black">R$</span>
                              <input 
                                type="number"
                                step="0.01"
                                placeholder="0,00"
                                value={currentSplit.amount}
                                onChange={(e) => {
                                  let newSplits = [...formData.splits];
                                  const index = newSplits.findIndex(s => s.userId === member.uid);
                                  const val = e.target.value;
                                  
                                  if (index >= 0) {
                                    newSplits[index].amount = val;
                                  } else {
                                    newSplits.push({ userId: member.uid, userName: member.displayName, amount: val });
                                  }
                                  
                                  // Ensure all members have a split entry
                                  groupMembers.forEach(m => {
                                    if (!newSplits.find(ns => ns.userId === m.uid)) {
                                      newSplits.push({ userId: m.uid, userName: m.displayName, amount: '' });
                                    }
                                  });
                                  
                                  const sum = newSplits.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
                                  
                                  setFormData({ 
                                    ...formData, 
                                    splits: newSplits,
                                    amount: sum > 0 ? sum.toFixed(2) : formData.amount,
                                    isEqualSplit: false 
                                  });
                                }}
                                className="w-28 px-4 py-3 bg-white border border-zinc-200 rounded-2xl text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-right shadow-sm group-focus-within:border-indigo-300"
                              />
                            </div>
                          </div>
                        );
                      })}
                      
                      <div className="pt-5 mt-2 border-t border-zinc-200">
                        <div className="flex justify-between items-center bg-zinc-900 p-4 rounded-2xl shadow-xl">
                          <span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Soma Total</span>
                          <div className="flex flex-col items-end">
                            <span className="text-xl font-black font-mono text-white">
                              {formatCurrency(formData.splits.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0))}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                   <div className={cn(formData.scope === 'shared' && formData.type === 'expense' && groupMembers.length > 0 && "opacity-50 grayscale scale-95 origin-left")}>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Valor total (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      readOnly={formData.scope === 'shared' && formData.type === 'expense' && groupMembers.length > 0}
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0,00"
                      className="w-full text-4xl font-bold bg-transparent border-b-2 border-zinc-100 focus:border-zinc-900 outline-none pb-2 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Data</label>
                      <input
                        type="date"
                        required
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Categoria</label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-zinc-900 appearance-none"
                      >
                        {formData.type === 'expense' ? (
                          <>
                            <option>Alimentação</option>
                            <option>Transporte</option>
                            <option>Lazer</option>
                            <option>Saúde</option>
                            <option>Educação</option>
                            <option>Moradia</option>
                            <option>Contas Fixas</option>
                            <option>Outros</option>
                          </>
                        ) : (
                          <>
                            <option>Salário</option>
                            <option>Investimentos</option>
                            <option>Presente</option>
                            <option>Outros</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Descrição</label>
                    <input
                      type="text"
                      placeholder="Ex: Supermercado, Aluguel..."
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold shadow-xl hover:bg-zinc-800 transition-all active:scale-[0.98] mt-4"
                >
                  {editingTransactionId ? 'Salvar Alterações' : 'Salvar Lançamento'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal - Nova Conta Fixa */}
      <AnimatePresence>
        {isRecurringModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsRecurringModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden shadow-zinc-900/20"
            >
              <div className="bg-amber-600 p-6 text-white flex items-center justify-between">
                <h3 className="text-xl font-bold">Nova Conta Fixa</h3>
                <button onClick={() => setIsRecurringModalOpen(false)} className="text-white/60 hover:text-white transition-colors">Voltar</button>
              </div>
              <form onSubmit={handleAddRecurring} className="p-8 space-y-4">
                <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-2xl">
                  {(['expense', 'income'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setRecurringFormData({ ...recurringFormData, type })}
                      className={cn(
                        "py-3 rounded-xl font-bold text-sm transition-all capitalize",
                        recurringFormData.type === type ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                      )}
                    >
                      {type === 'expense' ? 'Despesa' : 'Receita'}
                    </button>
                  ))}
                </div>

                {profile?.householdId && (
                  <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-2xl mt-4">
                    {[
                      { id: 'personal', label: 'Meu' },
                      { id: 'shared', label: household?.name || 'Casal' },
                    ].map((scope) => (
                      <button
                        key={scope.id}
                        type="button"
                        onClick={() => setRecurringFormData({ ...recurringFormData, scope: scope.id as any })}
                        className={cn(
                          "py-3 rounded-xl font-bold text-sm transition-all",
                          recurringFormData.scope === scope.id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                        )}
                      >
                        {scope.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="space-y-4">
                   <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Valor Mensal (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={recurringFormData.amount}
                      onChange={(e) => setRecurringFormData({ ...recurringFormData, amount: e.target.value })}
                      placeholder="0,00"
                      className="w-full text-4xl font-bold bg-transparent border-b-2 border-zinc-100 focus:border-amber-600 outline-none pb-2 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Dia do Vencimento</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        required
                        value={recurringFormData.dayOfMonth}
                        onChange={(e) => setRecurringFormData({ ...recurringFormData, dayOfMonth: e.target.value })}
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-600"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Categoria</label>
                      <select
                        value={recurringFormData.category}
                        onChange={(e) => setRecurringFormData({ ...recurringFormData, category: e.target.value })}
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-600 appearance-none"
                      >
                        <option>Moradia</option>
                        <option>Assinaturas</option>
                        <option>Saúde</option>
                        <option>Educação</option>
                        <option>Aluguel</option>
                        <option>Internet</option>
                        <option>Energia</option>
                        <option>Outros</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Descrição</label>
                    <input
                      type="text"
                      placeholder="Ex: Netflix, Aluguel do Ap..."
                      value={recurringFormData.description}
                      onChange={(e) => setRecurringFormData({ ...recurringFormData, description: e.target.value })}
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-600"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-4 bg-amber-600 text-white rounded-2xl font-bold shadow-xl hover:bg-amber-700 transition-all active:scale-[0.98] mt-4"
                >
                  Salvar Conta Fixa
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal - Configurações de Grupo */}
      <AnimatePresence>
        {isGroupModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsGroupModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden shadow-zinc-900/20"
            >
              <div className="bg-zinc-900 p-6 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">Gestão do Grupo</h3>
                  <p className="text-zinc-400 text-xs">ID: {profile?.householdId}</p>
                </div>
                <button onClick={() => setIsGroupModalOpen(false)} className="text-white/60 hover:text-white transition-colors">Fechar</button>
              </div>

              <div className="p-8 space-y-8">
                {/* Invite Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <UserPlus className="w-5 h-5 text-indigo-600" />
                    <h4 className="font-bold text-zinc-900">Convidar Parceiro</h4>
                  </div>
                  <p className="text-sm text-zinc-500">Adicione seu parceiro(a) ao grupo usando o e-mail cadastrado dele(a).</p>
                  <form onSubmit={handleInvite} className="flex gap-2">
                    <input 
                      type="email"
                      placeholder="email@exemplo.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="flex-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all"
                      required
                    />
                    <button 
                      type="submit"
                      disabled={isInviteLoading}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all"
                    >
                      {isInviteLoading ? '...' : 'Enviar'}
                    </button>
                  </form>
                  {inviteError && <p className="text-xs text-red-500">{inviteError}</p>}
                </section>

                <div className="border-t border-zinc-100" />

                {/* Members Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <User className="w-5 h-5 text-indigo-600" />
                    <h4 className="font-bold text-zinc-900">Membros do Grupo</h4>
                  </div>
                  <div className="space-y-3">
                    {groupMembers.map((member) => (
                      <div key={member.uid} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                        <div className="flex items-center gap-3">
                          <button 
                            disabled={member.uid !== user?.uid}
                            onClick={() => {
                              setNewPhotoUrl(member.photoURL || '');
                              setIsProfileModalOpen(true);
                            }}
                            className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center text-zinc-600 font-bold shadow-sm overflow-hidden",
                              member.uid === user?.uid ? "bg-indigo-50 border border-indigo-100 cursor-pointer hover:border-indigo-300" : "bg-white border border-transparent"
                            )}
                          >
                            {member.photoURL ? (
                              <img src={member.photoURL} alt={member.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              member.displayName.charAt(0)
                            )}
                          </button>
                          <div>
                            <p className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                              {member.displayName}
                              {member.uid === household?.createdBy && <span className="text-[8px] bg-zinc-900 text-white px-1.5 py-0.5 rounded-full uppercase tracking-widest font-black">Líder</span>}
                              {member.uid === user?.uid && <span className="text-[8px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full uppercase tracking-widest font-black">Você</span>}
                            </p>
                            <p className="text-[10px] text-zinc-500 font-medium">{member.email}</p>
                          </div>
                        </div>
                        {household?.createdBy === user?.uid && member.uid !== user?.uid && (
                          <button 
                            onClick={() => handleRemoveMember(member.uid)}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100"
                            title="Remover do grupo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <div className="border-t border-zinc-100" />

                {/* Join Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <LinkIcon className="w-5 h-5 text-emerald-600" />
                    <h4 className="font-bold text-zinc-900">Entrar em Grupo Existente</h4>
                  </div>
                  <p className="text-sm text-zinc-500">Já possui um código? Insira-o abaixo para migrar para esse grupo.</p>
                  <form onSubmit={handleJoinGroup} className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="Código do Grupo"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      className="flex-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 transition-all font-mono uppercase"
                      required
                    />
                    <button 
                      type="submit"
                      disabled={isInviteLoading}
                      className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all"
                    >
                      {isInviteLoading ? '...' : 'Unir'}
                    </button>
                  </form>
                </section>

                <div className="border-t border-zinc-100" />

                <section className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <LogOut className="w-5 h-5 text-rose-600" />
                    <h4 className="font-bold text-zinc-900">Zona de Perigo</h4>
                  </div>
                  <p className="text-sm text-zinc-500">Ao sair, você voltará para um espaço individual. Suas transações compartilhadas continuarão disponíveis para os membros restantes deste grupo.</p>
                  <button 
                    onClick={handleLeaveGroup}
                    disabled={isInviteLoading || (household?.memberIds.length === 1 && household?.createdBy === user?.uid)}
                    className="w-full py-3 bg-rose-50 text-rose-600 rounded-xl font-bold hover:bg-rose-100 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {isInviteLoading ? 'Saindo...' : 'Sair Deste Grupo'}
                  </button>
                  {household?.memberIds.length === 1 && household?.createdBy === user?.uid && (
                    <p className="text-[10px] text-zinc-400 text-center italic">Você é o único membro. Convide alguém ou junte-se a outro grupo.</p>
                  )}
                </section>

                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                  <div className="flex gap-3">
                    <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-800 leading-relaxed">
                      <strong>Dica:</strong> Seu ID atual é <span className="font-mono bg-white/50 px-1 rounded">{profile?.householdId}</span>. 
                      Compartilhe este código com quem deseja que entre no seu grupo.
                    </p>
                  </div>
                </div>

                <button 
                  onClick={copyHouseholdId}
                  className="w-full py-3 text-zinc-500 hover:text-zinc-900 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                >
                  <MoreVertical className="w-4 h-4" /> Copiar meu ID de Grupo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Photo Modal */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="bg-zinc-900 p-6 text-white flex items-center justify-between">
                <h3 className="text-xl font-bold">Foto de Perfil</h3>
                <button onClick={() => setIsProfileModalOpen(false)} className="text-white/60 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={updateProfilePhoto} className="p-8 space-y-6">
                <div className="flex flex-col items-center">
                  <div className="w-24 h-24 rounded-full bg-zinc-100 flex items-center justify-center text-3xl font-bold border-4 border-zinc-50 overflow-hidden mb-4 shadow-inner">
                    {newPhotoUrl ? (
                      <img src={newPhotoUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      profile?.displayName[0].toUpperCase()
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 font-medium">Prévia da imagem</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">URL da Imagem</label>
                    <input 
                      type="url" 
                      value={newPhotoUrl}
                      onChange={(e) => setNewPhotoUrl(e.target.value)}
                      placeholder="https://exemplo.com/foto.jpg"
                      className="w-full mt-2 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-zinc-900 focus:outline-none text-zinc-900 shadow-inner"
                    />
                  </div>
                  
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-zinc-200" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-zinc-400">ou upload de arquivo</span>
                    </div>
                  </div>

                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setNewPhotoUrl(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-zinc-100 file:text-zinc-700 hover:file:bg-zinc-200"
                    />
                    <p className="mt-2 text-[10px] text-zinc-400 text-center italic">Sugestão: Use arquivos pequenos para melhor performance.</p>
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold shadow-xl hover:bg-zinc-800 transition-all active:scale-[0.98]"
                  >
                    Salvar Foto
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
