// load .env variables
require('dotenv').config()

// load libraries
const express = require('express')
const handlebars = require('express-handlebars')
const fetch = require('node-fetch')
const withQuery = require('with-query').default
const mysql = require('mysql2/promise')
const morgan = require('morgan')

// create instance of express
const app = express()

// configure environment variables
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000
const API_KEY = process.env.API_KEY || ''

// configure handlebars
app.engine('hbs', handlebars({ defaultLayout: 'default.hbs' }))
app.set('view engine', 'hbs')

// SQL
const SQL_SEARCH_BOOKS_BY_LETTER =
  'SELECT * FROM book2018 WHERE title LIKE ? ORDER BY title ASC LIMIT ? OFFSET ?'
const SQL_COUNT_BOOKS_BY_LETTER =
  'SELECT COUNT(*) as count FROM book2018 WHERE title LIKE ?'
const SQL_SEARCH_BY_TITLE_AND_BOOKID =
  'SELECT * FROM book2018 WHERE title LIKE ? and book_id=?'

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'goodreads',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 4,
  timezone: '+08:00',
})

app.use(morgan('combined'))

// configure application
app.get('/', (req, res) => {
  let letters = 'abcdefghijklmnopqrstuvwxyz'.toUpperCase().split('')
  let numbers = '0123456789'.split('')
  // console.info(letters, numbers)
  res.status(200).type('text/html')
  res.render('index', { letters, numbers })
})

app.get('/booktitles/search:search/page:page', async (req, res) => {
  const search = req.params['search']
  // console.info('>>> search -----> ', search)
  const page = parseInt(req.params['page'])
  // console.info('>>> page -----> ', page)

  const prevPage = page - 1
  const nextPage = page + 1

  const limit = 10
  const offset = (page - 1) * 10
  // console.info('>>> offset -----> ', offset)

  const conn = await pool.getConnection()

  try {
    const resultOfSearch = await conn.query(SQL_SEARCH_BOOKS_BY_LETTER, [
      `${search}%`,
      limit,
      offset,
    ])
    const result = resultOfSearch[0]
    // console.info('>>> result -----> ', result)

    const countOfSearch = await conn.query(SQL_COUNT_BOOKS_BY_LETTER, [
      `${search}%`,
    ])
    const totalCount = parseInt(countOfSearch[0][0]['count'])
    // console.info('>>> totalCount -----> ', totalCount)

    conn.release()

    const hasContent = totalCount > 0
    // console.info('>>> hasContent -----> ', hasContent)

    const numberOfPages = Math.ceil(totalCount / limit)
    // console.info('>>> numberOfPages -----> ', numberOfPages)

    let hasPrevPage = true
    let hasNextPage = true

    if (page == 1) hasPrevPage = false
    if (page == numberOfPages) hasNextPage = false

    res.status(200).type('text/html')
    res.render('booktitles', {
      search,
      page,
      hasContent,
      result,
      prevPage,
      nextPage,
      hasPrevPage,
      hasNextPage,
    })
  } catch (err) {
    console.error('>>> Error in processing query -----> ', err)
    res.status(500).type('text/html')
    res.render('error')
  }
})

app.get('/bookdetails/:title/:bookID', async (req, res) => {
  const title = req.params['title']
  // console.log('>>> title -----> ', title)
  const bookID = req.params['bookID']
  // console.log('>>> bookID -----> ', bookID)

  const conn = await pool.getConnection()

  const bookDetails = await conn.query(SQL_SEARCH_BY_TITLE_AND_BOOKID, [
    title,
    bookID,
  ])
  // const bookInfo = bookDetails[0][0]
  const bookInfo = bookDetails[0]
  // console.log('>>> bookInfo1 -----> ', bookInfo)

  const genres = bookInfo[0].genres.split('|').join(', ')
  // console.log('>>> genres -----> ', genres)
  bookInfo[0].genres = genres
  // console.log('>>> bookInfo2 -----> ', bookInfo)
  const authors = bookInfo[0].authors.split('|').join(', ')
  // console.log('>>> authors -----> ', authors)
  bookInfo[0].authors = authors
  // console.log('>>> bookInfo2 -----> ', bookInfo)

  conn.release()

  try {
    res.status(200).type('text/html')
    res.format({
      'text/html': () => {
        res.status(200).type('text/html')
        res.render('bookdetails', { bookInfo })
      },
      'application/json': () => {
        res.status(200)
        res.json({
          bookId: bookInfo[0].book_id,
          title: bookInfo[0].title,
          authors: [bookInfo[0].authors],
          summary: bookInfo[0].description,
          pages: bookInfo[0].pages,
          rating: bookInfo[0].rating,
          ratingCount: bookInfo[0].rating_count,
          genre: [bookInfo[0].genres],
        })
      },
      default: () => {
        res.status(406).type('text/plain')
        res.send(
          `HTTP request type is not supported. Check: ${req.get('Accept')}`
        )
      },
    })
  } catch (err) {
    console.error('>>> Error in processing query -----> ', err)
    res.status(500).type('text/html')
    res.render('error')
  }
})

app.get('/bookreviews/:title/:authors', async (req, res) => {
  const title = req.params['title']
  // console.info('>>> title -----> ', title)
  const author = req.params['authors']
  // console.info('>>> author -----> ', author)
  const endpoint = 'https://api.nytimes.com/svc/books/v3/reviews.json'

  const url = withQuery(endpoint, {
    title,
    author,
    'api-key': API_KEY,
  })
  // console.info('>>> url -----> ', url)

  try {
    const result = await fetch(url)
    // console.info('>>> result -----> ', result)
    const reviews = await result.json()
    // console.info('>>> reviews -----> ', reviews)
    const reviewCount = reviews['num_results']
    // console.info('>>> reviewCount -----> ', reviewCount)
    const hasContent = parseInt(reviewCount) > 0
    // console.info('>>> hasContent -----> ', hasContent)
    const bookResults = reviews['results']
    // console.info('>>> bookResults -----> ', bookResults)
    const copyright = reviews['copyright']
    // console.info('>>> copyright -----> ', copyright)

    res.status(200).type('text/html')
    res.render('bookreviews', { hasContent, bookResults, copyright })
  } catch (err) {
    console.error('>>> Error in retrieving reviews -----> ', err)
    res.status(500).type('text/html')
    res.render('error')
  }
})

app.use(express.static(__dirname + '/static'))

app.use('/', (req, res) => {
  res.status(404).type('text/html')
  res.render('error404')
})

const startApp = async (app, pool) => {
  try {
    const conn = await pool.getConnection()
    console.info('PINGING DATABASE...')

    await conn.ping()

    conn.release()

    if (API_KEY) {
      app.listen(PORT, () => {
        console.info(`Application started on port ${PORT} at ${new Date()}`)
      })
    }
  } catch (err) {
    console.error(`>>> CANNOT PING DATABASE -----> `, err)
  }
}

if (API_KEY) {
  startApp(app, pool)
} else {
  console.error('API KEY was not set...')
}
