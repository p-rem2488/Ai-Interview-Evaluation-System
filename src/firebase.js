// src/firebase.js
// Firebase config provided by user (baked into this build)
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyAmFHywT73BxDTh07vdWxv6cnRht8whtq0",
  authDomain: "chat-f3713.firebaseapp.com",
  projectId: "chat-f3713",
  storageBucket: "chat-f3713.firebasestorage.app",
  messagingSenderId: "652361597425",
  appId: "1:652361597425:web:9543be8df5218dd31bc450",
  measurementId: "G-P1S5TQ385P"
};

let app = null;
let auth = null;
let db = null;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  console.log('Firebase initialized');
} catch (e) {
  console.error("Firebase init error:", e);
}

export { app, auth, db };
