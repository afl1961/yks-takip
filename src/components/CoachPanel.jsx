import { useEffect, useMemo, useState } from 'react'
import {
  getCoachDailySummary,
  getCoachWeeklyStats,
  getDersKonuListesi,
  saveDersKonuListesi,
} from '../services/firestore'
import { getWeekNumber } from '../lib/week'

function CoachPanel({ firebaseReady }) {
  const [dailySummary, setDailySummary] = useState([])
  const [weeklyStats, setWeeklyStats] = useState({ dogru: 0, yanlis: 0, oncekiHaftadanDogru: 0 })
  const [liste, setListe] = useState({ TYT: {}, AYT: {} })
  const [editState, setEditState] = useState({ oturum: 'TYT', ders: '', konu: '' })
  const [message, setMessage] = useState('')

  const currentWeek = getWeekNumber(new Date())

  useEffect(() => {
    const load = async () => {
      try {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const end = new Date()
        end.setHours(23, 59, 59, 999)

        const [daily, weekly, dersKonu] = await Promise.all([
          getCoachDailySummary(start, end),
          getCoachWeeklyStats(currentWeek),
          getDersKonuListesi(),
        ])

        setDailySummary(daily)
        setWeeklyStats(weekly)
        setListe(dersKonu)
      } catch (err) {
        setMessage(err.message)
      }
    }

    load()
  }, [currentWeek])

  const dersList = useMemo(
    () => Object.keys(liste?.[editState.oturum] || {}),
    [liste, editState.oturum],
  )

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
        <h2>Günlük Özet</h2>
        <p className="muted">Koç paneli sadece sayı ve istatistik gösterir.</p>

        {dailySummary.length === 0 ? (
          <p>Bugün henüz soru yüklenmedi.</p>
        ) : (
          <ul className="list">
            {dailySummary.map((row) => (
              <li key={`${row.ders}-${row.konu}`}>
                <strong>{row.ders}</strong> / {row.konu}: {row.adet} soru
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Haftalık Tekrar İstatistikleri (Hafta {currentWeek})</h2>
        <div className="stats-grid">
          <div className="stat">
            <span>Doğru</span>
            <strong>{weeklyStats.dogru}</strong>
          </div>
          <div className="stat">
            <span>Yanlış</span>
            <strong>{weeklyStats.yanlis}</strong>
          </div>
          <div className="stat">
            <span>Önceki haftadan bu hafta doğru</span>
            <strong>{weeklyStats.oncekiHaftadanDogru}</strong>
          </div>
        </div>
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
