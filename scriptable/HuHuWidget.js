// 乎乎 Vibe Scriptable 桌面小组件
// 首次请在 Scriptable App 内运行脚本，按提示配置 API 地址和 Widget Token。

const API_PATH = "/api/widget/state";
const TOKEN_KEY = "huhu-vibe-widget-token";
const CACHE_FOLDER = "huhu-vibe-widget";
const STATE_LABELS = {
  angry: "生气",
  happy: "开心",
  comfortable: "舒服",
  sleeping: "睡觉",
};

const fm = FileManager.local();
const cacheDirectory = fm.joinPath(fm.cacheDirectory(), CACHE_FOLDER);
if (!fm.fileExists(cacheDirectory)) fm.createDirectory(cacheDirectory, true);
const settingsPath = fm.joinPath(cacheDirectory, "settings.json");
const statePath = fm.joinPath(cacheDirectory, "last-state.json");

function readSettings() {
  if (!fm.fileExists(settingsPath)) return null;
  try {
    const saved = JSON.parse(fm.readString(settingsPath));
    const token = Keychain.contains(TOKEN_KEY) ? Keychain.get(TOKEN_KEY) : "";
    if (typeof saved.apiUrl === "string" && token) return { apiUrl: saved.apiUrl, token };
  } catch (_) {}
  return null;
}

async function configure() {
  if (config.runsInWidget) return null;
  const alert = new Alert();
  alert.title = "配置乎乎桌面小组件";
  alert.message = "把管理员页面复制的完整配置粘贴到下方。Widget Token 会保存在 iPhone 钥匙串中。";
  alert.addSecureTextField("粘贴 API 地址和 Widget Token", "");
  alert.addAction("保存配置");
  alert.addCancelAction("取消");
  if (await alert.presentAlert() !== 0) return null;

  const [apiLine, tokenLine] = alert.textFieldValue(0).trim().split(/\s+/);
  const apiUrl = (apiLine ?? "").trim().replace(/\/$/, "");
  const token = (tokenLine ?? "").trim();
  try {
    const parsed = new URL(apiUrl);
    if (parsed.protocol !== "https:" || parsed.pathname !== API_PATH || !/^[a-f0-9]{64}$/i.test(token)) {
      throw new Error("invalid settings");
    }
    Keychain.set(TOKEN_KEY, token);
    fm.writeString(settingsPath, JSON.stringify({ apiUrl: parsed.origin + API_PATH }));
    return { apiUrl: parsed.origin + API_PATH, token };
  } catch (_) {
    const invalid = new Alert();
    invalid.title = "配置格式不正确";
    invalid.message = "请粘贴完整的 HTTPS API 地址（以 /api/widget/state 结尾）和完整的 Widget Token。";
    invalid.addAction("知道了");
    await invalid.presentAlert();
    return null;
  }
}

async function fetchPet(settings) {
  const request = new Request(settings.apiUrl);
  request.method = "GET";
  request.timeoutInterval = 15;
  request.headers = {
    Authorization: `Bearer ${settings.token}`,
    Accept: "application/json",
  };
  const data = await request.loadJSON();
  if (!data || !Object.prototype.hasOwnProperty.call(STATE_LABELS, data.state) ||
      typeof data.petName !== "string" || typeof data.imageUrl !== "string") {
    throw new Error("无法读取乎乎状态");
  }
  const imageUrl = new URL(data.imageUrl);
  if (imageUrl.protocol !== "https:") throw new Error("图片地址不安全");
  const imagePath = fm.joinPath(cacheDirectory, `penguin-${data.state}.png`);
  let petImage = fm.fileExists(imagePath) ? fm.readImage(imagePath) : null;
  if (!petImage) {
    const imageRequest = new Request(imageUrl.href);
    imageRequest.timeoutInterval = 15;
    petImage = await imageRequest.loadImage();
    fm.writeImage(imagePath, petImage);
  }
  const snapshot = {
    petName: data.petName,
    state: data.state,
    version: data.version,
    updatedAt: data.updatedAt,
  };
  fm.writeString(statePath, JSON.stringify(snapshot));
  return { ...snapshot, image: petImage, offline: false };
}

