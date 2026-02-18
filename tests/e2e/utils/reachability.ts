import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authDir = path.join(__dirname, '..', '.auth')

export function webReachable(): boolean {
  return fs.existsSync(path.join(authDir, '.web-reachable'))
}

export function apiReachable(): boolean {
  return fs.existsSync(path.join(authDir, '.api-reachable'))
}

/** True if globalSetup successfully logged in at least one role (Keycloak + demo users). */
export function authAvailable(): boolean {
  return fs.existsSync(path.join(authDir, '.auth-ok'))
}
