import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import baseDersKonu from '../ders_konu_listesi.json'
import { getWeekNumber } from '../lib/week'

function ensureFirebase() {
  if (!firebaseReady || !db) {
    throw new Error('Firebase bağlantısı kurulmadı')
  }
}

export async function getDersKonuListesi() {
  if (!firebaseReady || !db) return baseDersKonu

  const docRef = doc(db, 'ders_konu_yonetim', 'liste')
  const snap = await getDoc(docRef)

  if (snap.exists()) {
    return snap.data().liste
  }

  await setDoc(docRef, {
    liste: baseDersKonu,
    createdAt: serverTimestamp(),
  })
  return baseDersKonu
}

export async function saveDersKonuListesi(liste) {
  ensureFirebase()
  const docRef = doc(db, 'ders_konu_yonetim', 'liste')
  await setDoc(
    docRef,
    {
      liste,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function addQuestionMeta({ uid, ders, konu, medyaId }) {
  ensureFirebase()
  const now = new Date()
  const haftaNo = getWeekNumber(now)

  await addDoc(collection(db, 'sorular'), {
    uid,
    ders,
    konu,
    tarih: Timestamp.fromDate(now),
    haftaNo,
    medyaId,
    durum: 'bekliyor',
    tekrarHaftasi: haftaNo,
    createdAt: serverTimestamp(),
  })
}

export async function getStudentWeeklyQuestions(uid, weekNo) {
  ensureFirebase()
  const q = query(
    collection(db, 'sorular'),
    where('uid', '==', uid),
    where('tekrarHaftasi', '<=', weekNo),
    orderBy('tekrarHaftasi', 'asc'),
    orderBy('tarih', 'asc'),
    limit(500),
  )

  const snap = await getDocs(q)
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function markQuestionResult({ questionId, isCorrect, currentWeek }) {
  ensureFirebase()
  const ref = doc(db, 'sorular', questionId)
  await updateDoc(ref, {
    durum: isCorrect ? 'dogru' : 'yanlis',
    tekrarHaftasi: isCorrect ? currentWeek : currentWeek + 1,
    sonTekrarHaftasi: currentWeek,
    updatedAt: serverTimestamp(),
  })
}

export async function saveWeeklyResult({ uid, haftaNo, dogruSayisi, yanlisSayisi, kalanSoruSayisi }) {
  ensureFirebase()
  await addDoc(collection(db, 'tekrar_sonuclari'), {
    uid,
    haftaNo,
    dogruSayisi,
    yanlisSayisi,
    kalanSoruSayisi,
    tarih: Timestamp.fromDate(new Date()),
    createdAt: serverTimestamp(),
  })
}

export async function getCoachDailySummary(dayStart, dayEnd) {
  ensureFirebase()
  const q = query(
    collection(db, 'sorular'),
    where('tarih', '>=', Timestamp.fromDate(dayStart)),
    where('tarih', '<=', Timestamp.fromDate(dayEnd)),
  )
  const snap = await getDocs(q)
  const summary = {}

  snap.docs.forEach((item) => {
    const row = item.data()
    const key = `${row.ders}__${row.konu}`
    summary[key] = (summary[key] || 0) + 1
  })

  return Object.entries(summary).map(([key, adet]) => {
    const [ders, konu] = key.split('__')
    return { ders, konu, adet }
  })
}

export async function getCoachWeeklyStats(weekNo) {
  ensureFirebase()
  const resultQ = query(
    collection(db, 'tekrar_sonuclari'),
    where('haftaNo', '==', weekNo),
  )
  const resultSnap = await getDocs(resultQ)

  let dogru = 0
  let yanlis = 0
  resultSnap.docs.forEach((item) => {
    const row = item.data()
    dogru += row.dogruSayisi || 0
    yanlis += row.yanlisSayisi || 0
  })

  const carryQ = query(
    collection(db, 'sorular'),
    where('sonTekrarHaftasi', '==', weekNo),
    where('durum', '==', 'dogru'),
  )

  const carrySnap = await getDocs(carryQ)
  let oncekiHaftadanDogru = 0
  carrySnap.docs.forEach((item) => {
    const row = item.data()
    if ((row.haftaNo || weekNo) < weekNo) {
      oncekiHaftadanDogru += 1
    }
  })

  return {
    dogru,
    yanlis,
    oncekiHaftadanDogru,
  }
}
