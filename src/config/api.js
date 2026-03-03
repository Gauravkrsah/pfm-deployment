// API Configuration - Dynamic backend URL support for local network access
let baseUrl = (typeof process !== 'undefined' && process.env?.REACT_APP_API_BASE_URL) || ''

// If running in browser and the configured URL is localhost, but we're accessing via network IP
if (typeof window !== 'undefined' && baseUrl.includes('localhost') && window.location.hostname !== 'localhost') {
    baseUrl = `http://${window.location.hostname}:8000`
}

export const API_BASE_URL = baseUrl

export default { baseURL: API_BASE_URL }