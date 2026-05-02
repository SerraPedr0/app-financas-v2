import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { motion } from 'motion/react';
import { Wallet, LogIn, UserPlus } from 'lucide-react';

export const Login: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        
        // Auto-create personal household
        const { setDoc, doc, serverTimestamp } = await import('firebase/firestore');
        const householdId = Math.random().toString(36).substring(2, 10).toUpperCase();
        
        await setDoc(doc(db, 'households', householdId), {
          name: `Meu Grupo`,
          createdBy: userCredential.user.uid,
          memberIds: [userCredential.user.uid],
          createdAt: serverTimestamp()
        });

        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          displayName: name,
          householdId: householdId,
          createdAt: serverTimestamp()
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-zinc-200 overflow-hidden"
      >
        <div className="bg-zinc-900 p-8 text-white flex flex-col items-center">
          <div className="bg-white/10 p-3 rounded-2xl mb-4">
            <Wallet className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">FinanceLink</h1>
          <p className="text-zinc-400 text-sm mt-1">Controle financeiro compartilhado</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl border border-red-100 italic">
              {error}
            </div>
          )}

          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Nome Completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all font-sans"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all font-sans"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all font-sans"
              required
            />
          </div>

          <button
            disabled={loading}
            type="submit"
            className="w-full py-4 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : isLogin ? (
              <><LogIn className="w-5 h-5" /> Entrar</>
            ) : (
              <><UserPlus className="w-5 h-5" /> Criar Conta</>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="w-full text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            {isLogin ? 'Não tem uma conta? Cadastre-se' : 'Já tem uma conta? Entre aqui'}
          </button>

          {isLogin && (
            <button
              type="button"
              onClick={async () => {
                if (!email) {
                  setError('Por favor, informe seu e-mail para recuperar a senha.');
                  return;
                }
                try {
                  const { sendPasswordResetEmail } = await import('firebase/auth');
                  await sendPasswordResetEmail(auth, email);
                  alert('E-mail de recuperação enviado!');
                } catch (err: any) {
                  setError(err.message);
                }
              }}
              className="w-full text-xs text-zinc-400 hover:text-zinc-600 transition-colors mt-4"
            >
              Esqueceu sua senha? Recuperar
            </button>
          )}
        </form>
      </motion.div>
    </div>
  );
};
