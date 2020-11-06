require('dotenv').config()
const express = require('express')
const handlebars = require('express-handlebars')
const mysql = require('mysql2/promise')
const fetch = require('node-fetch')
const withQuery = require('with-query').default
var morgan = require('morgan')

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
  } catch (exception) {
    console.error('Cannot ping database: ', exception)
  }
}

const app = express()
app.use(morgan('combined'))

app.engine('hbs', handlebars({ defaultLayout: 'default.hbs' }))
app.set('view engine', 'hbs')

const API_KEY = process.env.API_KEY || ""

// select * from book2018 where book_id='c170602e';
// const SQL_FIND_BY_ALLRESULTS = 'select * from book2018 where book_id = ? '
const SQL_FIND_BY_LETTER = 'select * from book2018 where title like ? order by title asc limit ? offset ?'

// configure app
app.get('/',
  (req, res) => {
    let alphabets = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
    let numbers = "0123456789".split("")

    res.status(200)
    res.type('text/html')
    res.render('index', { alphabets, numbers })
  })

app.get('/results',
  async (req, res) => {
    const letter = req.query['letter']
    let limit = 10
    let offset = parseInt(req.query['offset']) || 0
    console.info('letter --->', letter)

    let conn, resultOfLetter;

    try {
      conn = await pool.getConnection()

      const resultofLetters = await conn.query(SQL_FIND_BY_LETTER, [`${letter}%`, limit, offset])
      resultOfLetter = resultofLetters[0]
      // console.info('resultOfLetter --->', resultOfLetter)
      const hasContent = resultofLetters[0].length
      // console.info('hasContent --->', hasContent)
      
      res.status(200)
      res.type('text/html')
      res.render('results', {
        letter, resultOfLetter, hasContent,
        prevOffset: Math.max(0, offset - limit),
        nextOffset: offset + limit,
        firstPage: offset == 0,
        lastPage: offset > offset
      })

    } catch (err) {
      console.error('error ---->', err)
    } finally {
      // release connection
      if (conn)
      conn.release()
    }
  })

app.get('/details/:id',
async (req, res) => {
  const bookID = req.params['book_id']
  console.info('bookID --->', bookID)
  // select * from book2018 where book_id='c170602e';
  const result = await conn.query(SQL_FIND_BY_LETTER, [ `${letter}%`, limit, offset ])
  const resultOfLetter = result[0]
  // console.info('resultOfLetter --->', resultOfLetter)

  let conn;

  try {
    conn = await pool.getConnection()

    const SQL_FIND_BY_ALLRESULTS = 'select * from book2018'

    const detailsOfTitle = await conn.query(SQL_FIND_BY_ALLRESULTS)
    resultOfDetails = detailsOfTitle[0]
    // console.info('resultOfDetails --->', resultOfDetails)

    res.status(200)
    res.type('text/html')
    res.render('details', {
      resultOfLetter
    }) 
  } catch (err) {
    console.error('error ---->', err)
  } finally {
    // release connection
    if (conn)
    conn.release()
  }
}
)


// app.use(express.static(__dirname + '/static'))

// app.use((req, res) => {
//   res.status(404)
//   res.type('text/html')
//   res.render('error404')
// })

startApp(app, pool)