import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;
const HATCHES_CHANNEL_ID = process.env.HATCHES_CHANNEL_ID || "1449428623315435610";
const POST_INTERVAL_MINUTES = parseInt(process.env.POST_INTERVAL_MINUTES || "5", 10);

const CLICK_EMOJI = process.env.CLICK_EMOJI || "<:ClickIcon:1467297249103974683>"; // Taps
const TOKEN_EMOJI = process.env.TOKEN_EMOJI || "<:token:1467296721502736384>";     // Tokens

const API_BASE = "https://api.tapsim.gg/api/tapsim";
const WEBSITE_ORIGIN = "https://www.tapsim.gg";

if (!TOKEN) throw new Error("Missing DISCORD_TOKEN");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// --------------------
// HELPERS
// --------------------
async function getJSON(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Origin": WEBSITE_ORIGIN,
        "Referer": WEBSITE_ORIGIN + "/",
        "User-Agent": "Mozilla/5.0 (compatible; TapSimDiscordBot/1.0)"
      }
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.log("API FAIL", res.status, url, text.slice(0, 250));
      return null;
    }

    return await res.json();
  } catch (e) {
    console.log("FETCH ERROR", url, e?.message || e);
    return null;
  }
}

function extractList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;

  if (Array.isArray(data.rows)) return data.rows;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.payload)) return data.payload;

  // fallback
  if (typeof data === "object") {
    for (const v of Object.values(data)) {
      if (Array.isArray(v)) return v;
    }
  }

  return [];
}

function norm(s) {
  return String(s || "").toLowerCase().trim();
}

function fmtNum(n) {
  if (n === null || n === undefined) return "N/A";
  return String(n);
}

// finds token value no matter what key the API uses
function getTokenValue(item) {
  return (
    item.value ??
    item.tokenValue ??
    item.tokens ??
    item.valueTokens ??
    item.rap ??
    item.priceTokens ??
    item.token_price ??
    item.token_price_value ??
    null
  );
}

// finds tap price
function getTapPrice(item) {
  return (
    item.price ??
    item.tapPrice ??
    item.taps ??
    item.cost ??
    null
  );
}

function getItemName(item) {
  return item.name || item.itemName || item.displayName || item.petName || "Unknown";
}

// format trade ads offering/wanting arrays
function formatTradeList(list) {
  if (!list) return "N/A";

  if (typeof list === "string") return list;

  if (Array.isArray(list)) {
    if (list.length === 0) return "None";

    return list.map(x => {
      if (typeof x === "string") return x;

      const name = x.name || x.itemName || x.petName || "Unknown";
      const amount = x.amount || x.qty || x.quantity || 1;
      return `${name} x${amount}`;
    }).join(", ");
  }

  if (typeof list === "object") {
    const name = list.name || list.itemName || "Unknown";
    const amount = list.amount || list.qty || list.quantity || 1;
    return `${name} x${amount}`;
  }

  return "N/A";
}

// --------------------
// ENDPOINTS
// --------------------
const endpoints = {
  eggs: `${API_BASE}/eggs?sort=price&order=desc&limit=100`,
  items: `${API_BASE}/items?sort=updated&order=desc&limit=400`,
  topvalues: `${API_BASE}/items?type=Pet&sort=value&order=desc&page=1&limit=100`,
  enchants: `${API_BASE}/plaza/enchants`,
  snipes: `${API_BASE}/plaza/snipes?basis=value&maxPercent=80`,
  ads: `${API_BASE}/ads?page=1&limit=20`
};

