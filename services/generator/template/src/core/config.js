/**
 * Core config loader - shared by all generated project modules.
 * Loads .env from project root.
 */
import { config } from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..', '..')
const envPath = join(projectRoot, '.env')
config({ path: envPath, override: process.env.NODE_ENV !== 'production' })

export const PORT = parseInt(process.env.PORT || '3001', 10)
export const NODE_ENV = process.env.NODE_ENV || 'development'
