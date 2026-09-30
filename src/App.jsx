import { useEffect, useState } from 'react'
import './App.css'
import AuthView from './components/AuthView'
import CoachPanel from './components/CoachPanel'
import StudentPanel from './components/StudentPanel'
import { firebaseReady } from './firebase'
import { getUserProfile, listenAuthState, login, logout, registerWithRole } from './services/auth'

function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsub = listenAuthState(async (authUser) => {
      setUser(authUser)
      if (authUser) {
        const data = await getUserProfile(authUser.uid)
        setProfile(data)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return unsub
  }, [])

  const handleLogin = async (payload) => {
    setAuthBusy(true)
    setError('')
    try {
      await login(payload)
    } catch (err) {
      setError(err.message || 'Giriş başarısız')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleRegister = async (payload) => {
    setAuthBusy(true)
    setError('')
    try {
      await registerWithRole(payload)
    } catch (err) {
      setError(err.message || 'Kayıt başarısız')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleLogout = async () => {
    await logout()
  }

  if (loading) {
    return <main className="container">Yükleniyor...</main>
  }

  if (!user || !profile) {
    return (
      <main className="container">
        <AuthView
          onLogin={handleLogin}
          onRegister={handleRegister}
          loading={authBusy}
          firebaseReady={firebaseReady}
        />
        {error && <div className="warning-box">{error}</div>}
      </main>
    )
  }

  return (
    <main className="container">
      <header className="app-header card">
        <div>
          <h1>Merhaba, {profile.ad || 'Kullanıcı'}</h1>
          <p className="muted">Rol: {profile.rol === 'koc' ? 'Koç' : 'Öğrenci'}</p>
        </div>
        <button className="secondary" onClick={handleLogout}>
          Çıkış
        </button>
      </header>

      {profile.rol === 'koc' ? (
        <CoachPanel firebaseReady={firebaseReady} />
      ) : (
        <StudentPanel user={user} firebaseReady={firebaseReady} />
      )}
    </main>
  )
}

export default App
