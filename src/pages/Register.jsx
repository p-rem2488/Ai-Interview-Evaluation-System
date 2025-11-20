import React, { useState } from 'react'
import { auth } from '../firebase'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'

export default function Register({ onRegister }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('candidate')
  const [error, setError] = useState('')

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (!auth) {
        onRegister({ email, displayName: name || email.split('@')[0], role })
        return
      }
      const uc = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(uc.user, { displayName: name })
      onRegister({ uid: uc.user.uid, email: uc.user.email, displayName: name, role })
    } catch (err) {
      setError(err.message || 'Register failed')
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Register</h2>
      <form onSubmit={handleRegister} className="space-y-3">
        <input required value={name} onChange={e=>setName(e.target.value)} placeholder="Full name" className="w-full p-3 border rounded-lg" />
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
        <button className="w-full bg-sky-600 text-white py-3 rounded-lg font-medium">Create account</button>
        <div className="text-xs text-slate-500 pt-2">Tip: Enable Email/Password auth in Firebase console to use real auth.</div>
      </form>
    </div>
  )
}
