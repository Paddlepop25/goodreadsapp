// load variables from .env 
require('dotenv').config()

// load libraries
const express = require('express')
const handlebars = require('express-handlebars')
const mysql = require('mysql2/promise')
const fetch = require('node-fetch')
const withQuery = require('with-query').default
const morgan = require('morgan')
const path = require('path') // used for flat-cache
const flatCache = require('flat-cache')

// create an instance of express
const app = express()

// set API_KEY
const API_KEY = process.env.API_KEY || ""

// configure PORT
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000

// configure handlebars
app.engine('hbs', handlebars({ defaultLayout: 'default.hbs' }))
app.set('view engine', 'hbs')

// create the database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'goodreads',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 4,
  timezone: '+8:00',
})

const mkQuery = (sqlStmt, pool) => {
  const f = async (params) => {
      // get a connection from the pool
      const conn = await pool.getConnection()

      try {
          const results = await pool.query(sqlStmt, params)
          return results[0]
      } catch(e) {
          return Promise.reject(e)
      } finally {
          conn.release()
      }
  }
  return f
}

// load new cache
let cache = flatCache.load('booksCache', path.resolve(`${__dirname}`))
// console.info('__dirname ---> ', __dirname)

// create flat cache routes
let flatCacheMiddleware = (req, res, next) => {
  let key = '__express__' + req.originalUrl || req.url
  // console.info('key --->', key)
  let cacheContent = cache.getKey(key);
  if (cacheContent) {
    console.info('------------------------IT EXISTS------------------------')
    console.info('cacheContent ------->', cacheContent) // will show html content
    res.send(cacheContent); //send to where? body?
  } else {
    res.sendResponse = res.send
    res.send = (body) => {
      cache.setKey(key, body);
      cache.save( true /* noPrune */);
      res.sendResponse(body)
    }
    next()
  }
};

// SQL
const SQL_FIND_BY_BOOKID = 'select * from book2018 where book_id=?'
const SQL_FIND_BY_LETTER = 'select * from book2018 where title like ? order by title asc limit ? offset ?'
const SQL_FIND_BY_COUNT = 'select count(*) as count from book2018 where title like ?'

const bookDetails = mkQuery(SQL_FIND_BY_BOOKID, pool)
const bookResults = mkQuery(SQL_FIND_BY_LETTER, pool)
const bookCount = mkQuery(SQL_FIND_BY_COUNT, pool)

// configure app
app.get('/',
  (req, res) => {
    let alphabets = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
    let numbers = "0123456789".split("")

    res.status(200).type('text/html')
    res.render('index.hbs', { alphabets, numbers })
  })

app.get('/letter:letter/page:page',
  async (req, res) => {
    const letter = req.params['letter']
    console.info('letter --->', letter)

    const page = parseInt(req.params['page'])
    // console.info('page --->', page)
    const prevPage = page - 1
    // console.info('prevPage --->', prevPage)
    const nextPage = page + 1
    // console.info('nextPage --->', nextPage)

    const limit = 10
    const offset = (page - 1) * 10
    console.info('offset --->', offset)

    const conn = await pool.getConnection()

    try {
      const countofResults = await bookCount([`${letter}%`])
      // console.info('countofResults --->', countofResults[0]['count'])
      const numberOfResults = parseInt(countofResults[0]['count'])
      console.info('numberOfResults --->', numberOfResults)

      const numberOfPages = Math.ceil(numberOfResults / limit);
      // console.info('numberOfPages --->', numberOfPages)

      let hasPrevPage = true
      let hasNextPage = true

      if (page == 1) hasPrevPage = false
      if (page == numberOfPages) hasNextPage = false

      const resultOfLetters = await bookResults([`${letter}%`, limit, offset])
      resultOfLetter = resultOfLetters
      // console.info('resultOfLetter --->', resultOfLetter)

      conn.release()

      const hasContent = resultOfLetters.length >= 1
      // console.info('hasContent --->', hasContent)

      res.status(200).type('text/html')
      res.render('books', {
        letter, hasContent, page, prevPage, nextPage, hasPrevPage, hasNextPage, resultOfLetter
      })
    } catch (err) {
      console.error('Error in processing query ----> ', err)
      res.status(500).type('text/html')
      res.send('<h1>Error in accessing the database</h1>')
    }
  })

