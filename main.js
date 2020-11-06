require('dotenv').config()
const express = require('express')
const handlebars = require('express-handlebars')
const mysql = require('mysql2/promise')
const fetch = require('node-fetch')
const withQuery = require('with-query').default

const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'goodreads',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 4,
  timezone: '+8:00',
})

const startApp = async (app, pool) => {
  try {
    const conn = await pool.getConnection()
    console.info('Pinging database')
    await conn.ping()
    conn.release()
    app.listen(PORT, () => {
      console.info(`Application started on port ${PORT} at ${new Date()}`)
    })
  } catch(exception) {
    console.error('Cannot ping database: ', exception)
  }
}

const app = express()

app.engine('hbs', handlebars({ defaultLayout: 'default.hbs' }))
app.set('view engine', 'hbs')

const API_KEY = process.env.API_KEY || ""

// select title from book2018 where title LIKE 'A%' order by title asc limit 10;offset 10
const SQL_FIND_BY_LETTER = 'select title from book2018 where title like ? order by title asc limit ? offset ?'

// configure app
app.get('/',
  (req, res) => {
    res.status(200)
    res.type('text/html')
    res.render('index')
  })
  
  let limit = 10
  let offset = 0;
  app.get('/results',
  async (req, res) => {
    const letter = req.query['letter']
    console.info('letter --->', letter)

    const conn = await pool.getConnection()    

    const result = await conn.query(SQL_FIND_BY_LETTER, [ `${letter}%`, limit, offset ])
    const resultOfLetter = result[0]
    console.info('resultOfLetter --->', resultOfLetter)

    res.status(200)
    res.type('text/html')
    res.render('results', {letter, resultOfLetter})
    // res.end()

    try {

    } catch(err) {
      console.error('error ---->', err)
    } finally {
      // release connection
      conn.release()
    }
  })

  // app.use(express.static(__dirname + '/static'))

  // app.use((req, res) => {
  //   res.status(404)
  //   res.type('text/html')
  //   res.render('error404')
  // })

  startApp(app, pool)