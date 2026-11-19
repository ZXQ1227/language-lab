import brand from "./locales/brand.json";
import enCommon from "./locales/en-US/common.json";
import enCourse from "./locales/en-US/course.json";
import enDashboard from "./locales/en-US/dashboard.json";
import enMemory from "./locales/en-US/memory.json";
import enReports from "./locales/en-US/reports.json";
import enReview from "./locales/en-US/review.json";
import enScenarios from "./locales/en-US/scenarios.json";
import enSettings from "./locales/en-US/settings.json";
import enSpeech from "./locales/en-US/speech.json";
import enTraining from "./locales/en-US/training.json";
import zhCNCommon from "./locales/zh-CN/common.json";
import zhCNCourse from "./locales/zh-CN/course.json";
import zhCNDashboard from "./locales/zh-CN/dashboard.json";
import zhCNMemory from "./locales/zh-CN/memory.json";
import zhCNReports from "./locales/zh-CN/reports.json";
import zhCNReview from "./locales/zh-CN/review.json";
import zhCNScenarios from "./locales/zh-CN/scenarios.json";
import zhCNSettings from "./locales/zh-CN/settings.json";
import zhCNSpeech from "./locales/zh-CN/speech.json";
import zhCNTraining from "./locales/zh-CN/training.json";
import zhTWCommon from "./locales/zh-TW/common.json";
import zhTWCourse from "./locales/zh-TW/course.json";
import zhTWDashboard from "./locales/zh-TW/dashboard.json";
import zhTWMemory from "./locales/zh-TW/memory.json";
import zhTWReports from "./locales/zh-TW/reports.json";
import zhTWReview from "./locales/zh-TW/review.json";
import zhTWScenarios from "./locales/zh-TW/scenarios.json";
import zhTWSettings from "./locales/zh-TW/settings.json";
import zhTWSpeech from "./locales/zh-TW/speech.json";
import zhTWTraining from "./locales/zh-TW/training.json";

export const resources = {
  "en-US": {
    common: { ...enCommon, brand },
    course: enCourse,
    dashboard: enDashboard,
    memory: enMemory,
    reports: enReports,
    review: enReview,
    scenarios: enScenarios,
    settings: enSettings,
    speech: enSpeech,
    training: enTraining,
  },
  "zh-CN": {
    common: { ...zhCNCommon, brand },
    course: zhCNCourse,
    dashboard: zhCNDashboard,
    memory: zhCNMemory,
    reports: zhCNReports,
    review: zhCNReview,
    scenarios: zhCNScenarios,
    settings: zhCNSettings,
    speech: zhCNSpeech,
    training: zhCNTraining,
  },
  "zh-TW": {
    common: { ...zhTWCommon, brand },
    course: zhTWCourse,
    dashboard: zhTWDashboard,
    memory: zhTWMemory,
    reports: zhTWReports,
    review: zhTWReview,
    scenarios: zhTWScenarios,
    settings: zhTWSettings,
    speech: zhTWSpeech,
    training: zhTWTraining,
  },
} as const;
