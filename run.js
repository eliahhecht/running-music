const express = require('express')
const index = require('./index.js')

const app = express()

app.get('/', async (req, res) => {
  await index.makePlaylist(!!req.query.test, (error, response) => {
    if (error) {
      console.log(error)
      res.send('boo')
    } else {
      res.send(response)
    }
  })
})

console.log('Listening on 8888')
app.listen(8888)