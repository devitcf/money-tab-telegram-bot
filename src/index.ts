import TelegramBot = require("node-telegram-bot-api");
import { incorrectUsageMsg, logErrorMessage } from "./helpers/commands";
import { tokenSession } from "./session/tokenSession";
import { courseSession } from "./session/courseSession";
import { QueryType, Command, ErrorType } from "./types";
import { CronJob } from "cron";
import { getVideosByUsername, updateCourseByUsername } from "./helpers/courses";

require("dotenv").config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN ?? "", { polling: true });

// Start command
bot.onText(/\/start/, async (msg) => {
  const { first_name: name, username } = msg.chat;

  if (!tokenSession.tokenByUser[username!]) {
    bot.sendMessage(msg.chat.id, `Hi ${name}`).catch((e) => logErrorMessage(e));
    bot
      .sendMessage(
        msg.chat.id,
        "In order to use this bot, please provide your access token by the command `/accesstoken YOUR_ACCESS_TOKEN_HERE`",
        { parse_mode: "Markdown" }
      )
      .catch((e) => logErrorMessage(e));
  }
});

// Handle /accessToken command
bot.onText(/\/accesstoken(.*)/, (msg, match) => {
  if (!match?.[1]) {
    bot
      .sendMessage(msg.chat.id, incorrectUsageMsg(Command.UPDATE_ACCESS_TOKEN), {
        parse_mode: "Markdown",
      })
      .catch((e: ErrorType) => logErrorMessage(e));
    return;
  }

  const accessToken = match[1].replace(" ", "");
  tokenSession.updateAccessToken(msg.chat.username!, accessToken);

  bot.sendMessage(msg.chat.id, "Access token saved.").catch((e) => logErrorMessage(e));
});

// Handle /refreshToken command
bot.onText(/\/refreshtoken(.*)/, (msg, match) => {
  if (!match?.[1]) {
    bot
      .sendMessage(msg.chat.id, incorrectUsageMsg(Command.UPDATE_REFRESH_TOKEN), {
        parse_mode: "Markdown",
      })
      .catch((e: ErrorType) => logErrorMessage(e));
    return;
  }

  const refreshToken = match[1].replace(" ", "");

  tokenSession.updateRefreshToken(msg.chat.username!, refreshToken);

  bot.sendMessage(msg.chat.id, "Refresh token saved.").catch((e) => logErrorMessage(e));
});

// Handle /course command
bot.onText(/\/course/, async (msg) => {
  const {
    chat: { username, id },
  } = msg;
  if (username) {
    await updateCourseByUsername(username, bot, id);
  }
});

// Handle /logout command
bot.onText(/\/logout/, async (msg) => {
  const {
    chat: { username, id },
  } = msg;
  if (username) {
    courseSession.courseByUser[username]?.forEach((course) => course.job?.stop());
    delete courseSession.courseByUser[username];
    delete tokenSession.tokenByUser[username];
  }
});

// Handle callback query
bot.on("callback_query", async (query) => {
  const { data, message: { chat } = {} } = query;
  if (!chat || !data) {
    return;
  }
  const { id: chatId, username } = chat;
  const [queryType, ...values] = data.split("|");

  switch (queryType) {
    case QueryType.VIEW_VIDEO: {
      const [urlKey, topicId] = values;
      await getVideosByUsername(username!, topicId, urlKey, bot, chatId);
      break;
    }
    case QueryType.SET_PUSHER_JOB: {
      const [chatId, urlKey] = values;
      const job = CronJob.from({
        cronTime: `1 ${urlKey[0]} * * * *`,
        onTick: async () => {
          const courses = await updateCourseByUsername(username!);
          const topicId = courses?.find((course) => course.url_key === urlKey)?.latest_topic_id;
          if (topicId) {
            await getVideosByUsername(username!, topicId, urlKey, bot, Number(chatId));
          }
        },
        start: true,
        timeZone: "Asia/Hong_Kong",
      });

      const course = courseSession.courseByUser[username!]?.find((course) => course.url_key === urlKey);
      if (course) {
        course.job = job;
      }
      break;
    }
    case QueryType.CLEAR_PUSHER_JOB: {
      const [urlKey] = values;
      const course = courseSession.courseByUser[username!]?.find((course) => course.url_key === urlKey);
      if (course) {
        course.job?.stop();
        course.job = undefined;
      }
      break;
    }
  }
});
