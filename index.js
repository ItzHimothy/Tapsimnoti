import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActivityType
} from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;
const HATCHES_CHANNEL_ID = process.env.HATCHES_CHANNEL_ID;
const TOKEN_EMOJI = process.env.TOKEN_EMOJI || "<:token:1467296721502736384>";
const API_BASE = process.env.API_BASE || "https://api.tapsim.gg/api/tapsim";
const EGGS_ENDPOINT =
  process.env.EGGS_ENDPOINT || "/eggs?sort=price&order=desc&limit=100";

const POST_INTERVAL_MINUTES = Number(process.env.POST_INTERVAL_MINUTES || 5);
const PREFIX = "!";

if (!TOKEN) throw new Error("Missing DISCORD_TOKEN in .env");
if (!HATCHES_CHANNEL_ID) throw new Error("Missing HATCHES_CHANNEL_ID in .env");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ---------------- HELPERS ----------------

async function fetchAPI() {
  const url = `${API_BASE}${EGGS_ENDPOINT}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" }
  });

  if (!res.ok) throw new Error(`API error ${res.status} ${res.statusText}`);

  return await res.json();
}

function extractItems(data) {
  // Handles multiple API response formats
  if (Array.isArray(data)) return data;

  if (data?.data && Array.isArray(data.data)) return data.data;
  if (data?.items && Array.isArray(data.items)) return data.items;
  if (data?.eggs && Array.isArray(data.eggs)) return data.eggs;
  if (data?.result && Array.isArray(data.result)) return data.result;
  if (data?.results && Array.isArray(data.results)) return data.results;

  return [];
}

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatNumber(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return "N/A";
  return x.toLocaleString("en-US");
}

function pickName(item) {
  return (
    item?.name ||
    item?.petName ||
    item?.eggName ||
    item?.title ||
    item?.displayName ||
    "Unknown"
  );
}

function pickPrice(item) {
  return (
    item?.price ??
    item?.value ??
    item?.tokens ??
    item?.token ??
    item?.tokenValue ??
    item?.token_value ??
    item?.token_price ??
    item?.cost ??
    item?.amount ??
    item?.worth ??
    null
  );
}

function sortByPrice(items) {
  return items.sort((a, b) => {
    const pa = Number(pickPrice(a)) || 0;
    const pb = Number(pickPrice(b)) || 0;
    return pb - pa;
  });
}

function fuzzyFind(items, query) {
  const q = normalize(query);

  if (!q) return [];

  // exact match
  const exact = items.filter(it => normalize(pickName(it)) === q);
  if (exact.length) return exact;

  // contains match
  const contains = items.filter(it => normalize(pickName(it)).includes(q));
  if (contains.length) return contains;

  // scoring match
  const parts = q.split(" ");
  const scored = items
    .map(it => {
      const name = normalize(pickName(it));
      let score = 0;

      for (const p of parts) {
        if (name.includes(p)) score++;
      }

      return { it, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 10).map(x => x.it);
}

function buildTopEmbed(items, title) {
  const sorted = sortByPrice(items).slice(0, 10);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription("Source: tapsim.gg")
    .setTimestamp(new Date());

  if (!sorted.length) {
    embed.addFields({ name: "Top (by price)", value: "No data", inline: false });
    return embed;
  }

  const lines = sorted.map((it, i) => {
    const name = pickName(it);
    const price = pickPrice(it);

    return `**${i + 1}. ${name}** — **${formatNumber(price)}** ${TOKEN_EMOJI}`;
  });

  embed.addFields({
    name: "Top (by price)",
    value: lines.join("\n"),
    inline: false
  });

  return embed;
}

// ---------------- AUTO POST ----------------

let lastHash = "";

function createHash(items) {
  return items
    .slice(0, 10)
    .map(it => `${pickName(it)}:${pickPrice(it)}`)
    .join("|");
}

async function autoPostHatches() {
  try {
    const data = await fetchAPI();
    const items = extractItems(data);

    if (!items.length) return;

    const sorted = sortByPrice(items);
    const newHash = createHash(sorted);

    if (newHash === lastHash) return;

    const channel = await client.channels.fetch(HATCHES_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    const embed = buildTopEmbed(items, "Tap Sim — Hatch Update");
    await channel.send({ embeds: [embed] });

    lastHash = newHash;
  } catch (err) {
    console.error("Auto-post error:", err?.message || err);
  }
}

// ---------------- COMMANDS ----------------

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift()?.toLowerCase();

  try {
    // HELP
    if (cmd === "help") {
      return message.reply(
        "**Commands:**\n" +
        "`!hatches` - show eggs/hatches\n" +
        "`!value <name>` - value lookup\n" +
        "`!search <name>` - search pets\n" +
        "`!topvalues` - top 10 values\n"
      );
    }

    // HATCHES
    if (cmd === "hatches") {
      const data = await fetchAPI();
      const items = extractItems(data);

      const embed = buildTopEmbed(items, "Tap Sim — Eggs / Hatches");
      return message.reply({ embeds: [embed] });
    }

    // TOPVALUES
    if (cmd === "topvalues") {
      const data = await fetchAPI();
      const items = extractItems(data);

      const embed = buildTopEmbed(items, "Tap Sim — Top Values");
      return message.reply({ embeds: [embed] });
    }

    // VALUE
    if (cmd === "value") {
      const query = args.join(" ");
      if (!query) return message.reply("Usage: `!value <name>`");

      const data = await fetchAPI();
      const items = extractItems(data);

      const matches = fuzzyFind(items, query);

      if (!matches.length) {
        return message.reply(`No match found for **${query}**.`);
      }

      const best = matches[0];
      const name = pickName(best);
      const price = pickPrice(best);

      const embed = new EmbedBuilder()
        .setTitle(name)
        .setDescription("Source: tapsim.gg")
        .addFields({
          name: "Value",
          value: `**${formatNumber(price)}** ${TOKEN_EMOJI}`,
          inline: true
        })
        .setTimestamp(new Date());

      return message.reply({ embeds: [embed] });
    }

    // SEARCH
    if (cmd === "search") {
      const query = args.join(" ");
      if (!query) return message.reply("Usage: `!search <name>`");

      const data = await fetchAPI();
      const items = extractItems(data);

      const matches = fuzzyFind(items, query);

      if (!matches.length) {
        return message.reply(`No results for **${query}**.`);
      }

      const lines = matches.slice(0, 10).map((it, i) => {
        const name = pickName(it);
        const price = pickPrice(it);
        return `**${i + 1}. ${name}** — **${formatNumber(price)}** ${TOKEN_EMOJI}`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`Search results: ${query}`)
        .setDescription(lines.join("\n"))
        .setTimestamp(new Date());

      return message.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error(err);
    return message.reply("API error / something broke.");
  }
});

// ---------------- READY ----------------

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setActivity({
    name: "Tap Sim Values",
    type: ActivityType.Watching
  });

  await autoPostHatches();
  setInterval(autoPostHatches, POST_INTERVAL_MINUTES * 60 * 1000);
});

client.login(TOKEN);
