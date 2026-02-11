import "dotenv/config";
import fetch from "node-fetch";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;
const HATCHES_CHANNEL_ID = process.env.HATCHES_CHANNEL_ID;
const POST_INTERVAL_MINUTES = parseInt(process.env.POST_INTERVAL_MINUTES || "5");

const CLICK_EMOJI = process.env.CLICK_EMOJI || "<:ClickIcon:1467297249103974683>";
const TOKEN_EMOJI = process.env.TOKEN_EMOJI || "<:token:1467296721502736384>";

const API_BASE = "https://api.tapsim.gg/api/tapsim";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ------------------------
// HELPERS
// ------------------------
async function getJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.log("Fetch error:", err);
    return null;
  }
}

function cleanName(str) {
  return str.toLowerCase().trim();
}

// ------------------------
// API FUNCTIONS
// ------------------------
async function fetchEggs() {
  return await getJSON(`${API_BASE}/eggs?sort=price&order=desc&limit=100`);
}

async function fetchItems(limit = 100) {
  return await getJSON(`${API_BASE}/items?limit=${limit}`);
}

async function fetchTopValues() {
  return await getJSON(`${API_BASE}/items?type=Pet&sort=value&order=desc&page=1&limit=50`);
}

async function fetchEnchants() {
  return await getJSON(`${API_BASE}/plaza/enchants`);
}

async function fetchSnipes() {
  return await getJSON(`${API_BASE}/plaza/snipes?basis=value&maxPercent=80`);
}

async function fetchAds() {
  return await getJSON(`${API_BASE}/ads?page=1&limit=20`);
}

