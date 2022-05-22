const TelegramBot = require('node-telegram-bot-api')
const axios = require('axios')
const _ = require('lodash')
const ejs = require('ejs');
const config = require('./config')
const helper = require('./helpers')
const kb = require('./keyboard-buttons')
const keyboard = require('./keyboard')

const express = require('express')
const inquirer = require('inquirer')

const app = express();
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");

const mysql = require("mysql")
const con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "test2"
})

helper.logStart()

const bot = new TelegramBot(config.TOKEN, {
  polling: true
})

bot.on('message', async msg => {

  //console.log(msg.from.first_name, msg.text)
  const chatId = helper.getChatId(msg)

  switch (msg.text) {
    case kb.home.coming:
      const coming = await axios.get("https://imdb-api.com/en/API/ComingSoon/k_9bhbsg3b")
      let soonFilms = coming.data.items
      soonFilms.forEach(async film => {
        //Cerca il trailer
        sendFilm(film, msg, false)
      })
      break
    case kb.home.theaters:
      const theaters = await axios.get("https://imdb-api.com/en/API/InTheaters/k_9bhbsg3b")
      let nowFilms = theaters.data.items

      nowFilms.forEach(async film => {
        //Cerca il trailer
        sendFilm(film, msg, false)
      })
      break
    case kb.home.favourite:
      con.query("SELECT * FROM preferiti WHERE IdUser = ? ", [msg.from.id], (error, result) => {
        if (error) throw error
        result.forEach(async fav => {
          const result = await axios.get("https://imdb-api.com/en/API/Title/k_9bhbsg3b/" + fav.IdFilm)
          let film = result.data
          sendFilm(film, msg, true)
        })
      })
      break
  }
})

// start bot
bot.onText(/\/start/, msg => {
  const text = `Benvenuto, ${msg.from.first_name}!\nCosa vorreste guardare?`
  bot.sendMessage(helper.getChatId(msg), text, {
    reply_markup: {
      keyboard: keyboard.home
    }
  })
})

bot.onText(/\/id/, msg => {

  const text = `Il suo User ID è: ${msg.from.id}\n`
  bot.sendMessage(helper.getChatId(msg), text, {
    reply_markup: {
      keyboard: keyboard.home
    }
  })
})
//FILMS NEW
bot.onText(/\/film (.+)/, async (msg, match) => {
  //Cerca il titolo generale
  const generalSearch = await axios.get("https://imdb-api.com/en/API/Search/k_9bhbsg3b/" + match[1])
  let filmGeneral = generalSearch.data.results[0]

  //Cerca in dettaglio il film
  const result = await axios.get("https://imdb-api.com/en/API/Title/k_9bhbsg3b/" + filmGeneral.id)
  let film = result.data
  console.log(film)

  sendFilm(film, msg)
})

//Series NEW
bot.onText(/\/serie (.+)/, async (msg, match) => {
  const seriesSearch = await axios.get("https://imdb-api.com/en/API/SearchSeries/k_9bhbsg3b/" + match[1])
  let seriesGeneral = seriesSearch.data.results[0]

  const result = await axios.get("https://imdb-api.com/en/API/Title/k_9bhbsg3b/" + seriesGeneral.id)
  let serie = result.data
  console.log(serie)
  bot.sendPhoto(msg.chat.id, serie.image, {
    caption: `Title: ${serie.fullTitle}\nGenere: ${serie.genres}\nData di uscita: ${serie.releaseDate}\nSeasons: ${Object.keys(serie.tvSeriesInfo.seasons).length}`
  })
})

// helper. send bot html
function sendHtml(chatId, html, keyboardName = null) {
  const options = {
    parse_mode: 'HTML'
  }
  if (keyboardName) {
    options['reply_markup'] = {
      keyboard: keyboard[keyboardName]
    }
  }
  bot.sendMessage(chatId, html, options)
}

