import express from 'express'
import logger from 'morgan'
import dotenv from 'dotenv'
import { createClient } from '@libsql/client'

import { Server } from 'socket.io'
import { createServer } from 'node:http'

dotenv.config()

const port = process.env.PORT ?? 3000

const app = express()
const server = createServer(app)
const io = new Server(server, {
  connectionStateRecovery: {}
})


// Coneccion a base de datos
const db = createClient({
  url: 'libsql://emerging-bloodberry-byhako.turso.io',
  authToken: process.env.DB_TOKEN
})

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    username TEXT
  )
`)

// Coneccion al socket
io.on('connection', async (socket) => {
  console.log('a user has connected')

  socket.on('disconnect', () => {
    console.log('an user has disconnected')
  })

  socket.on('chat message', async (msg) => {
    let result
    const username = socket.handshake.auth.username ?? 'anonymous'
    try {
      result = await db.execute({
        sql: 'INSERT INTO messages (content, username) VALUES (:message, :username)',
        args: { message: msg, username }
      })
    } catch (error) {
      console.error(error)
      return
    }
    io.emit('chat message', msg, result?.lastInsertRowid?.toString(), username)
  })
  // console.log(socket.handshake.auth)


  // Recupera los mensages sin conexion
  if (!socket.recovered) {
    let result
    try {
      result = await db.execute({
        sql: 'SELECT id, content, username FROM messages WHERE id > ?',
        args: [socket.handshake.auth.serverOffset ?? 0]
      })
    } catch (error) {
      console.error(error)
      return
    }

    result?.rows?.forEach(row => {
      socket.emit('chat message', row.content, row.id.toString(), row.username)
    });
  }
})

app.use(logger('dev'))

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/client/index.html')
})

server.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