function readCachedPet() {
  if (!fm.fileExists(statePath)) return null;
  try {
    const cached = JSON.parse(fm.readString(statePath));
    const imagePath = fm.joinPath(cacheDirectory, `penguin-${cached.state}.png`);
    if (!STATE_LABELS[cached.state] || !fm.fileExists(imagePath)) return null;
    return { ...cached, image: fm.readImage(imagePath), offline: true };
  } catch (_) {
    return null;
  }
}

function makeWidget(pet, configured) {
  const widget = new ListWidget();
  const gradient = new LinearGradient();
  gradient.colors = [new Color("EAF7FF"), new Color("FFF8E8")];
  gradient.locations = [0, 1];
  widget.backgroundGradient = gradient;
  widget.spacing = 5;
  widget.setPadding(12, 14, 12, 14);
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  if (configured) widget.url = new URL("/viewer", readSettings().apiUrl).href;
  if (!configured) {
    widget.addSpacer();
    const title = widget.addText("先配置乎乎小组件");
    title.font = Font.boldSystemFont(15);
    title.textColor = new Color("405D69");
    title.centerAlignText();
    const hint = widget.addText(config.runsInWidget
      ? "打开 Scriptable，运行 HuHuWidget 并粘贴配置"
      : "请粘贴管理员页面生成的 API 地址和 Token");
    hint.font = Font.systemFont(11);
    hint.textColor = new Color("687F83");
    hint.centerAlignText();
    widget.addSpacer();
    return widget;
  }

  if (!pet) {
    widget.addSpacer();
    const message = widget.addText("暂时无法连接乎乎，稍后会再试");
    message.font = Font.systemFont(13);
    message.textColor = new Color("52666B");
    message.centerAlignText();
    widget.addSpacer();
    return widget;
  }

  const family = config.widgetFamily || "medium";
  const statusText = pet.offline ? `${STATE_LABELS[pet.state]} · 使用缓存` : STATE_LABELS[pet.state];
  if (family === "small") {
    const heading = widget.addText(pet.petName);
    heading.font = Font.boldSystemFont(13);
    heading.textColor = new Color("405D69");
    heading.centerAlignText();
    widget.addSpacer(2);
    const image = widget.addImage(pet.image);
    image.imageSize = new Size(88, 88);
    image.centerAlignImage();
    widget.addSpacer(2);
    const status = widget.addText(statusText);
    status.font = Font.boldSystemFont(14);
    status.textColor = new Color("4F7057");
    status.centerAlignText();
  } else {
    const row = widget.addStack();
    row.centerAlignContent();
    const image = row.addImage(pet.image);
    image.imageSize = new Size(98, 98);
    image.centerAlignImage();
    row.addSpacer(12);
    const details = row.addStack();
    details.layoutVertically();
    details.centerAlignContent();
    const heading = details.addText(pet.petName);
    heading.font = Font.boldSystemFont(19);
    heading.textColor = new Color("405D69");
    details.addSpacer(5);
    const status = details.addText(statusText);
    status.font = Font.boldSystemFont(15);
    status.textColor = new Color("4F7057");
    details.addSpacer(4);
    const note = details.addText(pet.offline ? "网络恢复后自动更新" : "点按查看乎乎");
    note.font = Font.systemFont(11);
    note.textColor = new Color("74878A");
  }
  return widget;
}

let settings = readSettings();
if (!settings) settings = await configure();
let pet = null;
if (settings) {
  try {
    pet = await fetchPet(settings);
  } catch (_) {
    pet = readCachedPet();
  }
}

const widget = makeWidget(pet, Boolean(settings));
Script.setWidget(widget);
if (!config.runsInWidget) await widget.presentMedium();
Script.complete();
