const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();
const Pool = require("pg").Pool;

const pool = new Pool({
  // connectionString,
  host: process.env.HOST,
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: process.env.PASSWORD,
});

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

const corsOptions = {
  origin: "*",
  credintials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));

const poll = async () => {
  try {
    console.log("Polling");
    const dbresponse = await pool.query("SELECT * FROM info");
    const summoners = dbresponse.rows;
    // console.log(summoners);
    for (let i = 0; i < summoners.length; i++) {
      let genReigion = "americas";
      if (summoners[i].reigion === "kr") {
        genReigion = "asia";
      } else if (summoners[i].reigion === "euw1") {
        genReigion = "europe";
      }
      // check for new game
      const url =
        "https://" +
        genReigion +
        ".api.riotgames.com/lol/match/v5/matches/by-puuid/" +
        summoners[i].puuid +
        "/ids?queue=420&start=0&count=1" +
        "&api_key=" +
        process.env.RIOT_API_KEY;

      const response = await axios.get(url);
      const data = response.data;
      // console.log(data)

      // if new game, then get match info
      if (summoners[i].recent !== data[0]) {
        console.log(`${summoners[i].description} played a new game!`);
        const url =
          "https://" +
          genReigion +
          ".api.riotgames.com/lol/match/v5/matches/" +
          data[0] +
          "?api_key=" +
          process.env.RIOT_API_KEY;

        const response = await axios.get(url);
        const matchdata = response.data.info.participants;
        const gameStart = response.data.info.gameStartTimestamp;
        let win = false;
        let time = 0;

        for (let j = 0; j < matchdata.length; j++) {
          if (matchdata[j].summonerName === summoners[i].description) {
            win = matchdata[j].win;
            time = matchdata[j].timePlayed;
          }
        }

        const rankurl =
          "https://" +
          summoners[i].reigion +
          ".api.riotgames.com/lol/league/v4/entries/by-summoner/" +
          summoners[i].id +
          "?api_key=" +
          process.env.RIOT_API_KEY;

        const rankresponse = await axios.get(rankurl);
        const rankdata = rankresponse.data;

        let fullrank = "";
        let tier = "";
        let lp = 0;
        let rank = "";

        for (let k = 0; k < rankdata.length; k++) {
          if (rankdata[k].queueType === "RANKED_SOLO_5x5") {
            tier = rankdata[k].tier;
            rank = rankdata[k].rank;
            lp = rankdata[k].leaguePoints;
            fullrank = tier + " " + rank;
          }
        }

        const oldRank = summoners[i].rank;
        const oldTier = summoners[i].tier;

        let lpChange = 0;

        if (tier == oldTier && rank == oldRank) {
          lpChange = lp - summoners[i].lp;
        }

        const summonerName = summoners[i].description;

        const newMatch = await pool.query(
          "INSERT INTO matches (winloss, rank, summoner, lp, gamestart, length, lpchange) VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *",
          [win, fullrank, summonerName, lp, gameStart, time, lpChange]
        );

        // need to change summoners recent to new match and update rank
        await pool.query("UPDATE info SET recent = $1 WHERE description = $2", [
          data[0],
          summoners[i].description,
        ]);
        await pool.query("UPDATE info SET rank = $1 WHERE description = $2", [
          rank,
          summoners[i].description,
        ]);
        await pool.query("UPDATE info SET lp = $1 WHERE description = $2", [
          lp,
          summoners[i].description,
        ]);
        await pool.query("UPDATE info SET tier = $1 WHERE description = $2", [
          tier,
          summoners[i].description,
        ]);

        console.log(newMatch.rows[0]);
      }
    }
  } catch (error) {
    console.log(error.message);
  }
};

poll();

setInterval(poll, 60000);

const port = process.env.PORT || 3001;
const server = app.listen(port, () => {
  console.log(`server is running on port ${port}`);
});
