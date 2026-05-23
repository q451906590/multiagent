import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import {
  assignUnownedResourcesToUser,
  getUserById,
  getUserByUsername,
  insertUser,
} from '../db.js'

function now() {
  return Date.now()
}

function normalizeUsername(input) {
  return String(input || '').trim().toLowerCase()
}

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export async function registerUser({ username, password }) {
  const normalized = normalizeUsername(username)
  if (!normalized) throw new Error('username is required')
  if (normalized.length < 3 || normalized.length > 64) {
    throw new Error('username length must be between 3 and 64')
  }
  if (!String(password || '').trim() || String(password).length < 6) {
    throw new Error('password length must be at least 6')
  }
  const exists = getUserByUsername(normalized)
  if (exists) throw new Error('username already exists')
  const ts = now()
  const user = {
    id: randomUUID(),
    username: normalized,
    passwordHash: await bcrypt.hash(String(password), 10),
    createdAt: ts,
    updatedAt: ts,
  }
  insertUser(user)
  assignUnownedResourcesToUser(user.id)
  return toPublicUser(user)
}

export async function loginUser({ username, password }) {
  const normalized = normalizeUsername(username)
  if (!normalized) throw new Error('username is required')
  if (!String(password || '')) throw new Error('password is required')
  const user = getUserByUsername(normalized)
  if (!user) throw new Error('invalid username or password')
  const ok = await bcrypt.compare(String(password), user.passwordHash)
  if (!ok) throw new Error('invalid username or password')
  assignUnownedResourcesToUser(user.id)
  return toPublicUser(user)
}

export function createAccessToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  )
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtSecret)
}

export function getUserPublicById(id) {
  const user = getUserById(id)
  return user ? toPublicUser(user) : null
}
