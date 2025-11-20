import React, { useState } from 'react'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'

export default function App() {
  const [user, setUser] = useState(null)

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gradient-to-r from-indigo-600 to-sky-500 text-white p-4 shadow-lg">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-indigo-600 font-bold">IM</div>
            <h1 className="text-xl font-bold tracking-tight">Interview MVP</h1>
          </div>
          <nav className="space-x-4 text-sm opacity-90">
            <a href="#" className="hover:underline">About</a>
            <a href="#" className="hover:underline">FAQs</a>
            <a href="#" className="hover:underline">Contact</a>
          </nav>
        </div>
      </header>

      <main className="flex-1 container mx-auto p-6">
        {!user ? (
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
            <Login onLogin={setUser} />
            <Register onRegister={setUser} />
          </div>
        ) : (
          <Dashboard user={user} onLogout={() => setUser(null)} />
        )}
      </main>

      <footer className="bg-slate-900 text-slate-300 p-4">
        <div className="container mx-auto text-sm flex justify-between">
          <div>© {new Date().getFullYear()} Interview MVP</div>
          <div>Contact us: demo@example.com</div>
        </div>
      </footer>
    </div>
  )
}
