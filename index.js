import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActivityType
} from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;
const HATCHES_CHANNEL_ID = process.env.HATCHES_CHANNEL_ID;

const TOKEN_EMOJI = "<:token:1467296721502736384>";
const CLICK_EMOJI = "<:ClickIcon:1467297249103974683>";

const API_BASE = process.env.API_BASE || "https://api.tapsim.gg/api/tapsim";
const EGGS_ENDPOINT =
  process.env.EGGS_ENDPOINT || "/eggs?sort=price&order=desc&limit=100";

const POST_INTERVAL_MINUTES = Number(process.env.POST_INTERVAL_MINUTES || 5);
const PREFIX = "!";

if (!TOKEN) throw new Error("Missing DISCORD_TOKEN");
if (!HATCHES_CHANNEL_ID) throw new Error("Missing HATCHES_CHANNEL_ID");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ---------------- HELPERS ----------------

async function fetchAPI(endpoint) {
  const url = `${API_BASE}${endpoint}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TapSimBot/1.0 (Discord Bot)"
    }
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status} ${res.statusText}`);
  }

  return await res.json();
}

function extractItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.eggs)) return data.eggs;
  if (Array.isArray(data?.pets)) return data.pets;
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data?.results)) return data.results;
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

// Token value (pet worth)
function pickTokenValue(item) {
  return (
    item?.value ??
    item?.tokenValue ??
    item?.token_value ??
    item?.tokens ??
    item?.token ??
    item?.worth ??
    null
  );
}

// Click cost (egg cost)
function pickEggCost(item) {
  return (
    item?.clickCost ??
    item?.click_cost ??
    item?.clicks ??
    item?.cost ??
    item?.price ??
    null
  );
}

function fuzzyFind(items, query) {
  const q = normalize(query);
  if (!q) return [];

  const exact = items.filter(it => normalize(pickName(it)) === q);
  if (exact.length) return exact;

  const contains = items.filter(it => normalize(pickName(it)).includes(q));
  if (contains.length) return contains;

  const qNoSpace = q.replace(/ /g, "");
  const noSpace = items.filter(it =>
    normalize(pickName(it)).replace(/ /g, "").includes(qNoSpace)
  );

  return noSpace;
}

// ---------------- EMBEDS ----------------

function buildHatchesEmbed(items) {
  const sorted = items
    .sort((a, b) => (Number(pickEggCost(b)) || 0) - (Number(pickEggCost(a)) || 0))
    .slice(0, 10);

  const embed = new EmbedBuilder()
    .setTitle("Tap Sim — Eggs / Hatches")
    .setDescription("Source: tapsim.gg")
    .setTimestamp(new Date());

  if (!sorted.length) {
    embed.addFields({ name: "Eggs", value: "No data", inline: false });
    return embed;
  }

  const lines = sorted.map((it, i) => {
    const name = pickName(it);
    const cost = pickEggCost(it);

    return `**${i + 1}. ${name}** — **${formatNumber(cost)}** ${CLICK_EMOJI}`;
  });

  embed.addFields({
    name: "Top Eggs (by cost)",
    value: lines.join("\n"),
    inline: false
  });

  return embed;
}

function buildTopValuesEmbed(items) {
  const sorted = items
    .sort((a, b) => (Number(pickEggCost(b)) || 0) - (Number(pickEggCost(a)) || 0))
    .slice(0, 10);

  const embed = new EmbedBuilder()
    .setTitle("Tap Sim — Top Values")
    .setDescription("Source: tapsim.gg")
    .setTimestamp(new Date());

  if (!sorted.length) {
    embed.addFields({ name: "Top Values", value: "No data", inline: false });
    return embed;
  }

  const lines = sorted.map((it, i) => {
    const name = pickName(it);
    const cost = pickEggCost(it);

    return `**${i + 1}. ${name}** — **${formatNumber(cost)}** ${CLICK_EMOJI}`;
  });

  embed.addFields({
    name: "Top 10 (by click cost)",
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
    .map(it => `${pickName(it)}:${pickEggCost(it)}`)
    .join("|");
}

async function autoPost() {
  try {
    const data = await fetchAPI(EGGS_ENDPOINT);
    const items = extractItems(data);

    if (!items.length) return;

    const newHash = createHash(items);
    if (newHash === lastHash) return;

    const channel = await client.channels.fetch(HATCHES_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    await channel.send({ embeds: [buildHatchesEmbed(items)] });

    lastHash = newHash;
  } catch (err) {
    console.error("Auto post error:", err?.message || err);
  }
}

// ---------------- COMMANDS ----------------

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift()?.toLowerCase();

  try {
    if (cmd === "help") {
      return message.reply(
        "**Commands:**\n" +
        "`!hatches` - show eggs/hatches\n" +
        "`!value <name>` - token value lookup\n" +
        "`!search <name>` - search eggs\n" +
        "`!topvalues` - top 10 click cost\n"
      );
    }

    if (cmd === "hatches") {
      const data = await fetchAPI(EGGS_ENDPOINT);
      const items = extractItems(data);
      return message.reply({ embeds: [buildHatchesEmbed(items)] });
    }

    if (cmd === "topvalues") {
      const data = await fetchAPI(EGGS_ENDPOINT);
      const items = extractItems(data);
      return message.reply({ embeds: [buildTopValuesEmbed(items)] });
    }

    if (cmd === "search") {
      const query = args.join(" ");
      if (!query) return message.reply("Usage: `!search <name>`");

      const data = await fetchAPI(EGGS_ENDPOINT);
      const items = extractItems(data);

      const matches = fuzzyFind(items, query);

      if (!matches.length) return message.reply(`No match found for **${query}**.`);

      const top = matches.slice(0, 10);

      const lines = top.map((it, i) => {
        const name = pickName(it);
        const cost = pickEggCost(it);

        return `**${i + 1}. ${name}** — **${formatNumber(cost)}** ${CLICK_EMOJI}`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`Egg Search: ${query}`)
        .setDescription(lines.join("\n"))
        .setTimestamp(new Date());

      return message.reply({ embeds: [embed] });
    }

    if (cmd === "value") {
      const query = args.join(" ");
      if (!query) return message.reply("Usage: `!value <name>`");

      // right now value only works if the API provides token values inside eggs list
      const data = await fetchAPI(EGGS_ENDPOINT);
      const items = extractItems(data);

      const matches = fuzzyFind(items, query);

      if (!matches.length) return message.reply(`No match found for **${query}**.`);

      const best = matches[0];
      const name = pickName(best);
      const value = pickTokenValue(best);

      const embed = new EmbedBuilder()
        .setTitle(name)
        .setDescription("Source: tapsim.gg")
        .addFields({
          name: "Token Value",
          value: `**${formatNumber(value)}** ${TOKEN_EMOJI}`,
          inline: true
        })
        .setTimestamp(new Date());

      return message.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error(err);
    return message.reply("Something broke (API error).");
  }
});

// ---------------- READY ----------------

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setActivity({
    name: "Tap Sim Values",
    type: ActivityType.Watching
  });

  await autoPost();
  setInterval(autoPost, POST_INTERVAL_MINUTES * 60 * 1000);
});

client.login(TOKEN);
