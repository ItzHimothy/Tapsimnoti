import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import fetch from "node-fetch";

const TOKEN = process.env.DISCORD_TOKEN;

// emojis
const TOKEN_EMOJI = process.env.TOKEN_EMOJI || "<:token:1467296721502736384>";
const CLICK_EMOJI = process.env.CLICK_EMOJI || "<:ClickIcon:1467297249103974683>";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// API Endpoints
const API_ITEMS = "https://api.tapsim.gg/api/tapsim/items";
const API_EGGS = "https://api.tapsim.gg/api/tapsim/eggs";
const API_SNIPES = "https://api.tapsim.gg/api/tapsim/plaza/snipes";
const API_ADS = "https://api.tapsim.gg/api/tapsim/ads";
const API_ENCHANTS = "https://api.tapsim.gg/api/tapsim/plaza/enchants";

const WEBSITE_ITEMS = "https://www.tapsim.gg/items/";
const WEBSITE_TRADING = "https://www.tapsim.gg/trading";

// helper
function cleanName(name) {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

function formatNumber(num) {
  if (!num) return "N/A";
  if (typeof num === "string") return num;

  if (num >= 1e12) return num.toExponential(2);
  return num.toLocaleString();
}

async function getJSON(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return await res.json();
}

// find item in items list
async function findItem(query) {
  const data = await getJSON(`${API_ITEMS}?limit=1000`);

  const q = cleanName(query);

  let best = null;

  for (const item of data.rows || data || []) {
    const name = cleanName(item.name || "");
    if (name.includes(q)) {
      best = item;
      break;
    }
  }

  return best;
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!")) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const cmd = args.shift()?.toLowerCase();

  try {
    // HELP
    if (cmd === "help") {
      const embed = new EmbedBuilder()
        .setTitle("📌 Tap Sim Bot Commands")
        .setDescription(
          `**!hatches** — show eggs/hatches\n` +
          `**!hatches <egg>** — search egg\n` +
          `**!value <name>** — value lookup\n` +
          `**!search <name>** — search pets/items\n` +
          `**!topvalues** — top 10 values\n` +
          `**!enchants** — show enchants\n` +
          `**!snipes** — show latest snipes\n` +
          `**!ads** — show trade ads\n`
        )
        .setFooter({ text: "Source: tapsim.gg" });

      return message.reply({ embeds: [embed] });
    }

    // HATCHES
    if (cmd === "hatches") {
      const eggQuery = args.join(" ").toLowerCase();

      const data = await getJSON(`${API_EGGS}?sort=price&order=desc&limit=100`);

      let eggs = data.rows || data || [];

      if (eggQuery) {
        eggs = eggs.filter(e =>
          (e.name || "").toLowerCase().includes(eggQuery)
        );
      }

      eggs = eggs.slice(0, 10);

      const embed = new EmbedBuilder()
        .setTitle("🥚 Tap Sim — Eggs / Hatches")
        .setFooter({ text: "Source: tapsim.gg" });

      if (eggs.length === 0) {
        embed.setDescription("❌ No eggs found.");
        return message.reply({ embeds: [embed] });
      }

      let desc = "";
      for (const egg of eggs) {
        const price = egg.price ?? egg.cost ?? "N/A";
        desc += `**${egg.name}** — ${CLICK_EMOJI} ${formatNumber(price)}\n`;
      }

      embed.setDescription(desc);
      return message.reply({ embeds: [embed] });
    }

    // SEARCH
    if (cmd === "search") {
      const query = args.join(" ");
      if (!query) return message.reply("❌ Use: `!search <name>`");

      const data = await getJSON(`${API_ITEMS}?limit=1000`);
      const items = data.rows || data || [];

      const q = cleanName(query);

      const results = items.filter(i =>
        cleanName(i.name || "").includes(q)
      ).slice(0, 10);

      const embed = new EmbedBuilder()
        .setTitle(`🔎 Search — ${query}`)
        .setFooter({ text: "Source: tapsim.gg" });

      if (results.length === 0) {
        embed.setDescription("❌ No match found.");
        return message.reply({ embeds: [embed] });
      }

      let desc = "";
      for (const item of results) {
        desc += `**${item.name}**\n`;
      }

      embed.setDescription(desc);
      return message.reply({ embeds: [embed] });
    }

    // VALUE
    if (cmd === "value") {
      const query = args.join(" ");
      if (!query) return message.reply("❌ Use: `!value <petname>`");

      const item = await findItem(query);

      if (!item) {
        return message.reply(`❌ No match found for **${query}**.`);
      }

      // token value is usually "value" or "price"
      const value = item.value ?? item.price ?? item.tokenValue ?? null;
      const exist = item.exist ?? item.exists ?? item.count ?? "N/A";

      const embed = new EmbedBuilder()
        .setTitle(`💎 Value — ${item.name}`)
        .setDescription(
          `**Value:** ${TOKEN_EMOJI} ${formatNumber(value)}\n` +
          `**Exist:** ${formatNumber(exist)}\n\n` +
          `[Open Item Page](${WEBSITE_ITEMS}${encodeURIComponent(item.slug || item.name)})`
        )
        .setFooter({ text: "Currency: TOKENS | tapsim.gg" });

      return message.reply({ embeds: [embed] });
    }

    // TOPVALUES
    if (cmd === "topvalues") {
      const data = await getJSON(`${API_ITEMS}?sort=value&order=desc&limit=10&type=Pet`);
      const items = data.rows || data || [];

      const embed = new EmbedBuilder()
        .setTitle("🏆 Tap Sim — Top 10 Values")
        .setFooter({ text: "Source: tapsim.gg" });

      let desc = "";

      for (const item of items) {
        const val = item.value ?? item.price ?? null;
        desc += `**${item.name}** — ${TOKEN_EMOJI} ${formatNumber(val)}\n`;
      }

      embed.setDescription(desc || "❌ No data.");
      return message.reply({ embeds: [embed] });
    }

    // ENCHANTS
    if (cmd === "enchants") {
      const data = await getJSON(`${API_ENCHANTS}?limit=20`);
      const enchants = data.rows || data || [];

      const embed = new EmbedBuilder()
        .setTitle("✨ Tap Sim — Enchants")
        .setFooter({ text: "Source: tapsim.gg" });

      let desc = "";

      for (const ench of enchants.slice(0, 10)) {
        desc += `**${ench.name || "Unknown"}**\n`;
      }

      embed.setDescription(desc || "❌ No enchants found.");
      return message.reply({ embeds: [embed] });
    }

    // SNIPES
    if (cmd === "snipes") {
      const data = await getJSON(`${API_SNIPES}?basis=value&maxPercent=80`);
      const snipes = data.rows || data || [];

      const embed = new EmbedBuilder()
        .setTitle("🎯 Tap Sim — Plaza Snipes")
        .setFooter({ text: "Currency: TOKENS | tapsim.gg" });

      let desc = "";

      for (const snipe of snipes.slice(0, 5)) {
        const name = snipe.itemName || snipe.name || "Unknown";
        const price = snipe.price ?? "N/A";
        const seller = snipe.seller || snipe.ownerName || "Unknown";

        desc += `🔥 **Pet Found!**\n` +
          `🐾 **Pet:** ${name}\n` +
          `💰 **Price:** ${TOKEN_EMOJI} ${formatNumber(price)}\n` +
          `👤 **Seller:** ${seller}\n` +
          `🔗 **Trade Link:** ${WEBSITE_TRADING}\n\n`;
      }

      embed.setDescription(desc || "❌ No snipes found.");
      return message.reply({ embeds: [embed] });
    }

    // ADS
    if (cmd === "ads") {
      const data = await getJSON(`${API_ADS}?page=1&limit=10`);
      const ads = data.rows || data || [];

      const embed = new EmbedBuilder()
        .setTitle("📢 Tap Sim — Latest Trade Ads")
        .setFooter({ text: "Source: tapsim.gg" });

      let desc = "";

      for (const ad of ads.slice(0, 3)) {
        const offering = (ad.offering || [])
          .map(o => `${o.name} x${o.amount || 1}`)
          .join(", ") || "None";

        const wanting = (ad.wanting || [])
          .map(w => `${w.name} x${w.amount || 1}`)
          .join(", ") || "None";

        const tokens = ad.tokens ?? ad.tokenAmount ?? "N/A";

        desc += `🟣 **Trade Ad**\n` +
          `🟡 **Offering:** ${offering}\n` +
          `🔵 **Wanting:** ${wanting}\n` +
          `🪙 **Tokens:** ${TOKEN_EMOJI} ${formatNumber(tokens)}\n` +
          `🔗 ${WEBSITE_TRADING}\n\n`;
      }

      embed.setDescription(desc || "❌ No ads found.");
      return message.reply({ embeds: [embed] });
    }

    // unknown command
    return message.reply("❌ Unknown command. Use `!help`.");

  } catch (err) {
    console.error(err);
    return message.reply(`❌ API error fetching ${cmd}.`);
  }
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(TOKEN);
