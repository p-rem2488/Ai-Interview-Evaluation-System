import React, { useState } from 'react'
import InterviewRoom from '../components/InterviewRoom'

export default function Dashboard({ user, onLogout }) {
  const [roomId, setRoomId] = useState('')
  const [inRoom, setInRoom] = useState(false)
  const [role, setRole] = useState(user?.role || 'candidate')

  const createRoom = () => {
    const code = Math.random().toString(36).substring(2, 7).toUpperCase()
    setRoomId(code)
    setInRoom(true)
    setRole('interviewer')
  }

  const joinRoom = () => {
    if (!roomId) return alert('Enter room code to join')
    setInRoom(true)
    setRole('candidate')
  }

  if (inRoom) {
    return <InterviewRoom roomId={roomId} role={role} onLeave={() => { setInRoom(false); setRoomId('') }} />
  }

  return (
    <div className="max-w-5xl mx-auto grid gap-6">
      <div className="bg-white p-6 rounded-2xl shadow">
        <h2 className="text-xl font-semibold mb-4">Welcome, {user.displayName || user.email}</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm">Create Room (Interviewer)</label>
            <div className="flex gap-2 mt-2">
              <button onClick={createRoom} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Create Room</button>
            </div>
          </div>

          <div>
            <label className="text-sm">Join Room (Candidate)</label>
            <div className="flex gap-2 mt-2">
              <input placeholder="Room code e.g. ABC12" value={roomId} onChange={e=>setRoomId(e.target.value.toUpperCase())} className="p-2 border rounded" />
              <button onClick={joinRoom} className="px-4 py-2 bg-emerald-600 text-white rounded-lg">Join Room</button>
            </div>
          </div>

          <div className="pt-4">
            <button onClick={onLogout} className="px-4 py-2 bg-red-600 text-white rounded-lg">Logout</button>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow">
        <h3 className="font-semibold">How it works</h3>
        <ol className="list-decimal list-inside text-sm mt-2 space-y-1 text-slate-600">
          <li>Interviewer creates a room and shares the room code.</li>
          <li>Candidate joins using the room code.</li>
          <li>Video call starts; candidate monitoring runs in-browser and alerts appear.</li>
        </ol>
      </div>
    </div>
  )
}
