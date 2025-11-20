// Firestore-based signaling helper.
// Uses a subcollection 'signals' under rooms/{roomCode}
import { db } from '../firebase'
import { collection, addDoc, onSnapshot, doc, setDoc } from 'firebase/firestore'

export async function createRoom(roomCode, metadata={}) {
  if (!db) throw new Error('Firestore not initialized')
  const roomRef = doc(db, 'rooms', roomCode)
  await setDoc(roomRef, { createdAt: Date.now(), ...metadata })
  return roomRef
}

export async function sendSignal(roomCode, payload) {
  if (!db) throw new Error('Firestore not initialized')
  const col = collection(db, 'rooms', roomCode, 'signals')
  await addDoc(col, { payload, ts: Date.now() })
}

export function onSignals(roomCode, cb) {
  if (!db) throw new Error('Firestore not initialized')
  const col = collection(db, 'rooms', roomCode, 'signals')
  return onSnapshot(col, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') cb(change.doc.data().payload)
    })
  })
}
