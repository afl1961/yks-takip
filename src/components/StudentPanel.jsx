import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addQuestionMeta,
  getDersKonuListesi,
  getStudentQuestions,
  getStudentWeeklyQuestions,
  markQuestionResult,
  saveWeeklyResult,
} from '../services/firestore'
import { getMediaById, saveMedia } from '../lib/indexedDb'
import { getWeekNumber, isWeekend } from '../lib/week'

function shuffleArray(arr) {
  const clone = [...arr]
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[clone[i], clone[j]] = [clone[j], clone[i]]
  }
  return clone
}

function StudentPanel({ user, firebaseReady }) {
  const [liste, setListe] = useState({ TYT: {}, AYT: {} })
  const [oturum, setOturum] = useState('TYT')
  const [ders, setDers] = useState('')
  const [konu, setKonu] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [recording, setRecording] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const [repeatQuestions, setRepeatQuestions] = useState([])
  const [repeatIndex, setRepeatIndex] = useState(0)
  const [repeatStarted, setRepeatStarted] = useState(false)
  const [revealMeta, setRevealMeta] = useState(false)
  const [repeatSummary, setRepeatSummary] = useState(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)

  const [myQuestions, setMyQuestions] = useState([])
  const [loadingQuestions, setLoadingQuestions] = useState(false)

  const mediaRecorderRef = useRef(null)
  const mediaChunksRef = useRef([])

  const loadMyQuestions = async () => {
    if (!firebaseReady || !user?.uid) return
    setLoadingQuestions(true)
    try {
      const questions = await getStudentQuestions(user.uid)
      const withMedia = await Promise.all(
        questions.map(async (q) => {
          const media = await getMediaById(q.medyaId)
          return {
            ...q,
            imageUrl: media?.imageBlob ? URL.createObjectURL(media.imageBlob) : null,
            audioUrl: media?.audioBlob ? URL.createObjectURL(media.audioBlob) : null,
          }
        }),
      )
      withMedia.sort(
        (a, b) => (b.tarih?.toMillis?.() || 0) - (a.tarih?.toMillis?.() || 0),
      )
      setMyQuestions(withMedia)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoadingQuestions(false)
    }
  }

  useEffect(() => {
    loadMyQuestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseReady, user?.uid])

  useEffect(() => {
    const fetchList = async () => {
      try {
        const data = await getDersKonuListesi()
        setListe(data)
      } catch (err) {
        setMessage(err.message)
      }
    }
    fetchList()
  }, [])

  const dersler = useMemo(() => Object.keys(liste?.[oturum] || {}), [liste, oturum])
  const konular = useMemo(() => liste?.[oturum]?.[ders] || [], [liste, oturum, ders])

  useEffect(() => {
    if (!dersler.includes(ders)) {
      setDers(dersler[0] || '')
    }
  }, [dersler, ders])

  useEffect(() => {
    if (!konular.includes(konu)) {
      setKonu(konular[0] || '')
    }
  }, [konular, konu])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      mediaChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          mediaChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(mediaChunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach((track) => track.stop())
      }

      recorder.start()
      setRecording(true)
    } catch {
      setMessage('Mikrofon izni alınamadı.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop()
      setRecording(false)
    }
  }

  const handleQuestionUpload = async (event) => {
    event.preventDefault()

    if (!firebaseReady) {
      setMessage('Firebase bağlantısı kurulmadı.')
      return
    }

    if (!imageFile) {
      setMessage('Lütfen soru fotoğrafı ekleyin.')
      return
    }

    setBusy(true)
    setMessage('')

    try {
      const mediaId = await saveMedia({ imageBlob: imageFile, audioBlob })
      await addQuestionMeta({
        uid: user.uid,
        ders,
        konu,
        medyaId: mediaId,
      })

      setImageFile(null)
      setAudioBlob(null)
      setAudioUrl('')
      setMessage('Soru başarıyla kaydedildi.')
      loadMyQuestions()
    } catch (err) {
      setMessage(err.message || 'Soru kaydedilirken hata oluştu.')
    } finally {
      setBusy(false)
    }
  }

  const loadWeekendRepeat = async () => {
    if (!firebaseReady) {
      setMessage('Firebase bağlantısı kurulmadı.')
      return
    }

    if (!isWeekend(new Date())) {
      setMessage('Haftalık tekrar sadece Cumartesi/Pazar günleri açılır.')
      return
    }

    try {
      const weekNo = getWeekNumber(new Date())
      const questions = await getStudentWeeklyQuestions(user.uid, weekNo)
      const withMedia = await Promise.all(
        questions.map(async (q) => {
          const media = await getMediaById(q.medyaId)
          const imageUrl = media?.imageBlob ? URL.createObjectURL(media.imageBlob) : null
          return { ...q, imageUrl }
        }),
      )

      setRepeatQuestions(shuffleArray(withMedia))
      setRepeatIndex(0)
      setCorrectCount(0)
      setWrongCount(0)
      setRevealMeta(false)
      setRepeatSummary(null)
      setRepeatStarted(true)
    } catch (err) {
      setMessage(err.message)
    }
  }

  const finishRepeat = async (finalCorrect, finalWrong) => {
    const weekNo = getWeekNumber(new Date())
    try {
      await saveWeeklyResult({
        uid: user.uid,
        haftaNo: weekNo,
        dogruSayisi: finalCorrect,
        yanlisSayisi: finalWrong,
        kalanSoruSayisi: finalWrong,
      })
    } catch {
      // kayıt hatası kullanıcı deneyimini bozmasın
    }

    setRepeatSummary({ dogru: finalCorrect, yanlis: finalWrong })
    setRepeatStarted(false)
  }

  const handleRepeatAnswer = async (isCorrectAnswer) => {
    const current = repeatQuestions[repeatIndex]
    if (!current) return

    const weekNo = getWeekNumber(new Date())

    try {
      await markQuestionResult({
        questionId: current.id,
        isCorrect: isCorrectAnswer,
        currentWeek: weekNo,
      })

      const nextCorrect = correctCount + (isCorrectAnswer ? 1 : 0)
      const nextWrong = wrongCount + (isCorrectAnswer ? 0 : 1)

      setCorrectCount(nextCorrect)
      setWrongCount(nextWrong)
      setRevealMeta(true)

      setTimeout(() => {
        const isLast = repeatIndex >= repeatQuestions.length - 1
        if (isLast) {
          finishRepeat(nextCorrect, nextWrong)
        } else {
          setRepeatIndex((prev) => prev + 1)
          setRevealMeta(false)
        }
      }, 650)
    } catch (err) {
      setMessage(err.message)
    }
  }

  const currentQuestion = repeatQuestions[repeatIndex]

  return (
    <div className="stack gap-lg">
      <section className="card">
        <h2>Soru Yükleme</h2>
        <p className="muted">Yanlış yaptığın soruyu fotoğraf ve ses kaydıyla kaydet.</p>

        <form onSubmit={handleQuestionUpload} className="stack">
          <label>
            Oturum
            <select value={oturum} onChange={(e) => setOturum(e.target.value)}>
              <option value="TYT">TYT</option>
              <option value="AYT">AYT</option>
            </select>
          </label>

          <label>
            Ders
            <select value={ders} onChange={(e) => setDers(e.target.value)} required>
              {dersler.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            Konu
            <select value={konu} onChange={(e) => setKonu(e.target.value)} required>
              {konular.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            Soru Fotoğrafı
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              required
            />
          </label>

          <div className="stack">
            <span>Ses Kaydı (opsiyonel)</span>
            {!recording ? (
              <button type="button" className="secondary" onClick={startRecording}>
                🎤 Kaydı Başlat
              </button>
            ) : (
              <button type="button" className="danger" onClick={stopRecording}>
                ⏹️ Kaydı Durdur
              </button>
            )}
            {audioUrl && <audio controls src={audioUrl} />}
          </div>

          <button type="submit" disabled={busy}>
            {busy ? 'Kaydediliyor...' : 'Soruyu Kaydet'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Sorularım</h2>
        <p className="muted">Yüklediğin tüm sorular burada listelenir; fotoğraf ve ses kaydını istediğin zaman görüntüleyebilirsin.</p>

        {loadingQuestions ? (
          <p>Yükleniyor...</p>
        ) : myQuestions.length === 0 ? (
          <p>Henüz soru yüklemedin.</p>
        ) : (
          <ul className="question-list">
            {myQuestions.map((q) => (
              <li key={q.id} className="question-item">
                <div className="question-item-head">
                  <strong>{q.ders}</strong> / {q.konu}
                  <span className="muted">
                    {q.tarih
                      ? new Date(q.tarih.toMillis()).toLocaleDateString('tr-TR')
                      : ''}
                  </span>
                </div>
                {q.imageUrl ? (
                  <img className="question-image" src={q.imageUrl} alt="Soru görseli" />
                ) : (
                  <div className="warning-box">Fotoğraf cihazda bulunamadı.</div>
                )}
                {q.audioUrl ? (
                  <audio controls src={q.audioUrl} />
                ) : (
                  <p className="muted">Ses kaydı yok.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Haftalık Tekrar</h2>
        <p className="muted">
          Sadece hafta sonu açılır. Sorular karışık gelir, önce ders/konu gizli kalır.
        </p>

        {!repeatStarted && (
          <button onClick={loadWeekendRepeat}>Haftalık Tekrarı Başlat</button>
        )}

        {repeatStarted && currentQuestion && (
          <div className="stack gap-md">
            <p className="badge">Soru {repeatIndex + 1} / {repeatQuestions.length}</p>

            {currentQuestion.imageUrl ? (
              <img className="question-image" src={currentQuestion.imageUrl} alt="Soru görseli" />
            ) : (
              <div className="warning-box">Bu sorunun fotoğrafı cihazda bulunamadı.</div>
            )}

            {revealMeta && (
              <div className="info-box">
                <strong>{currentQuestion.ders}</strong> — {currentQuestion.konu}
              </div>
            )}

            <div className="button-row">
              <button className="success" onClick={() => handleRepeatAnswer(true)}>
                Doğru
              </button>
              <button className="danger" onClick={() => handleRepeatAnswer(false)}>
                Yanlış
              </button>
            </div>
          </div>
        )}

        {repeatSummary && (
          <div className="info-box">
            <h3>Tekrar Özeti</h3>
            <p>Doğru: {repeatSummary.dogru}</p>
            <p>Yanlış: {repeatSummary.yanlis}</p>
            <p>Yanlış sorular gelecek haftaya devredildi.</p>
          </div>
        )}
      </section>

      {message && <div className="warning-box">{message}</div>}
    </div>
  )
}

export default StudentPanel
