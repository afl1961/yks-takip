import { useState } from 'react'

function AuthView({ onLogin, onRegister, loading, firebaseReady }) {
  const [isRegister, setIsRegister] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'ogrenci',
  })

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (isRegister) {
      await onRegister(form)
    } else {
      await onLogin({ email: form.email, password: form.password })
    }
  }

  return (
    <div className="card">
      <h1>YKS Takip</h1>
      <p className="muted">Öğrenci ve koç paneli tek uygulamada.</p>

      {!firebaseReady && (
        <div className="warning-box">
          Firebase bağlantısı kurulmadı. Lütfen <code>.env</code> dosyasını doldurun.
        </div>
      )}

      <form onSubmit={handleSubmit} className="stack">
        {isRegister && (
          <label>
            Ad Soyad
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
            />
          </label>
        )}

        <label>
          E-posta
          <input
            type="email"
            value={form.email}
            onChange={(e) => handleChange('email', e.target.value)}
            required
          />
        </label>

        <label>
          Şifre
          <input
            type="password"
            value={form.password}
            onChange={(e) => handleChange('password', e.target.value)}
            required
            minLength={6}
          />
        </label>

        {isRegister && (
          <label>
            Rol
            <select
              value={form.role}
              onChange={(e) => handleChange('role', e.target.value)}
            >
              <option value="ogrenci">Öğrenci</option>
              <option value="koc">Koç</option>
            </select>
          </label>
        )}

        <button type="submit" disabled={loading || !firebaseReady}>
          {loading ? 'İşleniyor...' : isRegister ? 'Kayıt Ol' : 'Giriş Yap'}
        </button>
      </form>

      <button
        className="secondary"
        onClick={() => setIsRegister((prev) => !prev)}
        disabled={loading}
      >
        {isRegister
          ? 'Zaten hesabım var, giriş yap'
          : 'Hesabın yok mu? Kayıt ol'}
      </button>
    </div>
  )
}

export default AuthView