// ------------------------
// COMMAND HANDLER
// ------------------------
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!")) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // !help
  if (command === "help") {
    const embed = new EmbedBuilder()
      .setTitle("📌 Tap Sim Bot Commands")
      .setDescription("Here are all commands:")
      .addFields(
        { name: "!hatches", value: "Show eggs/hatches list" },
        { name: "!hatches <egg>", value: "Search eggs by name" },
        { name: "!value <pet>", value: "Value lookup" },
        { name: "!search <name>", value: "Search pets/items" },
        { name: "!topvalues", value: "Top 10 values" },
        { name: "!enchants", value: "Show enchants list" },
        { name: "!snipes", value: "Show plaza snipes" },
        { name: "!ads", value: "Show latest trade ads" }
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // !hatches
  if (command === "hatches") {
    const query = args.join(" ").toLowerCase();
    const data = await fetchEggs();

    if (!data || !data.rows) {
      return message.reply("❌ API error fetching eggs.");
    }

    let eggs = data.rows;

    if (query) {
      eggs = eggs.filter((e) => cleanName(e.name).includes(query));
    }

    eggs = eggs.slice(0, 10);

    if (eggs.length === 0) {
      return message.reply("❌ No eggs found.");
    }

    const embed = new EmbedBuilder()
      .setTitle("🥚 Tap Sim — Eggs / Hatches")
      .setDescription(
        eggs
          .map((egg) => {
            const price = egg.price ?? "N/A";
            return `**${egg.name}**\nPrice: ${CLICK_EMOJI} **${price}**`;
          })
          .join("\n\n")
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // !value
  if (command === "value") {
    const query = args.join(" ").toLowerCase();
    if (!query) return message.reply("❌ Use: `!value <pet name>`");

    const data = await fetchItems(200);

    if (!data || !data.rows) {
      return message.reply("❌ API error fetching items.");
    }

    const item = data.rows.find((i) => cleanName(i.name) === query);

    if (!item) {
      return message.reply(`❌ No match found for **${query}**.`);
    }

    const embed = new EmbedBuilder()
      .setTitle(`💎 Tap Sim — Value Lookup`)
      .setDescription(
        `**${item.name}**\n\nValue: ${CLICK_EMOJI} **${item.value ?? "N/A"}**\nExist: **${item.exist ?? "N/A"}**`
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // !search
  if (command === "search") {
    const query = args.join(" ").toLowerCase();
    if (!query) return message.reply("❌ Use: `!search <name>`");

    const data = await fetchItems(300);

    if (!data || !data.rows) {
      return message.reply("❌ API error fetching items.");
    }

    const matches = data.rows
      .filter((i) => cleanName(i.name).includes(query))
      .slice(0, 10);

    if (matches.length === 0) {
      return message.reply(`❌ No match found for **${query}**.`);
    }

    const embed = new EmbedBuilder()
      .setTitle("🔎 Tap Sim — Search Results")
      .setDescription(
        matches
          .map((m) => `**${m.name}** → ${CLICK_EMOJI} **${m.value ?? "N/A"}**`)
          .join("\n")
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // !topvalues
  if (command === "topvalues") {
    const data = await fetchTopValues();

    if (!data || !data.rows) {
      return message.reply("❌ API error fetching top values.");
    }

    const top10 = data.rows.slice(0, 10);

    const embed = new EmbedBuilder()
      .setTitle("🏆 Tap Sim — Top 10 Values")
      .setDescription(
        top10
          .map((pet, index) => {
            return `**${index + 1}. ${pet.name}**\nValue: ${CLICK_EMOJI} **${pet.value ?? "N/A"}**`;
          })
          .join("\n\n")
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // !enchants
  if (command === "enchants") {
    const data = await fetchEnchants();

    if (!data || !data.rows) {
      return message.reply("❌ API error fetching enchants.");
    }

    const enchants = data.rows.slice(0, 10);

    const embed = new EmbedBuilder()
      .setTitle("✨ Tap Sim — Enchants")
      .setDescription(
        enchants
          .map((e) => `**${e.name}** → ${CLICK_EMOJI} **${e.value ?? "N/A"}**`)
          .join("\n")
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // !snipes
  if (command === "snipes") {
    const data = await fetchSnipes();

    if (!data || !data.rows) {
      return message.reply("❌ API error fetching snipes.");
    }

    const snipes = data.rows.slice(0, 5);

    const embed = new EmbedBuilder()
      .setTitle("🎯 Tap Sim — Plaza Snipes")
      .setDescription(
        snipes
          .map((s) => {
            return `**${s.itemName}**\nPrice: ${CLICK_EMOJI} **${s.price}**\nPercent: **${s.percent}%**`;
          })
          .join("\n\n")
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }

  // !ads
  if (command === "ads") {
    const data = await fetchAds();

    if (!data || !data.rows) {
      return message.reply("❌ API error fetching ads.");
    }

    const ads = data.rows.slice(0, 3);

    const embed = new EmbedBuilder()
      .setTitle("📢 Tap Sim — Latest Trade Ads")
      .setDescription(
        ads
          .map((ad) => {
            return `**Offering:** ${ad.offering ?? "N/A"}\n**Wanting:** ${ad.wanting ?? "N/A"}`;
          })
          .join("\n\n")
      )
      .setFooter({ text: "Source: tapsim.gg" });

    return message.channel.send({ embeds: [embed] });
  }
});

// ------------------------
// AUTO POST HATCHES
// ------------------------
async function autoPostHatches() {
  const channel = await client.channels.fetch(HATCHES_CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.log("Hatches channel not found.");
    return;
  }

  const data = await fetchEggs();

  if (!data || !data.rows) {
    console.log("Failed to fetch eggs.");
    return;
  }

  const eggs = data.rows.slice(0, 10);

  const embed = new EmbedBuilder()
    .setTitle("🥚 Tap Sim — Auto Hatch Update")
    .setDescription(
      eggs
        .map((egg) => {
          const price = egg.price ?? "N/A";
          return `**${egg.name}**\nPrice: ${CLICK_EMOJI} **${price}**`;
        })
        .join("\n\n")
    )
    .setFooter({ text: `Updated every ${POST_INTERVAL_MINUTES} minutes | tapsim.gg` });

  channel.send({ embeds: [embed] });
}

// ------------------------
// READY EVENT
// ------------------------
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Start auto posting loop
  setInterval(autoPostHatches, POST_INTERVAL_MINUTES * 60 * 1000);

  // Post instantly on startup
  autoPostHatches();
});

client.login(TOKEN);