app.get('/details/:id',
  async (req, res) => {
    const bookID = req.params['id']
    // console.info('bookID --->', bookID)
    const conn = await pool.getConnection()

    try {
      const detailsOfTitle = await bookDetails([bookID])
      // console.info('detailsOfTitle --->', detailsOfTitle)

      // this for ?title=bookDetail.title for req.get in reviews
      const bookDetail = detailsOfTitle[0]
      // console.info('bookDetail --->', bookDetail)

      conn.release()

      const authors = bookDetail['authors'].split("|").join(", ")
      // set this in bookDetail's authors itself
      bookDetail.authors = authors
      // console.info('authors --->', authors)
      const genres = bookDetail['genres'].split("|").join(", ")
      // set this in bookDetail's genres itself
      bookDetail.genres = genres
      // console.info('genres --->', genres)

      // see changed authors and genres for bookDetail
      // console.info('bookDetail --->', bookDetail)

      res.format({
        'text/html': () => {
          res.status(200)
          res.render('details', {
            bookDetail, authors, genres
          })
        },
        'application/json': () => {
          res.status(200)
          res.json({
            bookId: bookDetail.book_id,
            title: bookDetail.title,
            // authors: authors, // can't use this from above because not in array
            authors: bookDetail['authors'].split("|"),
            summary: bookDetail.description,
            pages: bookDetail.pages,
            rating: bookDetail.rating,
            ratingCount: bookDetail.rating_count,
            // genre: genres // can't use this from above  because not in array
            genre: bookDetail['genres'].split("|")
          })
        },
        'default': () => {
          res.status(406).type('text/plain')
          res.send(`HTTP request type is not supported. See: ${req.get('Accept')}`)
        }
      })
    }
    catch (err) {
      console.error(`Error in retrieving details of book ${bookID}  ----> `, err)
      res.status(500).type('text/html')
      res.send('<h1>Error in accessing the database</h1>')
    }
  }
)

app.get('/reviews/:title/:authors', flatCacheMiddleware, 
  async (req, res) => {
    let title = req.params.title
    // console.info('title --->', title)
    let author = req.params['authors']
    // console.info('author --->', author)
    let review_endpoint = "https://api.nytimes.com/svc/books/v3/reviews.json"

    const url = withQuery(review_endpoint, {
      title, author,
      "api-key": API_KEY
    })
    // console.info('url --->', url)

    try {
      const result = await fetch(url)
      const allResults = await result.json()
      // console.info('allResults ----> ', allResults)

      const num_results = allResults['num_results']
      // console.info('num_results ----> ', num_results)
      const hasContent = num_results > 0
      // console.info('hasContent ----> ', hasContent)

      const review = allResults['results']
      // console.info('review ----> ', review)

      const copyright = allResults['copyright']
      // console.info('copyright ----> ', copyright)

      res.status(200)
      res.type('text/html')
      // res.end()
      res.render('review', {
        hasContent, review, copyright
      })
    } catch (err) {
      console.error('Error in retrieving reviews ---> ', err)
      res.status(500).type('text/html')
      res.send('<h1>This service is temporarily unavailable</h1>')
    }
  }
)

// use 'morgan' from npm library
app.use(morgan('combined'))

app.use(express.static(__dirname + '/static'))

// display error404 page for unknown resources
app.use((req, res) => {
  res.status(404).type('text/html')
  res.render('error404')
})

// start the app
pool.getConnection()
    .then(conn => {
        const p0 = Promise.resolve(conn)
        const p1 = conn.ping()
        return Promise.all([p0, p1])
    })
    .then(promiseArray => {
        const conn = promiseArray[0]
        conn.release()
        if(API_KEY) {
            app.listen(PORT, () => {
                console.info(`App has started on port ${PORT} at ${new Date()}`)
            })
        }
        else {
            throw new Error('API_KEY variable is not set. Please check.')
        }
    })
    .catch(err => {
        console.error('Cannot start server ---> ', err)
    })

// redirect to home if all not found
app.use(
    (req, resp) => {
        resp.redirect('/')
    }
)
