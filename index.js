import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;

const TOKEN_EMOJI = "<:token:1467296721502736384>";
const CLICK_EMOJI = "<:ClickIcon:1467297249103974683>";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

async function getJSON(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// endpoints
const API_ITEMS = "https://api.tapsim.gg/api/tapsim/items";
const API_EGGS = "https://api.tapsim.gg/api/tapsim/eggs";
const API_SNIPES = "https://api.tapsim.gg/api/tapsim/plaza/snipes";
const API_ADS = "https://api.tapsim.gg/api/tapsim/ads";
const API_ENCHANTS = "https://api.tapsim.gg/api/tapsim/plaza/enchants";

function cleanName(name) {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

function formatNumber(num) {
  if (num === null || num === undefined) return "N/A";
  if (typeof num === "string") return num;
  return num.toLocaleString();
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!")) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  try {
    // HELP
    if (cmd === "help") {
      const embed = new EmbedBuilder()
        .setTitle("📌 Tap Sim Bot Commands")
        .setDescription(
          `**!hatches** — show eggs/hatches\n` +
          `**!value <name>** — value lookup\n` +
          `**!search <name>** — search items\n` +
          `**!topvalues** — top 10 values\n` +
          `**!enchants** — show enchants\n` +
          `**!snipes** — show snipes\n` +
          `**!ads** — show ads\n`
        )
        .setFooter({ text: "Source: tapsim.gg" });

      return message.reply({ embeds: [embed] });
    }

    // HATCHES
    if (cmd === "hatches") {
      const data = await getJSON(`${API_EGGS}?sort=price&order=desc&limit=10`);
      const eggs = data.rows || data;

      const embed = new EmbedBuilder()
        .setTitle("🥚 Tap Sim — Eggs / Hatches")
        .setFooter({ text: "Source: tapsim.gg" });

      let desc = "";
      for (const egg of eggs) {
        desc += `**${egg.name}** — ${CLICK_EMOJI} ${formatNumber(egg.price)}\n`;
      }

      embed.setDescription(desc || "❌ No eggs found.");
      return message.reply({ embeds: [embed] });
    }

    // SEARCH
    if (cmd === "search") {
      const query = args.join(" ");
      if (!query) return message.reply("❌ Use: `!search <name>`");

      const data = await getJSON(`${API_ITEMS}?limit=1000`);
      const items = data.rows || data;

      const q = cleanName(query);

      const results = items
        .filter(i => cleanName(i.name).includes(q))
        .slice(0, 10);

      if (results.length === 0) {
        return message.reply(`❌ No match found for **${query}**.`);
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔎 Search — ${query}`)
        .setDescription(results.map(r => `• **${r.name}**`).join("\n"))
        .setFooter({ text: "Source: tapsim.gg" });

      return message.reply({ embeds: [embed] });
    }

    // VALUE
    if (cmd === "value") {
      const query = args.join(" ");
      if (!query) return message.reply("❌ Use: `!value <name>`");

      const data = await getJSON(`${API_ITEMS}?limit=2000`);
      const items = data.rows || data;

      const q = cleanName(query);

      const item = items.find(i => cleanName(i.name).includes(q));

      if (!item) {
        return message.reply(`❌ No match found for **${query}**.`);
      }

      const embed = new EmbedBuilder()
        .setTitle(`💎 Value — ${item.name}`)
        .setDescription(
          `**Value:** ${TOKEN_EMOJI} ${formatNumber(item.value)}\n` +
          `**Exist:** ${formatNumber(item.exist)}`
        )
        .setFooter({ text: "Currency: TOKENS | tapsim.gg" });

      return message.reply({ embeds: [embed] });
    }

    // TOPVALUES
    if (cmd === "topvalues") {
      const data = await getJSON(`${API_ITEMS}?limit=10&sort=value&order=desc`);
      const items = data.rows || data;

      const embed = new EmbedBuilder()
        .setTitle("🏆 Tap Sim — Top 10 Values")
        .setFooter({ text: "Currency: TOKENS | tapsim.gg" });

      embed.setDescription(
        items.map(i => `**${i.name}** — ${TOKEN_EMOJI} ${formatNumber(i.value)}`).join("\n")
      );

      return message.reply({ embeds: [embed] });
    }

    // ENCHANTS
    if (cmd === "enchants") {
      const data = await getJSON(`${API_ENCHANTS}?limit=10`);
      const enchants = data.rows || data;

      const embed = new EmbedBuilder()
        .setTitle("✨ Tap Sim — Enchants")
        .setFooter({ text: "Source: tapsim.gg" });

      embed.setDescription(
        enchants.map(e => `• **${e.name || "Unknown"}**`).join("\n")
      );

      return message.reply({ embeds: [embed] });
    }

    // SNIPES
    if (cmd === "snipes") {
      const data = await getJSON(`${API_SNIPES}?basis=value&maxPercent=80`);
      const snipes = data.rows || data;

      const embed = new EmbedBuilder()
        .setTitle("🎯 Tap Sim — Plaza Snipes")
        .setFooter({ text: "Source: tapsim.gg" });

      let desc = "";

      for (const s of snipes.slice(0, 5)) {
        desc += `🔥 **${s.name || s.itemName || "Unknown"}**\n`;
        desc += `💰 Price: ${TOKEN_EMOJI} ${formatNumber(s.price)}\n`;
        desc += `👤 Seller: ${s.ownerName || s.seller || "Unknown"}\n`;
        desc += `🔗 https://www.tapsim.gg/trading\n\n`;
      }

      embed.setDescription(desc || "❌ No snipes found.");
      return message.reply({ embeds: [embed] });
    }

    // ADS
    if (cmd === "ads") {
      const data = await getJSON(`${API_ADS}?page=1&limit=5`);
      const ads = data.rows || data;

      const embed = new EmbedBuilder()
        .setTitle("📢 Tap Sim — Latest Trade Ads")
        .setFooter({ text: "Source: tapsim.gg" });

      let desc = "";

      for (const ad of ads) {
        const offering = (ad.offering || []).map(x => `${x.name} x${x.amount || 1}`).join(", ") || "None";
        const wanting = (ad.wanting || []).map(x => `${x.name} x${x.amount || 1}`).join(", ") || "None";

        desc += `🟣 **Trade Ad**\n`;
        desc += `🟡 Offering: ${offering}\n`;
        desc += `🔵 Wanting: ${wanting}\n`;
        desc += `🪙 Tokens: ${TOKEN_EMOJI} ${formatNumber(ad.tokens)}\n`;
        desc += `🔗 https://www.tapsim.gg/trading\n\n`;
      }

      embed.setDescription(desc || "❌ No ads found.");
      return message.reply({ embeds: [embed] });
    }

    return message.reply("❌ Unknown command. Use `!help`.");

  } catch (err) {
    console.log(err);
    return message.reply(`❌ API error fetching ${cmd}.`);
  }
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(TOKEN);
