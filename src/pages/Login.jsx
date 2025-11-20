import React, { useState } from 'react'
import { auth } from '../firebase'
import { signInWithEmailAndPassword } from 'firebase/auth'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('candidate')
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (!auth) {
        onLogin({ email, role, displayName: email.split('@')[0] })
        return
      }
      const userCred = await signInWithEmailAndPassword(auth, email, password)
      const user = userCred.user
      onLogin({ uid: user.uid, email: user.email, role, displayName: user.displayName || user.email.split('@')[0] })
    } catch (err) {
      setError(err.message || 'Login failed')
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Login</h2>
      <form onSubmit={handleLogin} className="space-y-3">
        <input required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" className="w-full p-3 border rounded-lg" />
        <input required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password" className="w-full p-3 border rounded-lg" />
        <div className="flex items-center gap-3">
          <label className="text-sm">Role:</label>
          <select value={role} onChange={e=>setRole(e.target.value)} className="p-2 border rounded">
            <option value="candidate">Candidate</option>
            <option value="interviewer">Interviewer</option>
          </select>
        </div>
        {error && <div className="text-red-500 text-sm">{error}</div>}
        <button className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium">Login</button>
        <div className="text-xs text-slate-500 pt-2">Demo note: If you haven't created users in Firebase, create them in the Firebase Console or use register.</div>
      </form>
    </div>
  )
}
