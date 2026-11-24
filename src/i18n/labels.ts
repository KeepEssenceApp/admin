// What the codes stored in the sign-up list mean. The Chinese map is the same as LABELS in the
// landing page's worker.js (tests/waitlist.test.ts compares them when the site repo is next to
// this one); the English map is its translation for the English interface.

type Kind = "storage" | "sources" | "assistant" | "mode" | "lang";
type Maps = Record<Kind, Record<string, string>>;

export const LABELS: Maps = {
  storage: {
    readwise: "Readwise", raindrop: "Raindrop", instapaper: "Instapaper / Pocket", notion: "Notion / Obsidian",
    tabs: "浏览器标签页", wechat: "微信文件传输助手", other: "其他",
  },
  sources: {
    "wechat-mp": "微信公众号", xiaohongshu: "小红书", zhihu: "知乎", bilibili: "B 站", jike: "即刻", weibo: "微博",
    substack: "Substack", linkedin: "LinkedIn", medium: "Medium", x: "X / Twitter", youtube: "YouTube",
    reddit: "Reddit", hn: "Hacker News", github: "GitHub", rss: "RSS", newsletter: "邮件订阅", podcast: "播客", other: "其他",
  },
  assistant: { claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini", "self-hosted-agent": "自托管 Agent", none: "暂时没有" },
  mode: { "own-assistant": "接自己的助手", "built-in-agent": "用系统自带的" },
  lang: { "zh-Hans": "中文", en: "英文" },
};

export const LABELS_EN: Maps = {
  storage: { ...LABELS.storage, tabs: "Browser tabs", wechat: "WeChat File Transfer", other: "Other" },
  sources: {
    ...LABELS.sources,
    "wechat-mp": "WeChat Official Accounts", xiaohongshu: "Xiaohongshu", zhihu: "Zhihu", bilibili: "Bilibili", jike: "Jike", weibo: "Weibo",
    newsletter: "Newsletters", podcast: "Podcasts", other: "Other",
  },
  assistant: { ...LABELS.assistant, "self-hosted-agent": "Self-hosted agent", none: "None yet" },
  mode: { "own-assistant": "Connect their own assistant", "built-in-agent": "Use the built-in one" },
  lang: { "zh-Hans": "Chinese", en: "English" },
};

const maps = (lang: "zh" | "en") => (lang === "en" ? LABELS_EN : LABELS);

export const label = (kind: Kind, code: string, lang: "zh" | "en" = "zh") => maps(lang)[kind][code] || code;

/** A comma separated list of codes as words; "other" carries what the person typed. */
export const labels = (kind: Kind, codes: string, other: string, lang: "zh" | "en" = "zh") =>
  String(codes || "").split(",").filter(Boolean)
    .map((code) => (code === "other" && other ? `${lang === "en" ? "Other: " : "其他："}${other}` : label(kind, code, lang)))
    .join(lang === "en" ? ", " : "、");

/** The columns of the downloaded file, as in the landing page's own export. */
export const CSV_HEAD = ["报名时间(UTC)", "邮箱", "页面", "东西堆在哪儿", "从哪里收集", "常用助手", "想用的方式", "最头疼的", "邀请时间"];
