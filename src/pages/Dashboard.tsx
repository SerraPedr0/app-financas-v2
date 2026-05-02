import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, orderBy, addDoc, deleteDoc, doc, serverTimestamp, where, limit, or } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Transaction, Goal, RecurringTransaction } from '../types';
import { formatCurrency, cn, handleFirestoreError, OperationType } from '../lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { 
  Plus, TrendingUp, TrendingDown, Wallet, Target, 
  Clock, ArrowUpRight, ArrowDownRight, LogOut, Settings,
  PieChart as PieChartIcon, Calendar, User, Filter, MoreVertical,
  ChevronRight, Trash2, CalendarClock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const Dashboard: React.FC = () => {
  const { profile, user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'goals' | 'recurring'>('overview');
  
  // Form State
  const [formData, setFormData] = useState({
    amount: '',
    type: 'expense' as 'income' | 'expense',
    scope: 'shared' as 'personal' | 'shared',
    category: 'Alimentação',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    notes: ''
  });

  const [recurringFormData, setRecurringFormData] = useState({
    amount: '',
    type: 'expense' as 'income' | 'expense',
    category: 'Moradia',
    description: '',
    dayOfMonth: '1'
  });

  const [dashboardFilter, setDashboardFilter] = useState<'all' | 'personal' | 'shared'>('all');

  useEffect(() => {
    if (!profile?.householdId || !user) return;

    const transactionsPath = `households/${profile.householdId}/transactions`;
    const q = query(
      collection(db, transactionsPath),
      or(
        where('scope', '==', 'shared'),
        where('userId', '==', user.uid)
      ),
      orderBy('date', 'desc'),
      limit(100)
    );

    const unsubTransactions = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Transaction[];
      setTransactions(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, transactionsPath);
    });

    const goalsPath = `households/${profile.householdId}/goals`;
    const qGoals = query(collection(db, goalsPath));
    const unsubGoals = onSnapshot(qGoals, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Goal[];
      setGoals(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, goalsPath);
    });

    const recurringPath = `households/${profile.householdId}/recurring`;
    const qRecurring = query(collection(db, recurringPath));
    const unsubRecurring = onSnapshot(qRecurring, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as RecurringTransaction[];
      setRecurring(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, recurringPath);
    });

    return () => {
      unsubTransactions();
      unsubGoals();
      unsubRecurring();
    };
  }, [profile?.householdId, user?.uid]);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.householdId || !user) return;

    const path = `households/${profile.householdId}/transactions`;
    try {
      await addDoc(collection(db, path), {
        ...formData,
        amount: parseFloat(formData.amount),
        userId: user.uid,
        userName: profile.displayName,
        createdAt: serverTimestamp()
      });
      setIsModalOpen(false);
      setFormData({
        amount: '',
        type: 'expense',
        scope: 'shared',
        category: 'Alimentação',
        description: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        notes: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleAddRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.householdId || !user) return;

    const path = `households/${profile.householdId}/recurring`;
    try {
      await addDoc(collection(db, path), {
        ...recurringFormData,
        amount: parseFloat(recurringFormData.amount),
        dayOfMonth: parseInt(recurringFormData.dayOfMonth),
        userId: user.uid,
        userName: profile.displayName,
        createdAt: serverTimestamp()
      });
      setIsRecurringModalOpen(false);
      setRecurringFormData({
        amount: '',
        type: 'expense',
        category: 'Moradia',
        description: '',
        dayOfMonth: '1'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!profile?.householdId || !window.confirm('Excluir esta transação?')) return;
    const path = `households/${profile.householdId}/transactions/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const deleteRecurring = async (id: string) => {
    if (!profile?.householdId || !window.confirm('Excluir esta conta fixa?')) return;
    const path = `households/${profile.householdId}/recurring/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const copyHouseholdId = () => {
    if (profile?.householdId) {
      navigator.clipboard.writeText(profile.householdId);
      alert('ID do Grupo copiado para a área de transferência!');
    }
  };

  // Filtered lists based on current dashboard filter
  const filteredTransactions = transactions.filter(t => {
    if (dashboardFilter === 'all') return true;
    return t.scope === dashboardFilter;
  });

  // Calculations based on filtered list
  const balance = filteredTransactions.reduce((acc, t) => t.type === 'income' ? acc + t.amount : acc - t.amount, 0);
  const income = filteredTransactions.reduce((acc, t) => t.type === 'income' ? acc + t.amount : acc, 0);
  const expense = filteredTransactions.reduce((acc, t) => t.type === 'expense' ? acc + t.amount : acc, 0);

  const categoryData = Object.entries(
    filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  const COLORS = ['#18181b', '#3f3f46', '#71717a', '#a1a1aa', '#d4d4d8'];

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
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold border border-zinc-700">
              {profile?.displayName[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.displayName}</p>
              <button 
                onClick={copyHouseholdId}
                className="text-xs text-zinc-500 truncate hover:text-zinc-300 transition-colors flex items-center gap-1 uppercase font-mono"
              >
                ID: {profile?.householdId} <MoreVertical className="w-3 h-3" />
              </button>
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
      <main className="md:ml-64 p-4 md:p-10 max-w-7xl mx-auto">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900">
              {activeTab === 'overview' ? 'Visão Geral' : activeTab === 'transactions' ? 'Transações' : activeTab === 'goals' ? 'Metas' : 'Recorrência'}
            </h2>
            <p className="text-zinc-500">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
          </div>
          
          <div className="flex bg-zinc-200/50 p-1 rounded-2xl w-fit self-start">
            {[
              { id: 'all', label: 'Tudo' },
              { id: 'personal', label: 'Meu' },
              { id: 'shared', label: 'Casal' },
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
            ) : (
              <button
                onClick={() => setIsModalOpen(true)}
                className="bg-zinc-900 text-white px-6 py-3 rounded-2xl font-medium shadow-lg hover:bg-zinc-800 transition-all flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                <span className="hidden sm:inline">Nova Transação</span>
              </button>
            )}
          </div>
        </header>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            {balance < 1000 && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3 text-amber-800"
              >
                <Clock className="w-5 h-5 text-amber-500" />
                <p className="text-sm font-medium">Atenção: O saldo consolidado está abaixo de R$ 1.000,00. Planeje os próximos gastos!</p>
              </motion.div>
            )}
            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 p-6 rounded-3xl text-white shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-white/10 rounded-xl"><Wallet className="w-6 h-6 text-white" /></div>
                  <span className="text-xs text-zinc-400 font-mono">Saldo Consolidado</span>
                </div>
                <h3 className="text-3xl font-bold">{formatCurrency(balance)}</h3>
              </motion.div>

              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }} className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-emerald-50 rounded-xl"><TrendingUp className="w-6 h-6 text-emerald-600" /></div>
                  <span className="text-xs text-zinc-400 font-mono">Receitas</span>
                </div>
                <h3 className="text-3xl font-bold text-zinc-900">{formatCurrency(income)}</h3>
                <div className="mt-2 flex items-center gap-1 text-xs text-emerald-600">
                  <ArrowUpRight className="w-4 h-4" /> <span>Este mês</span>
                </div>
              </motion.div>

              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }} className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-rose-50 rounded-xl"><TrendingDown className="w-6 h-6 text-rose-600" /></div>
                  <span className="text-xs text-zinc-400 font-mono">Despesas</span>
                </div>
                <h3 className="text-3xl font-bold text-zinc-900">{formatCurrency(expense)}</h3>
                <div className="mt-2 flex items-center gap-1 text-xs text-rose-600">
                  <ArrowDownRight className="w-4 h-4" /> <span>Este mês</span>
                </div>
              </motion.div>
            </div>

            {/* Charts & Recent Transactions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm min-h-[400px]">
                <h4 className="font-bold text-zinc-900 mb-6 flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-zinc-400" /> Gastos por Categoria
                </h4>
                <div className="h-[250px] w-full">
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
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {categoryData.slice(0, 4).map((c, i) => (
                    <div key={c.name} className="flex items-center gap-2 text-xs text-zinc-600">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="truncate">{c.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="font-bold text-zinc-900 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-zinc-400" /> Recentes
                  </h4>
                  <button onClick={() => setActiveTab('transactions')} className="text-zinc-500 hover:text-zinc-900 text-sm font-medium">Ver tudo</button>
                </div>
                <div className="flex-1 space-y-4">
                  {filteredTransactions.slice(0, 5).map((t) => (
                    <div key={t.id} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-zinc-50 transition-colors group">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        t.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      )}>
                        {t.type === 'income' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-zinc-900 truncate">{t.description || t.category}</p>
                          <span className={cn(
                            "text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                            t.scope === 'shared' ? "bg-zinc-100 text-zinc-500" : "bg-indigo-50 text-indigo-500"
                          )}>
                            {t.scope === 'shared' ? 'Casal' : 'Meu'}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 uppercase flex items-center gap-1">
                          <User className="w-3 h-3" /> {t.userName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn("font-bold", t.type === 'income' ? "text-emerald-600" : "text-rose-600")}>
                          {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                        </p>
                        <p className="text-[10px] text-zinc-400">{format(parseISO(t.date), 'dd/MM/yyyy')}</p>
                      </div>
                    </div>
                  ))}
                  {filteredTransactions.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-400 py-10">
                      <Calendar className="w-12 h-12 mb-2 opacity-10" />
                      <p className="text-sm">Nenhuma transação este mês</p>
                    </div>
                  )}
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
                            {t.scope === 'shared' ? 'Casal' : 'Meu'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-zinc-100 rounded-full text-xs text-zinc-600 font-medium">{t.category}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-zinc-900 flex items-center justify-center text-[10px] text-white">
                            {t.userName[0]}
                          </div>
                          <span className="text-sm text-zinc-700">{t.userName}</span>
                        </div>
                      </td>
                      <td className={cn("px-6 py-4 text-right font-bold whitespace-nowrap", t.type === 'income' ? "text-emerald-600" : "text-rose-600")}>
                        {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => deleteTransaction(t.id!)} className="p-2 text-zinc-400 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
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

               {recurring.map(item => (
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
                      {item.description[0].toUpperCase()}
                    </div>
                    <h4 className="font-bold text-zinc-900 mb-1">{item.description}</h4>
                    <p className="text-zinc-500 text-sm mb-4">{item.category} • Dia {item.dayOfMonth}</p>
                    <p className={cn("text-xl font-bold", item.type === 'expense' ? "text-rose-600" : "text-emerald-600")}>
                      {formatCurrency(item.amount)}
                    </p>
                 </div>
               ))}
            </div>
          </div>
        )}
      </main>

      {/* Mobile Navbar */}
      <nav className="md:hidden fixed bottom-6 left-6 right-6 h-16 bg-zinc-900 text-white rounded-2xl flex items-center justify-around px-4 shadow-2xl z-20">
        <button onClick={() => setActiveTab('overview')} className={cn("p-2", activeTab === 'overview' ? "text-white" : "text-zinc-500")}><PieChartIcon className="w-6 h-6" /></button>
        <button onClick={() => setActiveTab('transactions')} className={cn("p-2", activeTab === 'transactions' ? "text-white" : "text-zinc-500")}><CalendarClock className="w-6 h-6" /></button>
        <button onClick={() => setIsModalOpen(true)} className="bg-white text-zinc-900 p-3 rounded-xl shadow-xl -mt-8 border-4 border-zinc-50"><Plus className="w-6 h-6" /></button>
        <button onClick={() => setActiveTab('goals')} className={cn("p-2", activeTab === 'goals' ? "text-white" : "text-zinc-500")}><Target className="w-6 h-6" /></button>
        <button onClick={() => auth.signOut()} className="p-2 text-zinc-500"><User className="w-6 h-6" /></button>
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
                <h3 className="text-xl font-bold">Nova Transação</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-white/60 hover:text-white transition-colors">Voltar</button>
              </div>
              <form onSubmit={handleAddTransaction} className="p-8 space-y-4">
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
                      { id: 'shared', label: 'Casal (Compartilhado)' },
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

                <div className="space-y-4">
                   <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Valor (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
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
                  Salvar Lançamento
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
    </div>
  );
};