async function sendFilm(film, msg, isFav) {
  console.log(film)
  const trailerSearch = await axios.get("https://imdb-api.com/en/API/YouTubeTrailer/k_9bhbsg3b/" + film.id)
  let trailer = trailerSearch.data
  //Cerca il sito ufficiale
  const officialWeb = await axios.get("https://imdb-api.com/en/API/ExternalSites/k_9bhbsg3b/" + film.id)
  let website = officialWeb.data
  console.log(trailer.videoUrl, website.officialWebsite)

  bot.sendPhoto(msg.chat.id, film.image, {
    caption: `🎞 Titolo: ${film.fullTitle}\n🔖 Genere: ${film.genres}\n📅 Data di uscita: ${film.releaseDate}\n🕑 Durata: ${film.runtimeStr}`,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `Vai al trailer: ${film.fullTitle}`,
            url: `${trailer.videoUrl}`
          }
        ],
        [
          {
            text: `Sito Ufficiale: ${film.fullTitle}`,
            url: `${website.officialWebsite || "https://www.imdb.com/"}`
          }
        ],
        [
          {
            text: isFav ? `Rimuovi dai preferiti` : `Aggiungi ai preferiti`,
            callback_data: film.id
          }
        ]
      ]
    }
  })
}

// handler inline keyboard
bot.on('callback_query', query => {
  const userId = query.from.id
  let data = query.data
  let inline_keyboard = query.message.reply_markup.inline_keyboard
  if (inline_keyboard[2][0].text == "Aggiungi ai preferiti") {
    inline_keyboard[2][0].text = "Rimuovi dai preferiti"
    query.message.reply_markup.inline_keyboard = inline_keyboard
    bot.editMessageReplyMarkup(query.message.reply_markup, { chat_id: query.message.chat.id, message_id: query.message.message_id })
    con.query("INSERT INTO preferiti (IdFilm, IdUser) VALUES (?,?)", [query.data, userId], (error, result) => {
      if (error) throw error
    })
  } else if (inline_keyboard[2][0].text == "Rimuovi dai preferiti") {
    inline_keyboard[2][0].text = "Aggiungi ai preferiti"
    query.message.reply_markup.inline_keyboard = inline_keyboard
    bot.editMessageReplyMarkup(query.message.reply_markup, { chat_id: query.message.chat.id, message_id: query.message.message_id })
    con.query("DELETE FROM preferiti WHERE IdFilm = ? && IdUser = ?", [query.data, userId], (error, result) => {
      if (error) throw error
    })
  }
})

let options = {
  type: 'list',
  name: 'commands',
  message: 'Select the user: ',
  choices: [

  ],
}

con.query("SELECT DISTINCT IdUser FROM preferiti", (error, result) => {
  if (error) throw error
  options.choices = result.map(el => el.IdUser)
  inquirer
    .prompt([
      options
    ])
    .then((answers) => {
      let UserId = answers.commands
      con.query("SELECT * FROM preferiti WHERE IdUser = ?", [UserId], (error, result) => {
        if (error) throw error
        console.table(result)
      })
    });
})

app.route('/favourites')
  .get((req, res) => { //query string
    res.render("favourites", {
      items: []
    })
  })
  .post((req, res) => { //query string

    if(req.body.UserId == undefined || req.body.UserId == null || req.body.UserId == "" ){
      res.render("favourites", {
        items: []
      })
    }
    con.query("SELECT * FROM preferiti WHERE IdUser = ?", [req.body.UserId], async (error, results, fields) => {
      if (error) throw error;
      let movies = [];
      results.forEach(async (filmid,index) => {
        const result = await axios.get("https://imdb-api.com/en/API/Title/k_9bhbsg3b/" + filmid.IdFilm)
        let film = result.data
        const trailerSearch = await axios.get("https://imdb-api.com/en/API/YouTubeTrailer/k_9bhbsg3b/" + filmid.IdFilm)
        let trailer = trailerSearch.data
        //Cerca il sito ufficiale
        const officialWeb = await axios.get("https://imdb-api.com/en/API/ExternalSites/k_9bhbsg3b/" + filmid.IdFilm)
        let website = officialWeb.data

        let movie = {
          titolo: film.fullTitle, 
          image: film.image,
          genere: film.genres,
          release: film.releaseDate,
          runtime: film.runtimeStr,
          trailer: trailer.videoUrl,
          website: website.officialWebsite
        } 
        movies.push(movie) 
        if(index == results.length -1){
          res.render("favourites", { items: movies });
        }          
      })     
    });
  })
  app.listen(3000, () => {
    console.log('Server accessible via: http://localhost:3000/favourites');
});
