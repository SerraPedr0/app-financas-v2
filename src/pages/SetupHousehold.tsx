import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, setDoc, updateDoc, arrayUnion, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion } from 'motion/react';
import { House, Plus, Hash } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/utils';

export const SetupHousehold: React.FC = () => {
  const { user } = useAuth();
  const [householdName, setHouseholdName] = useState('');
  const [joinId, setJoinId] = useState('');
  const [mode, setMode] = useState<'root' | 'create' | 'join'>('root');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const createHousehold = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const householdId = Math.random().toString(36).substring(2, 10).toUpperCase();
      const householdRef = doc(db, 'households', householdId);
      
      await setDoc(householdRef, {
        name: householdName,
        createdBy: user.uid,
        memberIds: [user.uid],
        createdAt: serverTimestamp()
      });

      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || 'Usuário',
        householdId: householdId,
        createdAt: serverTimestamp()
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, 'households/users');
    } finally {
      setLoading(false);
    }
  };

  const joinHousehold = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const householdRef = doc(db, 'households', joinId);
      const householdSnap = await getDoc(householdRef);

      if (!householdSnap.exists()) {
        throw new Error('Grupo não encontrado.');
      }

      await updateDoc(householdRef, {
        memberIds: arrayUnion(user.uid)
      });

      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || 'Usuário',
        householdId: joinId,
        createdAt: serverTimestamp()
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `households/${joinId}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-zinc-200 p-8"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="bg-zinc-100 p-4 rounded-full mb-4">
            <House className="w-8 h-8 text-zinc-900" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Configurar Grupo</h1>
          <p className="text-zinc-500 text-center mt-2">
            Crie um novo grupo financeiro ou entre em um existente para compartilhar suas finanças.
          </p>
        </div>

        {error && <p className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-4 italic">{error}</p>}

        {mode === 'root' && (
          <div className="grid grid-cols-1 gap-4">
            <button
              onClick={() => setMode('create')}
              className="flex items-center gap-4 p-6 border-2 border-zinc-100 rounded-2xl hover:border-zinc-900 hover:bg-zinc-50 transition-all text-left"
            >
              <Plus className="w-6 h-6 text-zinc-900" />
              <div>
                <p className="font-bold text-zinc-900">Criar Novo Grupo</p>
                <p className="text-sm text-zinc-500">Inicie um novo controle do zero</p>
              </div>
            </button>
            <button
              onClick={() => setMode('join')}
              className="flex items-center gap-4 p-6 border-2 border-zinc-100 rounded-2xl hover:border-zinc-900 hover:bg-zinc-50 transition-all text-left"
            >
              <Hash className="w-6 h-6 text-zinc-900" />
              <div>
                <p className="font-bold text-zinc-900">Entrar em Grupo</p>
                <p className="text-sm text-zinc-500">Use um código compartilhado</p>
              </div>
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Nome do Grupo (ex: Família Silva)"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
            <button
              disabled={loading || !householdName}
              onClick={createHousehold}
              className="w-full py-4 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors"
            >
              {loading ? 'Criando...' : 'Criar Grupo'}
            </button>
            <button onClick={() => setMode('root')} className="w-full text-zinc-500 text-sm">Voltar</button>
          </div>
        )}

        {mode === 'join' && (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Código do Grupo"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 uppercase font-mono"
            />
            <button
              disabled={loading || !joinId}
              onClick={joinHousehold}
              className="w-full py-4 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors"
            >
              {loading ? 'Entrando...' : 'Entrar no Grupo'}
            </button>
            <button onClick={() => setMode('root')} className="w-full text-zinc-500 text-sm">Voltar</button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
