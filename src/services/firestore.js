import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
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

function emptyWeeklyStats() {
  return {
    dogru: 0,
    yanlis: 0,
    oncekiHaftadanDogru: 0,
  }
}

function toLegacyDersKonuMap(payload) {
  if (payload?.TYT && payload?.AYT) {
    return payload
  }

  if (payload?.dersler && Array.isArray(payload.dersler)) {
    const mapped = { TYT: {}, AYT: {} }
    payload.dersler.forEach((item) => {
      const oturum = String(item?.oturum || '').trim().toUpperCase()
      const ders = item?.ders
      const konular = Array.isArray(item?.konular) ? item.konular : []

      if (!oturum || !ders) return
      if (!mapped[oturum]) {
        mapped[oturum] = {}
      }
      mapped[oturum][ders] = konular
    })
    return mapped
  }

  return { TYT: {}, AYT: {} }
}

export async function getDersKonuListesi() {
  const baseMapped = toLegacyDersKonuMap(baseDersKonu)

  if (!firebaseReady || !db) return baseMapped

  const docRef = doc(db, 'ders_konu_yonetim', 'liste')
  const snap = await getDoc(docRef)

  if (snap.exists()) {
    return toLegacyDersKonuMap(snap.data().liste)
  }

  try {
    await setDoc(docRef, {
      liste: baseDersKonu,
      createdAt: serverTimestamp(),
    })
  } catch {
    // Sadece koç yazabilir; öğrenci ilk açtığında yazma denemesi başarısız olursa sessizce geç
  }
  return baseMapped
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
  // Bileşik index gerektirmemesi için tek alanlı sorgu + JS'te filtre/sıralama
  const q = query(
    collection(db, 'sorular'),
    where('uid', '==', uid),
    limit(500),
  )

  const snap = await getDocs(q)
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => (item.tekrarHaftasi ?? 0) <= weekNo)
    .sort((a, b) => {
      const weekDiff = (a.tekrarHaftasi ?? 0) - (b.tekrarHaftasi ?? 0)
      if (weekDiff !== 0) return weekDiff
      return (a.tarih?.toMillis?.() || 0) - (b.tarih?.toMillis?.() || 0)
    })
}

export async function getStudentQuestions(uid) {
  ensureFirebase()
  const q = query(collection(db, 'sorular'), where('uid', '==', uid), limit(500))
  const snap = await getDocs(q)
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function markQuestionResult({ questionId, isCorrect, currentWeek }) {
  ensureFirebase()
  const ref = doc(db, 'sorular', questionId)
  await updateDoc(ref, {
    durum: isCorrect ? 'dogru' : 'yanlis',
    tekrarHaftasi: isCorrect ? currentWeek + 3 : currentWeek + 1,
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

export async function getCoachStudents() {
  ensureFirebase()

  // Bileşik index gerektirmemesi için tek alanlı sorgu + JS'te sıralama
  const studentsQuery = query(
    collection(db, 'users'),
    where('rol', '==', 'ogrenci'),
  )
  const studentsSnap = await getDocs(studentsQuery)

  const students = studentsSnap.docs.map((item) => {
    const row = item.data()
    return {
      uid: row.uid || item.id,
      ad: row.ad || 'Adsız Öğrenci',
      email: row.email || '',
    }
  })

  students.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
  return students
}

export async function getCoachDashboardData(weekNo, dayStart, dayEnd) {
  ensureFirebase()

  const studentsPromise = getCoachStudents()

  const todaysQuestionsPromise = getDocs(
    query(
      collection(db, 'sorular'),
      where('tarih', '>=', Timestamp.fromDate(dayStart)),
      where('tarih', '<=', Timestamp.fromDate(dayEnd)),
    ),
  )

  const weeklyResultsPromise = getDocs(
    query(
      collection(db, 'tekrar_sonuclari'),
      where('haftaNo', '==', weekNo),
    ),
  )

  const carryCorrectPromise = getDocs(
    query(
      collection(db, 'sorular'),
      where('sonTekrarHaftasi', '==', weekNo),
    ),
  )

  const [students, todaysQuestionsSnap, weeklyResultsSnap, carryCorrectSnap] = await Promise.all([
    studentsPromise,
    todaysQuestionsPromise,
    weeklyResultsPromise,
    carryCorrectPromise,
  ])

  const studentMap = {}
  students.forEach((student) => {
    studentMap[student.uid] = {
      student,
      todaysQuestionCount: 0,
      dailyByTopicMap: {},
      weeklyStats: emptyWeeklyStats(),
    }
  })

  todaysQuestionsSnap.docs.forEach((docItem) => {
    const row = docItem.data()
    const uid = row.uid
    if (!uid || !studentMap[uid]) return

    studentMap[uid].todaysQuestionCount += 1

    const topicKey = `${row.ders || 'Bilinmeyen Ders'}__${row.konu || 'Bilinmeyen Konu'}`
    studentMap[uid].dailyByTopicMap[topicKey] = (studentMap[uid].dailyByTopicMap[topicKey] || 0) + 1
  })

  weeklyResultsSnap.docs.forEach((docItem) => {
    const row = docItem.data()
    const uid = row.uid
    if (!uid || !studentMap[uid]) return

    studentMap[uid].weeklyStats.dogru += row.dogruSayisi || 0
    studentMap[uid].weeklyStats.yanlis += row.yanlisSayisi || 0
  })

  carryCorrectSnap.docs.forEach((docItem) => {
    const row = docItem.data()
    if (row.durum !== 'dogru') return
    const uid = row.uid
    if (!uid || !studentMap[uid]) return

    if ((row.haftaNo || weekNo) < weekNo) {
      studentMap[uid].weeklyStats.oncekiHaftadanDogru += 1
    }
  })

  const overview = students.map((student) => {
    const row = studentMap[student.uid]
    return {
      uid: student.uid,
      ad: student.ad,
      email: student.email,
      bugunYuklenenSoru: row?.todaysQuestionCount || 0,
      haftalikDogru: row?.weeklyStats?.dogru || 0,
      haftalikYanlis: row?.weeklyStats?.yanlis || 0,
    }
  })

  const studentDetails = students.reduce((acc, student) => {
    const row = studentMap[student.uid]
    const dailySummary = Object.entries(row?.dailyByTopicMap || {}).map(([key, adet]) => {
      const [ders, konu] = key.split('__')
      return { ders, konu, adet }
    })

    dailySummary.sort((a, b) => b.adet - a.adet || a.ders.localeCompare(b.ders, 'tr'))

    acc[student.uid] = {
      student,
      dailySummary,
      weeklyStats: row?.weeklyStats || emptyWeeklyStats(),
      todaysQuestionCount: row?.todaysQuestionCount || 0,
    }
    return acc
  }, {})

  return {
    students,
    overview,
    studentDetails,
  }
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
  )

  const carrySnap = await getDocs(carryQ)
  let oncekiHaftadanDogru = 0
  carrySnap.docs.forEach((item) => {
    const row = item.data()
    if (row.durum !== 'dogru') return
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
