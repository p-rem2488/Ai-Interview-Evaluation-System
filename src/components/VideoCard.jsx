import React from 'react'

export default function VideoCard({ title, streamRef, muted=false }) {
  return (
    <div className="bg-white rounded-2xl shadow p-3">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="bg-black rounded-lg overflow-hidden" style={{ height: 360 }}>
        <video ref={streamRef} autoPlay playsInline muted={muted} className="w-full h-full object-cover bg-black" />
      </div>
    </div>
  )
}
