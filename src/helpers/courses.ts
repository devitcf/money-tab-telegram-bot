import TelegramBot = require("node-telegram-bot-api");
import { tokenSession } from "../session/tokenSession";
import { getCourses, getPaidVideo } from "../api";
import { courseSession } from "../session/courseSession";
import wordings from "./wordings";
import { ErrorType, QueryType, UserCourse, Video } from "../types";
import { logErrorMessage } from "./commands";
import { getSetSubscriptionKeyboard } from "./inlineKeyboards";

export const updateCourseByUsername = async (username: string, bot?: TelegramBot, chatId?: number) => {
  const token = tokenSession.getToken(username);
  if (!token || !token?.accessToken) {
    if (bot && chatId) {
      bot
        .sendMessage(chatId, wordings.MISSING_TOKEN_MSG, {
          parse_mode: "Markdown",
        })
        .catch((e: ErrorType) => logErrorMessage(e));
      return;
    }
  }

  // Fetch new courses
  let courses: UserCourse[] = [];
  try {
    const res = await getCourses(username);
    courses = res.value ?? [];
  } catch (e: unknown) {
    console.error(wordings.ERROR_FETCHING_API);
    if (bot && chatId) {
      bot?.sendMessage(chatId, wordings.ERROR_FETCHING_API).catch((e) => logErrorMessage(e));
    }
  }

  await courseSession.updateCourseByUser(username, courses);

  if (bot && chatId) {
    bot
      .sendMessage(chatId, wordings.SELECT_YOUR_COURSE, {
        reply_markup: {
          inline_keyboard: [
            courses.map((course) => ({
              text: course.title,
              callback_data: `${QueryType.VIEW_VIDEO}|${course.url_key}|${course.latest_topic_id}`,
            })),
          ],
        },
      })
      .catch((e: ErrorType) => logErrorMessage(e));
  }
  return courses;
};

export const getVideosByUsername = async (
  username: string,
  topicId: string,
  urlKey?: string,
  bot?: TelegramBot,
  chatId?: number
) => {
  let videos: Video[] = [];
  try {
    const res = await getPaidVideo(username, topicId);
    videos = res.videos ?? [];
  } catch (e: unknown) {
    console.error(wordings.ERROR_FETCHING_API);
    if (bot && chatId) {
      bot?.sendMessage(chatId, wordings.ERROR_FETCHING_API).catch((e) => logErrorMessage(e));
    }
  }

  if (!videos || videos.length === 0) {
    if (bot && chatId) {
      bot?.sendMessage(chatId, wordings.NO_VIDEOS_FOUND).catch((e) => logErrorMessage(e));
    }
    return;
  }

  let responseText = "";
  for (const video of videos) {
    responseText += `${video.title} \n\n ${video.youtube?.video_url}`;
  }

  let course: UserCourse | undefined;
  if (urlKey && bot && chatId) {
    course = courseSession.coursesByUser[username!]?.find((course) => course.url_key === urlKey);
    const inlineKeyboard = course?.job ? [] : [getSetSubscriptionKeyboard(chatId, urlKey)];

    bot
      .sendMessage(chatId, responseText, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
      })
      .catch((e) => logErrorMessage(e));
  }
  return responseText;
};
