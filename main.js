require('dotenv').config()
const express = require('express')
const handlebars = require('express-handlebars')
const mysql = require('mysql2/promise')
const fetch = require('node-fetch')
const withQuery = require('with-query').default

const app = express()

const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000

app.engine('hbs', handlebars({ defaultLayout: 'default.hbs' }))
app.set('view engine', 'hbs')

// configure app
app.get('/',
  (req, res) => {
    res.status(200)
    res.type('text/html')
    res.render('index')

  })

  app.use(express.static(__dirname + '/static'))

  // app.use((req, res) => {
  //   res.status(404)
  //   res.type('text/html')
  //   res.render('error404')
  // })

  app.listen(PORT,
    console.info(`Application started on port ${PORT} on ${new Date()}`)
  )