import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;
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

// ---------- helpers ----------
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
      console.log("API FAIL", res.status, url, text.slice(0, 200));
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
  if (Array.isArray(data.eggs)) return data.eggs;
  return [];
}

function norm(s) {
  return String(s || "").toLowerCase().trim();
}

// ---------- API wrappers ----------
const endpoints = {
  eggs: `${API_BASE}/eggs?sort=price&order=desc&limit=100`,
  items: `${API_BASE}/items?limit=300`,
  topvalues: `${API_BASE}/items?type=Pet&sort=value&order=desc&page=1&limit=50`,
  enchants: `${API_BASE}/plaza/enchants`,
  snipes: `${API_BASE}/plaza/snipes?basis=value&maxPercent=80`,
  ads: `${API_BASE}/ads?page=1&limit=20`
};

// ---------- commands ----------
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!")) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const cmd = (args.shift() || "").toLowerCase();

  try {
    if (cmd === "help") {
      return message.channel.send(
        "**Commands:**\n" +
        "`!hatches` / `!hatches <egg>`\n" +
        "`!value <name>`\n" +
        "`!search <name>`\n" +
        "`!topvalues`\n" +
        "`!enchants`\n" +
        "`!snipes`\n" +
        "`!ads`"
      );
    }

    if (cmd === "hatches") {
      const q = norm(args.join(" "));
      const data = await getJSON(endpoints.eggs);
      const eggs = extractList(data);

      if (!eggs.length) return message.reply("❌ API error fetching hatches.");

      const filtered = q ? eggs.filter(e => norm(e.name).includes(q)) : eggs;
      const top = filtered.slice(0, 10);

      if (!top.length) return message.reply("❌ No eggs found.");

      const embed = new EmbedBuilder()
        .setTitle("🥚 Tap Sim — Eggs / Hatches")
        .setDescription(
          top.map(e => `**${e.name}** — ${CLICK_EMOJI} **${e.price ?? "N/A"}**`).join("\n")
        )
        .setFooter({ text: "Source: tapsim.gg" });

      return message.channel.send({ embeds: [embed] });
    }

    if (cmd === "topvalues") {
      const data = await getJSON(endpoints.topvalues);
      const items = extractList(data);

      if (!items.length) return message.reply("❌ API error fetching top values.");

      const top = items.slice(0, 10);
      const embed = new EmbedBuilder()
        .setTitle("🏆 Tap Sim — Top Values")
        .setDescription(
          top.map((p, i) => `**${i + 1}. ${p.name}** — ${CLICK_EMOJI} **${p.value ?? "N/A"}**`).join("\n")
        )
        .setFooter({ text: "Source: tapsim.gg" });

      return message.channel.send({ embeds: [embed] });
    }

    if (cmd === "value") {
      const q = norm(args.join(" "));
      if (!q) return message.reply("Usage: `!value <name>`");

      const data = await getJSON(endpoints.items);
      const items = extractList(data);

      if (!items.length) return message.reply("❌ API error fetching items.");

      const found =
        items.find(i => norm(i.name) === q) ||
        items.find(i => norm(i.name).includes(q));

      if (!found) return message.reply(`❌ No match found for **${q}**.`);

      const embed = new EmbedBuilder()
        .setTitle(found.name)
        .setDescription(`Value: ${CLICK_EMOJI} **${found.value ?? "N/A"}**`)
        .addFields({ name: "Exist", value: String(found.exist ?? "N/A"), inline: true })
        .setFooter({ text: "Source: tapsim.gg" });

      return message.channel.send({ embeds: [embed] });
    }

    if (cmd === "search") {
      const q = norm(args.join(" "));
      if (!q) return message.reply("Usage: `!search <name>`");

      const data = await getJSON(endpoints.items);
      const items = extractList(data);

      if (!items.length) return message.reply("❌ API error fetching items.");

      const matches = items.filter(i => norm(i.name).includes(q)).slice(0, 10);
      if (!matches.length) return message.reply(`❌ No match found for **${q}**.`);

      const embed = new EmbedBuilder()
        .setTitle(`🔎 Search: ${q}`)
        .setDescription(matches.map(m => `**${m.name}** — ${CLICK_EMOJI} **${m.value ?? "N/A"}**`).join("\n"))
        .setFooter({ text: "Source: tapsim.gg" });

      return message.channel.send({ embeds: [embed] });
    }

    if (cmd === "enchants") {
      const data = await getJSON(endpoints.enchants);
      const ench = extractList(data);

      if (!ench.length) return message.reply("❌ API error fetching enchants.");

      const top = ench.slice(0, 10);
      const embed = new EmbedBuilder()
        .setTitle("✨ Tap Sim — Enchants")
        .setDescription(top.map(e => `**${e.name ?? "Unknown"}** — ${CLICK_EMOJI} **${e.value ?? "N/A"}**`).join("\n"))
        .setFooter({ text: "Source: tapsim.gg" });

      return message.channel.send({ embeds: [embed] });
    }

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
            return `**${name}**\nPrice: ${CLICK_EMOJI} **${s.price ?? "N/A"}**\nPercent: **${s.percent ?? "N/A"}%**`;
          }).join("\n\n")
        )
        .setFooter({ text: "Source: tapsim.gg" });

      return message.channel.send({ embeds: [embed] });
    }

    if (cmd === "ads") {
      const data = await getJSON(endpoints.ads);
      const ads = extractList(data);

      if (!ads.length) return message.reply("❌ API error fetching ads.");

      const top = ads.slice(0, 3);
      const embed = new EmbedBuilder()
        .setTitle("📢 Tap Sim — Trade Ads")
        .setDescription(
          top.map(a => `**Offering:** ${a.offering ?? "N/A"}\n**Wanting:** ${a.wanting ?? "N/A"}`).join("\n\n")
        )
        .setFooter({ text: "Source: tapsim.gg" });

      return message.channel.send({ embeds: [embed] });
    }

  } catch (err) {
    console.log("COMMAND ERROR", err);
    return message.reply("❌ Something broke.");
  }
});

// ---------- autopost hatches ----------
async function autoPostHatches() {
  const channel = await client.channels.fetch(HATCHES_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) return;

  const data = await getJSON(endpoints.eggs);
  const eggs = extractList(data).slice(0, 10);

  if (!eggs.length) return;

  const embed = new EmbedBuilder()
    .setTitle("🥚 Tap Sim — Hatch Update")
    .setDescription(eggs.map(e => `**${e.name}** — ${CLICK_EMOJI} **${e.price ?? "N/A"}**`).join("\n"))
    .setFooter({ text: `Auto every ${POST_INTERVAL_MINUTES} min | tapsim.gg` });

  channel.send({ embeds: [embed] });
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  autoPostHatches();
  setInterval(autoPostHatches, POST_INTERVAL_MINUTES * 60 * 1000);
});

client.login(TOKEN);
