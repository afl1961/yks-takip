import { useEffect, useMemo, useState } from 'react'
import {
  getCoachDashboardData,
  getDersKonuListesi,
  saveDersKonuListesi,
} from '../services/firestore'
import { getWeekNumber } from '../lib/week'

const SELECTED_STUDENT_KEY = 'coachSelectedStudentUid'

function CoachPanel({ firebaseReady }) {
  const [students, setStudents] = useState([])
  const [selectedStudentUid, setSelectedStudentUid] = useState('')
  const [dashboard, setDashboard] = useState({ overview: [], studentDetails: {} })
  const [liste, setListe] = useState({ TYT: {}, AYT: {} })
  const [editState, setEditState] = useState({ oturum: 'TYT', ders: '', konu: '' })
  const [message, setMessage] = useState('')

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
