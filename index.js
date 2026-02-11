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

const API_BASE = "https://api.tapsim.gg/api/tapsim";

const EGGS_ENDPOINT = "/eggs?sort=price&order=desc&limit=100";
const ITEMS_ENDPOINT = "/items?limit=100";

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

  if (!res.ok) throw new Error(`API error ${res.status} ${res.statusText}`);
  return await res.json();
}

function extractItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.eggs)) return data.eggs;
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
  return item?.name || item?.title || item?.displayName || "Unknown";
}

// token value (pet worth)
function pickTokenValue(item) {
  return (
    item?.value ??
    item?.tokenValue ??
    item?.token_value ??
    item?.tokens ??
    item?.worth ??
    null
  );
}

// egg cost (clicks)
function pickEggCost(item) {
  return (
    item?.price ??
    item?.cost ??
    item?.clickCost ??
    item?.clicks ??
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

function buildHatchesEmbed(eggs) {
  const sorted = eggs
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

  const lines = sorted.map((egg, i) => {
    const name = pickName(egg);
    const cost = pickEggCost(egg);

    return `**${i + 1}. ${name}** — **${formatNumber(cost)}** ${CLICK_EMOJI}`;
  });

  embed.addFields({
    name: "Top Eggs (by click cost)",
    value: lines.join("\n"),
    inline: false
  });

  return embed;
}

function buildTopValuesEmbed(items) {
  const sorted = items
    .sort((a, b) => (Number(pickTokenValue(b)) || 0) - (Number(pickTokenValue(a)) || 0))
    .slice(0, 10);

  const embed = new EmbedBuilder()
    .setTitle("Tap Sim — Top Values")
    .setDescription("Source: tapsim.gg")
    .setTimestamp(new Date());

  if (!sorted.length) {
    embed.addFields({ name: "Top Values", value: "No data", inline: false });
    return embed;
  }

  const lines = sorted.map((pet, i) => {
    const name = pickName(pet);
    const value = pickTokenValue(pet);

    return `**${i + 1}. ${name}** — **${formatNumber(value)}** ${TOKEN_EMOJI}`;
  });

  embed.addFields({
    name: "Top 10 Pets (token value)",
    value: lines.join("\n"),
    inline: false
  });

  return embed;
}

// ---------------- AUTO POST HATCHES ----------------

let lastEggHash = "";

function createEggHash(items) {
  return items
    .slice(0, 10)
    .map(it => `${pickName(it)}:${pickEggCost(it)}`)
    .join("|");
}

async function autoPostHatches() {
  try {
    const data = await fetchAPI(EGGS_ENDPOINT);
    const eggs = extractItems(data);

    if (!eggs.length) return;

    const newHash = createEggHash(eggs);
    if (newHash === lastEggHash) return;

    const channel = await client.channels.fetch(HATCHES_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    await channel.send({ embeds: [buildHatchesEmbed(eggs)] });

    lastEggHash = newHash;
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
        "`!hatches` - show eggs/hatches (ClickIcon)\n" +
        "`!topvalues` - top 10 pet values (Tokens)\n" +
        "`!value <name>` - lookup pet value (Tokens)\n" +
        "`!search <name>` - search pets\n"
      );
    }

    if (cmd === "hatches") {
      const data = await fetchAPI(EGGS_ENDPOINT);
      const eggs = extractItems(data);

      return message.reply({ embeds: [buildHatchesEmbed(eggs)] });
    }

    if (cmd === "topvalues") {
      const data = await fetchAPI(ITEMS_ENDPOINT);
      const items = extractItems(data);

      return message.reply({ embeds: [buildTopValuesEmbed(items)] });
    }

    if (cmd === "value") {
      const query = args.join(" ");
      if (!query) return message.reply("Usage: `!value <name>`");

      const data = await fetchAPI(ITEMS_ENDPOINT);
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

    if (cmd === "search") {
      const query = args.join(" ");
      if (!query) return message.reply("Usage: `!search <name>`");

      const data = await fetchAPI(ITEMS_ENDPOINT);
      const items = extractItems(data);

      const matches = fuzzyFind(items, query);
      if (!matches.length) return message.reply(`No results for **${query}**.`);

      const top = matches.slice(0, 10);

      const lines = top.map((pet, i) => {
        const name = pickName(pet);
        const value = pickTokenValue(pet);

        return `**${i + 1}. ${name}** — **${formatNumber(value)}** ${TOKEN_EMOJI}`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`Search results: ${query}`)
        .setDescription(lines.join("\n"))
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

  await autoPostHatches();
  setInterval(autoPostHatches, POST_INTERVAL_MINUTES * 60 * 1000);
});

client.login(TOKEN);
