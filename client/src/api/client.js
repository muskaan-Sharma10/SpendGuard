import axios from 'axios'

/**
 * Single axios instance for the whole app.
 * - attaches the JWT from localStorage to every request
 * - on 401 (expired/invalid token) clears the session and redirects to login
 * - normalises API errors so UI code always sees `error.message`
 */
export const TOKEN_KEY = 'spendguard_token'

// '/api' works when the client and API share an origin (dev proxy, or Express
// serving the built client). For split hosting (e.g. Vercel/Netlify frontend +
// a separately-deployed API), set VITE_API_URL at build time, e.g.
// https://spendguard-api.onrender.com/api
const baseURL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status
    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    // The API always answers { success:false, error:{ message, details? } }.
    const message =
      error.response?.data?.error?.message ||
      (error.response?.status === 429
        ? 'Too many requests — slow down a moment.'
        : 'Network error. Is the server running?')
    const normalized = new Error(message)
    normalized.status = status
    normalized.details = error.response?.data?.error?.details
    return Promise.reject(normalized)
  }
)

export async function getData(url, params) {
  const res = await api.get(url, { params })
  return res.data.data
}

export async function postData(url, body) {
  const res = await api.post(url, body)
  return res.data.data
}

export async function putData(url, body) {
  const res = await api.put(url, body)
  return res.data.data
}

export async function deleteData(url) {
  const res = await api.delete(url)
  return res.data.data
}

export default api
