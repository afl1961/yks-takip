import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getCoachDashboardData,
  getDersKonuListesi,
  getStudentQuestionHistory,
  saveDersKonuListesi,
} from '../services/firestore'
import { getWeekNumber } from '../lib/week'

const SELECTED_STUDENT_KEY = 'coachSelectedStudentUid'
const DAYS_PER_PAGE = 10

// Tarihi yerel saatle YYYY-MM-DD anahtarına çevirir (gün gruplaması için)
function dayKey(tarih) {
  const d = tarih?.toDate ? tarih.toDate() : new Date(tarih)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const g = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${g}`
}

// Gün etiketi: son 7 gün içindeyse haftanın günü de yazılır, tarih "gün ay yıl" biçiminde
function dayLabel(key) {
  const [y, m, g] = key.split('-').map(Number)
  const date = new Date(y, m - 1, g)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((todayStart - date) / 86400000)
  const withinWeek = diffDays >= 0 && diffDays <= 6

  const opts = withinWeek
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { day: 'numeric', month: 'long', year: 'numeric' }
  return date.toLocaleDateString('tr-TR', opts)
}

function timeLabel(tarih) {
  const d = tarih?.toDate ? tarih.toDate() : new Date(tarih)
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

function CoachPanel({ firebaseReady }) {
  const [students, setStudents] = useState([])
  const [selectedStudentUid, setSelectedStudentUid] = useState('')
  const [dashboard, setDashboard] = useState({ overview: [], studentDetails: {} })
  const [liste, setListe] = useState({ TYT: {}, AYT: {} })
  const [editState, setEditState] = useState({ oturum: 'TYT', ders: '', konu: '' })
  const [message, setMessage] = useState('')

  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [visibleDayCount, setVisibleDayCount] = useState(DAYS_PER_PAGE)
  const sentinelRef = useRef(null)

  const currentWeek = getWeekNumber(new Date())

  useEffect(() => {
    const saved = localStorage.getItem(SELECTED_STUDENT_KEY)
    if (saved) {
      setSelectedStudentUid(saved)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const end = new Date()
        end.setHours(23, 59, 59, 999)

        const [dashboardData, dersKonu] = await Promise.all([
          getCoachDashboardData(currentWeek, start, end),
          getDersKonuListesi(),
        ])

        setStudents(dashboardData.students)
        setDashboard({
          overview: dashboardData.overview,
          studentDetails: dashboardData.studentDetails,
        })
        setListe(dersKonu)

        if (dashboardData.students.length > 0) {
          const selectedExists = dashboardData.students.some((item) => item.uid === selectedStudentUid)
          const nextUid = selectedExists ? selectedStudentUid : dashboardData.students[0].uid
          setSelectedStudentUid(nextUid)
          localStorage.setItem(SELECTED_STUDENT_KEY, nextUid)
        } else {
          setSelectedStudentUid('')
          localStorage.removeItem(SELECTED_STUDENT_KEY)
        }
      } catch (err) {
        setMessage(err.message)
      }
    }

    load()
  }, [currentWeek, selectedStudentUid])

  const selectedStudentDetail = dashboard.studentDetails[selectedStudentUid] || null

  // Seçili öğrencinin tüm soru geçmişini yükle
  useEffect(() => {
    let cancelled = false
    const loadHistory = async () => {
      if (!firebaseReady || !selectedStudentUid) {
        setHistory([])
        return
      }
      setHistoryLoading(true)
      try {
        const data = await getStudentQuestionHistory(selectedStudentUid)
        if (!cancelled) {
          setHistory(data)
          setVisibleDayCount(DAYS_PER_PAGE)
        }
      } catch (err) {
        if (!cancelled) setMessage(err.message)
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    }
    loadHistory()
    return () => {
      cancelled = true
    }
  }, [firebaseReady, selectedStudentUid])

  // Günlere göre grupla (yeniden eskiye)
  const dayGroups = useMemo(() => {
    const map = {}
    history.forEach((q) => {
      const key = dayKey(q.tarih)
      if (!map[key]) map[key] = []
      map[key].push(q)
    })
    return Object.keys(map)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => ({ key, questions: map[key] }))
  }, [history])

  const visibleDays = dayGroups.slice(0, visibleDayCount)
  const hasMoreDays = visibleDayCount < dayGroups.length

  // Liste sonuna gelince 10 gün daha göster (sonsuz kaydırma)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMoreDays) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleDayCount((prev) => prev + DAYS_PER_PAGE)
        }
      },
      { rootMargin: '300px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMoreDays, dayGroups.length])

  const dersList = useMemo(
    () => Object.keys(liste?.[editState.oturum] || {}),
    [liste, editState.oturum],
  )

  const handleStudentSelect = (uid) => {
    setSelectedStudentUid(uid)
    localStorage.setItem(SELECTED_STUDENT_KEY, uid)
  }

  const addTopic = async () => {
    if (!firebaseReady) {
      setMessage('Firebase bağlantısı kurulmadı.')
      return
    }
    if (!editState.ders || !editState.konu.trim()) return

    const next = structuredClone(liste)
    const arr = next[editState.oturum][editState.ders] || []
    if (!arr.includes(editState.konu.trim())) {
      next[editState.oturum][editState.ders] = [...arr, editState.konu.trim()]
      await saveDersKonuListesi(next)
      setListe(next)
      setEditState((prev) => ({ ...prev, konu: '' }))
      setMessage('Konu eklendi.')
    }
  }

  const removeTopic = async (oturum, ders, konu) => {
    if (!firebaseReady) {
      setMessage('Firebase bağlantısı kurulmadı.')
      return
    }
    const next = structuredClone(liste)
    next[oturum][ders] = (next[oturum][ders] || []).filter((item) => item !== konu)
    await saveDersKonuListesi(next)
    setListe(next)
    setMessage('Konu kaldırıldı.')
  }

  const addLesson = async () => {
    if (!firebaseReady) {
      setMessage('Firebase bağlantısı kurulmadı.')
      return
    }

    const lessonName = prompt('Yeni ders adı:')
    if (!lessonName) return

    const trimmed = lessonName.trim()
    const next = structuredClone(liste)
    next[editState.oturum][trimmed] = next[editState.oturum][trimmed] || []
    await saveDersKonuListesi(next)
    setListe(next)
    setMessage('Ders eklendi.')
  }

  return (
    <div className="stack gap-lg">
      <section className="card">
        <h2>Genel Bakış (Tüm Öğrenciler)</h2>
        <p className="muted">Koç paneli sadece sayı ve istatistik gösterir, soru fotoğraflarını göstermez.</p>

        {dashboard.overview.length === 0 ? (
          <p>Kayıtlı öğrenci bulunamadı.</p>
        ) : (
          <div className="table-wrap">
            <table className="overview-table">
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Bugün Yüklenen</th>
                  <th>Bu Hafta Doğru</th>
                  <th>Bu Hafta Yanlış</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.overview.map((row) => (
                  <tr key={row.uid}>
                    <td>{row.ad}</td>
                    <td>{row.bugunYuklenenSoru}</td>
                    <td>{row.haftalikDogru}</td>
                    <td>{row.haftalikYanlis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Öğrenci Seçimi</h2>
        <div className="student-grid">
          {students.map((student) => (
            <button
              key={student.uid}
              className={`student-card ${selectedStudentUid === student.uid ? 'active' : ''}`}
              onClick={() => handleStudentSelect(student.uid)}
              type="button"
            >
              <strong>{student.ad}</strong>
              {student.email && <span>{student.email}</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Seçili Öğrenci Detayı</h2>
        {!selectedStudentDetail ? (
          <p>Detay görmek için öğrenci seçin.</p>
        ) : (
          <div className="stack">
            <h3>{selectedStudentDetail.student.ad}</h3>

            <div className="stats-grid">
              <div className="stat">
                <span>Bugün yüklenen soru</span>
                <strong>{selectedStudentDetail.todaysQuestionCount}</strong>
              </div>
              <div className="stat">
                <span>Haftalık doğru</span>
                <strong>{selectedStudentDetail.weeklyStats.dogru}</strong>
              </div>
              <div className="stat">
                <span>Haftalık yanlış</span>
                <strong>{selectedStudentDetail.weeklyStats.yanlis}</strong>
              </div>
              <div className="stat">
                <span>Önceki haftadan bu hafta doğru</span>
                <strong>{selectedStudentDetail.weeklyStats.oncekiHaftadanDogru}</strong>
              </div>
            </div>

            <h3>Bugünkü Ders/Konu Özeti</h3>
            {selectedStudentDetail.dailySummary.length === 0 ? (
              <p>Bu öğrenci bugün soru yüklemedi.</p>
            ) : (
              <ul className="list">
                {selectedStudentDetail.dailySummary.map((row) => (
                  <li key={`${row.ders}-${row.konu}`}>
                    <strong>{row.ders}</strong> / {row.konu}: {row.adet} soru
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Günlük Soru Geçmişi</h2>
        <p className="muted">
          Seçili öğrencinin gün gün yüklediği tüm sorular. Son 10 gün gösterilir, listeyi
          aşağı kaydırdıkça daha eski günler de yüklenir.
        </p>

        {!selectedStudentUid ? (
          <p>Geçmiş görmek için öğrenci seçin.</p>
        ) : historyLoading ? (
          <p className="history-loading">Yükleniyor...</p>
        ) : dayGroups.length === 0 ? (
          <p>Bu öğrenci henüz soru yüklemedi.</p>
        ) : (
          <div className="stack">
            {visibleDays.map((group) => (
              <div key={group.key} className="day-group">
                <div className="day-group-head">
                  <strong>{dayLabel(group.key)}</strong>
                  <span className="day-count">
                    {group.questions.length} soru
                  </span>
                </div>
                <ul className="day-question-list">
                  {group.questions.map((q) => (
                    <li key={q.id} className="day-question">
                      <span>
                        <strong>{q.ders}</strong> / {q.konu}
                      </span>
                      <span className="day-question-time">{timeLabel(q.tarih)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {hasMoreDays && <div ref={sentinelRef} className="history-loading">Daha eski günler yükleniyor...</div>}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Ders/Konu Yönetimi</h2>
        <p className="muted">Başlangıç listesi JSON'dan gelir, değişiklikler Firestore'a kaydedilir.</p>

        <div className="button-row">
          <select
            value={editState.oturum}
            onChange={(e) => setEditState((prev) => ({ ...prev, oturum: e.target.value }))}
          >
            <option value="TYT">TYT</option>
            <option value="AYT">AYT</option>
          </select>
          <button className="secondary" onClick={addLesson}>
            Ders Ekle
          </button>
        </div>

        <label>
          Ders
          <select
            value={editState.ders}
            onChange={(e) => setEditState((prev) => ({ ...prev, ders: e.target.value }))}
          >
            <option value="">Ders seçin</option>
            {dersList.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <div className="button-row">
          <input
            type="text"
            placeholder="Yeni konu"
            value={editState.konu}
            onChange={(e) => setEditState((prev) => ({ ...prev, konu: e.target.value }))}
          />
          <button onClick={addTopic}>Konu Ekle</button>
        </div>

        {editState.ders && (
          <ul className="list">
            {(liste?.[editState.oturum]?.[editState.ders] || []).map((konu) => (
              <li key={konu} className="list-row">
                <span>{konu}</span>
                <button className="danger" onClick={() => removeTopic(editState.oturum, editState.ders, konu)}>
                  Kaldır
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message && <div className="warning-box">{message}</div>}
    </div>
  )
}

export default CoachPanel
