import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;

// YOUR NEW HATCHES CHANNEL
const HATCHES_CHANNEL_ID = process.env.HATCHES_CHANNEL_ID || "1449428623315435610";

const POST_INTERVAL_MINUTES = parseInt(process.env.POST_INTERVAL_MINUTES || "5", 10);

const CLICK_EMOJI = process.env.CLICK_EMOJI || "<:ClickIcon:1467297249103974683>";
const TOKEN_EMOJI = process.env.TOKEN_EMOJI || "<:token:1467296721502736384>";

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

/**
 * TapSim endpoints return different shapes. This tries many common ones.
 */
function extractList(data) {
  if (!data) return [];

  if (Array.isArray(data)) return data;

  if (Array.isArray(data.rows)) return data.rows;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.payload)) return data.payload;

  // sometimes nested
  if (data.ads && Array.isArray(data.ads)) return data.ads;
  if (data.snipes && Array.isArray(data.snipes)) return data.snipes;
  if (data.enchants && Array.isArray(data.enchants)) return data.enchants;
  if (data.eggs && Array.isArray(data.eggs)) return data.eggs;

  // last-resort: first array-like value in the object
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
  // keep sci notation if API returns it
  return String(n);
}

// --------------------
// ENDPOINTS
// --------------------
const endpoints = {
  // eggs / hatches
  eggs: `${API_BASE}/eggs?sort=price&order=desc&limit=100`,

  // IMPORTANT: values were failing because /items shape differs; sorting helps + returns newest
  items: `${API_BASE}/items?sort=updated&order=desc&limit=300`,

  // top values
  topvalues: `${API_BASE}/items?type=Pet&sort=value&order=desc&page=1&limit=50`,

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

  // !help
  if (cmd === "help") {
    const embed = new EmbedBuilder()
      .setTitle("📌 Tap Sim Bot Commands")
      .setDescription(
        [
          "`!hatches` — show eggs/hatches",
          "`!hatches <egg>` — search eggs",
          "`!value <name>` — value lookup",
          "`!search <name>` — search items",
          "`!topvalues` — top 10 values",
          "`!enchants` — show enchants",
          "`!snipes` — show snipes",
          "`!ads` — show trade ads"
        ].join("\n")
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // !hatches
  if (cmd === "hatches") {
    const data = await getJSON(endpoints.eggs);
    const eggs = extractList(data);

    if (!eggs.length) return message.reply("❌ API error fetching hatches.");

    const q = norm(query);
    const filtered = q ? eggs.filter(e => norm(e.name).includes(q)) : eggs;
    const top = filtered.slice(0, 10);

    if (!top.length) return message.reply("❌ No eggs found.");

    const embed = new EmbedBuilder()
      .setTitle("🥚 Tap Sim — Eggs / Hatches")
      .setDescription(
        top.map(e => `**${e.name}** — ${CLICK_EMOJI} **${fmtNum(e.price)}**`).join("\n")
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // !topvalues
  if (cmd === "topvalues") {
    const data = await getJSON(endpoints.topvalues);
    const items = extractList(data);

    if (!items.length) return message.reply("❌ API error fetching top values.");

    const top = items.slice(0, 10);

    const embed = new EmbedBuilder()
      .setTitle("🏆 Tap Sim — Top 10 Values")
      .setDescription(
        top.map((p, i) => {
          const name = p.name || p.displayName || "Unknown";
          return `**${i + 1}. ${name}** — ${CLICK_EMOJI} **${fmtNum(p.value)}**`;
        }).join("\n")
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // !value
  if (cmd === "value") {
    if (!query) return message.reply("❌ Use: `!value <name>`");

    const data = await getJSON(endpoints.items);
    const items = extractList(data);

    if (!items.length) return message.reply("❌ API error fetching items.");

    const q = norm(query);

    // exact match first, then contains
    let found =
      items.find(i => norm(i.name) === q) ||
      items.find(i => norm(i.displayName) === q) ||
      items.find(i => norm(i.name).includes(q)) ||
      items.find(i => norm(i.displayName).includes(q));

    if (!found) return message.reply(`❌ No match found for **${query}**.`);

    const name = found.name || found.displayName || "Unknown Item";
    const value = found.value ?? found.price ?? found.cost ?? "N/A";
    const exist = found.exist ?? found.exists ?? "N/A";

    const embed = new EmbedBuilder()
      .setTitle(`💎 Value — ${name}`)
      .setDescription(`Value: ${CLICK_EMOJI} **${fmtNum(value)}**`)
      .addFields({ name: "Exist", value: String(exist), inline: true })
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // !search
  if (cmd === "search") {
    if (!query) return message.reply("❌ Use: `!search <name>`");

    const data = await getJSON(endpoints.items);
    const items = extractList(data);

    if (!items.length) return message.reply("❌ API error fetching items.");

    const q = norm(query);

    const matches = items
      .filter(i => norm(i.name).includes(q) || norm(i.displayName).includes(q))
      .slice(0, 10);

    if (!matches.length) return message.reply(`❌ No match found for **${query}**.`);

    const embed = new EmbedBuilder()
      .setTitle(`🔎 Search — ${query}`)
      .setDescription(
        matches.map(m => {
          const name = m.name || m.displayName || "Unknown";
          const value = m.value ?? "N/A";
          return `**${name}** — ${CLICK_EMOJI} **${fmtNum(value)}**`;
        }).join("\n")
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // !enchants
  if (cmd === "enchants") {
    const data = await getJSON(endpoints.enchants);
    const enchants = extractList(data);

    if (!enchants.length) return message.reply("❌ API error fetching enchants.");

    const top = enchants.slice(0, 10);

    const embed = new EmbedBuilder()
      .setTitle("✨ Tap Sim — Enchants")
      .setDescription(
        top.map(e => {
          const name = e.name || e.enchantName || "Unknown";
          const value = e.value ?? e.price ?? "N/A";
          return `**${name}** — ${CLICK_EMOJI} **${fmtNum(value)}**`;
        }).join("\n")
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // !snipes
  if (cmd === "snipes") {
    const data = await getJSON(endpoints.snipes);
    const snipes = extractList(data);

    if (!snipes.length) return message.reply("❌ API error fetching snipes.");

    const top = snipes.slice(0, 5);

    const embed = new EmbedBuilder()
      .setTitle("🎯 Tap Sim — Plaza Snipes")
      .setDescription(
        top.map(s => {
          const name = s.itemName || s.name || "Unknown";
          const price = s.price ?? "N/A";
          const percent = s.percent ?? s.percentOff ?? "N/A";
          return `**${name}**\nPrice: ${CLICK_EMOJI} **${fmtNum(price)}**\nPercent: **${percent}%**`;
        }).join("\n\n")
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // !ads
  if (cmd === "ads") {
    const data = await getJSON(endpoints.ads);
    const ads = extractList(data);

    if (!ads.length) return message.reply("❌ API error fetching ads.");

    const top = ads.slice(0, 3);

    const embed = new EmbedBuilder()
      .setTitle("📢 Tap Sim — Latest Trade Ads")
      .setDescription(
        top.map(ad => {
          const offering = ad.offering ?? "N/A";
          const wanting = ad.wanting ?? "N/A";
          return `**Offering:** ${offering}\n**Wanting:** ${wanting}`;
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
  if (!channel?.isTextBased()) {
    console.log("Hatches channel not found or not text-based:", HATCHES_CHANNEL_ID);
    return;
  }

  const data = await getJSON(endpoints.eggs);
  const eggs = extractList(data).slice(0, 10);
  if (!eggs.length) return;

  const embed = new EmbedBuilder()
    .setTitle("🥚 Tap Sim — Auto Hatch Update")
    .setDescription(
      eggs.map(e => `**${e.name}** — ${CLICK_EMOJI} **${fmtNum(e.price)}**`).join("\n")
    )
    .setFooter({ text: `Updated every ${POST_INTERVAL_MINUTES} minutes | tapsim.gg` });

  channel.send({ embeds: [embed] });
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  autoPostHatches();
  setInterval(autoPostHatches, POST_INTERVAL_MINUTES * 60 * 1000);
});

client.login(TOKEN);