// --------------------
// COMMANDS
// --------------------
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!")) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const cmd = (args.shift() || "").toLowerCase();
  const query = args.join(" ").trim();

  // HELP
  if (cmd === "help") {
    const embed = new EmbedBuilder()
      .setTitle("📌 Tap Sim Bot Commands")
      .setDescription(
        [
          "`!hatches` — show eggs/hatches (TAPS)",
          "`!hatches <egg>` — search eggs",
          "`!value <name>` — value lookup (TOKENS)",
          "`!search <name>` — search pets/items (TOKENS)",
          "`!topvalues` — top 10 values (TOKENS)",
          "`!enchants` — enchants list",
          "`!snipes` — plaza snipes",
          "`!ads` — trade ads"
        ].join("\n")
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // HATCHES
  if (cmd === "hatches") {
    const data = await getJSON(endpoints.eggs);
    const eggs = extractList(data);

    if (!eggs.length) return message.reply("❌ API error fetching hatches.");

    const q = norm(query);
    const filtered = q ? eggs.filter(e => norm(getItemName(e)).includes(q)) : eggs;
    const top = filtered.slice(0, 10);

    if (!top.length) return message.reply("❌ No eggs found.");

    const embed = new EmbedBuilder()
      .setTitle("🥚 Tap Sim — Eggs / Hatches")
      .setDescription(
        top.map(e => {
          const name = getItemName(e);
          const price = getTapPrice(e);
          return `**${name}** — ${CLICK_EMOJI} **${fmtNum(price)}**`;
        }).join("\n")
      )
      .setFooter({ text: "Currency: TAPS | tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // VALUE
  if (cmd === "value") {
    if (!query) return message.reply("❌ Use: `!value <name>`");

    const data = await getJSON(endpoints.items);
    const items = extractList(data);

    if (!items.length) return message.reply("❌ API error fetching items.");

    const q = norm(query);

    const found =
      items.find(i => norm(getItemName(i)) === q) ||
      items.find(i => norm(getItemName(i)).includes(q));

    if (!found) return message.reply(`❌ No match found for **${query}**.`);

    const name = getItemName(found);
    const tokenValue = getTokenValue(found);
    const exist = found.exist ?? found.exists ?? found.totalExist ?? "N/A";

    const embed = new EmbedBuilder()
      .setTitle(`💎 Value — ${name}`)
      .setDescription(`Value: ${TOKEN_EMOJI} **${fmtNum(tokenValue)}**`)
      .addFields({ name: "Exist", value: String(exist), inline: true })
      .setFooter({ text: "Currency: TOKENS | tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // SEARCH
  if (cmd === "search") {
    if (!query) return message.reply("❌ Use: `!search <name>`");

    const data = await getJSON(endpoints.items);
    const items = extractList(data);

    if (!items.length) return message.reply("❌ API error fetching items.");

    const q = norm(query);

    const matches = items
      .filter(i => norm(getItemName(i)).includes(q))
      .slice(0, 10);

    if (!matches.length) return message.reply(`❌ No match found for **${query}**.`);

    const embed = new EmbedBuilder()
      .setTitle(`🔎 Search — ${query}`)
      .setDescription(
        matches.map(m => {
          const name = getItemName(m);
          const tokenValue = getTokenValue(m);
          return `**${name}** — ${TOKEN_EMOJI} **${fmtNum(tokenValue)}**`;
        }).join("\n")
      )
      .setFooter({ text: "Currency: TOKENS | tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // TOPVALUES
  if (cmd === "topvalues") {
    const data = await getJSON(endpoints.topvalues);
    const items = extractList(data);

    if (!items.length) return message.reply("❌ API error fetching top values.");

    const top = items.slice(0, 10);

    const embed = new EmbedBuilder()
      .setTitle("🏆 Tap Sim — Top 10 Values")
      .setDescription(
        top.map((p, i) => {
          const name = getItemName(p);
          const tokenValue = getTokenValue(p);
          return `**${i + 1}. ${name}** — ${TOKEN_EMOJI} **${fmtNum(tokenValue)}**`;
        }).join("\n")
      )
      .setFooter({ text: "Currency: TOKENS | tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // ENCHANTS
  if (cmd === "enchants") {
    const data = await getJSON(endpoints.enchants);
    const enchants = extractList(data);

    if (!enchants.length) return message.reply("❌ API error fetching enchants.");

    const top = enchants.slice(0, 10);

    const embed = new EmbedBuilder()
      .setTitle("✨ Tap Sim — Enchants")
      .setDescription(
        top.map(e => {
          const name = getItemName(e);
          const tokenValue = getTokenValue(e);
          return `**${name}** — ${TOKEN_EMOJI} **${fmtNum(tokenValue)}**`;
        }).join("\n")
      )
      .setFooter({ text: "Currency: TOKENS | tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // SNIPES
  if (cmd === "snipes") {
    const data = await getJSON(endpoints.snipes);
    const snipes = extractList(data);

    if (!snipes.length) return message.reply("❌ API error fetching snipes.");

    const top = snipes.slice(0, 5);

    const embed = new EmbedBuilder()
      .setTitle("🎯 Tap Sim — Plaza Snipes")
      .setDescription(
        top.map(s => {
          const name = getItemName(s);
          const price = s.price ?? "N/A";
          const percent = s.percent ?? s.percentOff ?? "N/A";
          return `**${name}**\nPrice: ${TOKEN_EMOJI} **${fmtNum(price)}**\nPercent: **${percent}%**`;
        }).join("\n\n")
      )
      .setFooter({ text: "Currency: TOKENS | tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // ADS
  if (cmd === "ads") {
    const data = await getJSON(endpoints.ads);
    const ads = extractList(data);

    if (!ads.length) return message.reply("❌ API error fetching ads.");

    const top = ads.slice(0, 3);

    const embed = new EmbedBuilder()
      .setTitle("📢 Tap Sim — Latest Trade Ads")
      .setDescription(
        top.map(ad => {
          const offering = formatTradeList(ad.offering);
          const wanting = formatTradeList(ad.wanting);
          const tokens = ad.tokens ?? ad.price ?? null;

          return `**Offering:** ${offering}\n**Wanting:** ${wanting}${tokens ? `\n**Tokens:** ${TOKEN_EMOJI} ${fmtNum(tokens)}` : ""}`;
        }).join("\n\n")
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }
});

// --------------------
// AUTO POST HATCHES
// --------------------
async function autoPostHatches() {
  const channel = await client.channels.fetch(HATCHES_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) return;

  const data = await getJSON(endpoints.eggs);
  const eggs = extractList(data).slice(0, 10);

  if (!eggs.length) return;

  const embed = new EmbedBuilder()
    .setTitle("🥚 Tap Sim — Auto Hatch Update")
    .setDescription(
      eggs.map(e => {
        const name = getItemName(e);
        const price = getTapPrice(e);
        return `**${name}** — ${CLICK_EMOJI} **${fmtNum(price)}**`;
      }).join("\n")
    )
    .setFooter({ text: `Currency: TAPS | Every ${POST_INTERVAL_MINUTES} min | tapsim.gg` });

  channel.send({ embeds: [embed] });
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  autoPostHatches();
  setInterval(autoPostHatches, POST_INTERVAL_MINUTES * 60 * 1000);
});

client.login(TOKEN);
