import { cpSync, mkdirSync } from 'node:fs'

mkdirSync('./dist', { recursive: true })
cpSync('./src/main.js', './dist/main.js')
