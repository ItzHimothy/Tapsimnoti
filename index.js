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

async function fetchEggs() {
  const url = `${API_BASE}${EGGS_ENDPOINT}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });

  if (!res.ok) throw new Error(`API error ${res.status} ${res.statusText}`);

  return await res.json();
}

function extractItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.eggs)) return data.eggs;
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

// VALUE TOKENS
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

// EGG COST CLICKS
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

function sortByValue(items) {
  return items.sort((a, b) => {
    const va = Number(pickTokenValue(a)) || 0;
    const vb = Number(pickTokenValue(b)) || 0;
    return vb - va;
  });
}

function sortByCost(items) {
  return items.sort((a, b) => {
    const ca = Number(pickEggCost(a)) || 0;
    const cb = Number(pickEggCost(b)) || 0;
    return cb - ca;
  });
}

function fuzzyFind(items, query) {
  const q = normalize(query);
  if (!q) return [];

  const exact = items.filter(it => normalize(pickName(it)) === q);
  if (exact.length) return exact;

  const contains = items.filter(it => normalize(pickName(it)).includes(q));
  if (contains.length) return contains;

  const qNoSpace = q.replace(/ /g, "");
  const containsNoSpace = items.filter(it =>
    normalize(pickName(it)).replace(/ /g, "").includes(qNoSpace)
  );
  if (containsNoSpace.length) return containsNoSpace;

  return [];
}

// ---------------- EMBEDS ----------------

function buildHatchesEmbed(items) {
  const sorted = sortByCost(items).slice(0, 10);

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
    const value = pickTokenValue(it);

    return `**${i + 1}. ${name}**\nCost: **${formatNumber(cost)}** ${CLICK_EMOJI}\nValue: **${formatNumber(value)}** ${TOKEN_EMOJI}`;
  });

  embed.addFields({
    name: "Top Eggs (by cost)",
    value: lines.join("\n\n"),
    inline: false
  });

  return embed;
}

function buildTopValuesEmbed(items) {
  const sorted = sortByValue(items).slice(0, 10);

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
    const value = pickTokenValue(it);

    return `**${i + 1}. ${name}** — **${formatNumber(value)}** ${TOKEN_EMOJI}`;
  });

  embed.addFields({
    name: "Top 10 Values",
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
    .map(it => `${pickName(it)}:${pickTokenValue(it)}:${pickEggCost(it)}`)
    .join("|");
}

async function autoPost() {
  try {
    const data = await fetchEggs();
    const items = extractItems(data);

    if (!items.length) return;

    const newHash = createHash(items);
    if (newHash === lastHash) return;

    const channel = await client.channels.fetch(HATCHES_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    const embed = buildHatchesEmbed(items);
    await channel.send({ embeds: [embed] });

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
        "`!value <name>` - value lookup\n" +
        "`!search <name>` - search pets\n" +
        "`!topvalues` - top 10 values\n"
      );
    }

    if (cmd === "hatches") {
      const data = await fetchEggs();
      const items = extractItems(data);

      return message.reply({ embeds: [buildHatchesEmbed(items)] });
    }

    if (cmd === "topvalues") {
      const data = await fetchEggs();
      const items = extractItems(data);

      return message.reply({ embeds: [buildTopValuesEmbed(items)] });
    }

    if (cmd === "value") {
      const query = args.join(" ");
      if (!query) return message.reply("Usage: `!value <name>`");

      const data = await fetchEggs();
      const items = extractItems(data);

      const matches = fuzzyFind(items, query);

      if (!matches.length) {
        return message.reply(`No match found for **${query}**.`);
      }

      const best = matches[0];
      const name = pickName(best);

      const value = pickTokenValue(best);
      const cost = pickEggCost(best);

      const embed = new EmbedBuilder()
        .setTitle(name)
        .setDescription("Source: tapsim.gg")
        .addFields(
          {
            name: "Value",
            value: `**${formatNumber(value)}** ${TOKEN_EMOJI}`,
            inline: true
          },
          {
            name: "Egg Cost",
            value: `**${formatNumber(cost)}** ${CLICK_EMOJI}`,
            inline: true
          }
        )
        .setTimestamp(new Date());

      return message.reply({ embeds: [embed] });
    }

    if (cmd === "search") {
      const query = args.join(" ");
      if (!query) return message.reply("Usage: `!search <name>`");

      const data = await fetchEggs();
      const items = extractItems(data);

      const results = items.filter(it =>
        normalize(pickName(it)).includes(normalize(query))
      );

      if (!results.length) {
        return message.reply(`No results for **${query}**.`);
      }

      const top = results.slice(0, 10);

      const lines = top.map((it, i) => {
        const name = pickName(it);
        const value = pickTokenValue(it);
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

  await autoPost();
  setInterval(autoPost, POST_INTERVAL_MINUTES * 60 * 1000);
});

client.login(TOKEN);
