import React from 'react'

export default function MonitoringPanel({ status }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-3">
      <h3 className="text-md font-semibold">Monitoring</h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="p-2 border rounded">
          <div className="text-xs text-slate-500">Face present</div>
          <div className={status.facePresent ? 'text-green-600 font-medium' : 'text-red-500'}>{String(status.facePresent)}</div>
        </div>
        <div className="p-2 border rounded">
          <div className="text-xs text-slate-500">Multiple faces</div>
          <div className={status.multipleFaces ? 'text-red-600 font-medium' : 'text-green-600'}>{String(status.multipleFaces)}</div>
        </div>
        <div className="p-2 border rounded">
          <div className="text-xs text-slate-500">Eyes closed</div>
          <div className={status.eyesClosed ? 'text-red-600 font-medium' : 'text-green-600'}>{String(status.eyesClosed)}</div>
        </div>
        <div className="p-2 border rounded">
          <div className="text-xs text-slate-500">Phone detected</div>
          <div className={status.phoneDetected ? 'text-red-600 font-medium' : 'text-green-600'}>{String(status.phoneDetected)}</div>
        </div>
      </div>

      <div>
        <div className="text-xs text-slate-500">Live transcript</div>
        <div className="h-28 overflow-auto p-2 bg-slate-50 border rounded text-sm">{status.transcript || '-'}</div>
      </div>

      <div>
        <div className="text-xs text-slate-500">Speaking score</div>
        <div className="mt-1">
          <div className="w-full h-4 bg-slate-200 rounded">
            <div className="h-4 rounded bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, status.score || 0))}%` }} />
          </div>
          <div className="text-xs text-slate-600 mt-1">{Math.round(status.score||0)} / 100</div>
        </div>
      </div>
    </div>
  )
}
