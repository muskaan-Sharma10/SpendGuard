import { createContext, useContext, useEffect, useState } from 'react'
import api, { TOKEN_KEY, getData, postData } from '../api/client'

/**
 * Auth context: holds the JWT + current user, exposes login/register/logout.
 * On mount the profile is refetched so a stale token fails fast and the axios
 * interceptor redirects to /login.
 */
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setLoading(false)
      return
    }
    getData('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  async function login(email, password) {
    const data = await postData('/auth/login', { email, password })
    localStorage.setItem(TOKEN_KEY, data.token)
    setUser(data.user)
    return data.user
  }

  async function register(name, email, password) {
    const data = await postData('/auth/register', { name, email, password })
    localStorage.setItem(TOKEN_KEY, data.token)
    setUser(data.user)
    return data.user
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    api.post('/auth/logout').catch(() => {})
    setUser(null)
  }

  function updateUser(next) {
    setUser(next)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
