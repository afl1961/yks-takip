import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { auth, db, firebaseReady } from '../firebase'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'

export function listenAuthState(callback) {
  if (!firebaseReady || !auth) {
    callback(null)
    return () => {}
  }
  return onAuthStateChanged(auth, callback)
}

export async function registerWithRole({ email, password, name, role }) {
  if (!firebaseReady) throw new Error('Firebase bağlantısı kurulmadı')
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  await setDoc(doc(db, 'users', cred.user.uid), {
    uid: cred.user.uid,
    rol: role,
    ad: name,
    email,
    createdAt: serverTimestamp(),
  })
  return cred.user
}

export async function login({ email, password }) {
  if (!firebaseReady) throw new Error('Firebase bağlantısı kurulmadı')
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

export async function logout() {
  if (!firebaseReady) return
  await signOut(auth)
}

export async function getUserProfile(uid) {
  if (!firebaseReady) return null
  const ref = doc(db, 'users', uid)
  const snapshot = await getDoc(ref)
  return snapshot.exists() ? snapshot.data() : null
}
