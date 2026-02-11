inlineimport "dotenv/config";
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

// VALUE IN TOKENS
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

// EGG COST IN CLICKS
function pickEggCost(item) {
  return (
    item?.cost ??
    item?.clickCost ??
    item?.click_cost ??
    item?.clicks ??
    item?.price ?? // sometimes price = egg cost
    null
  );
}

function sortByTokenValue(items) {
  return items.sort((a, b) => {
    const va = Number(pickTokenValue(a)) || 0;
    const vb = Number(pickTokenValue(b)) || 0;
    return vb - va;
  });
}

function fuzzyFind(items, query) {
  const q = normalize(query);
  if (!q) return [];

  // exact
  const exact = items.filter(it => normalize(pickName(it)) === q);
  if (exact.length) return exact;

  // contains
  const contains = items.filter(it => normalize(pickName(it)).includes(q));
  if (contains.length) return contains;

  // remove spaces search
  const qNoSpace = q.replace(/ /g, "");
  const noSpaceMatch = items.filter(it =>
    normalize(pickName(it)).replace(/ /g, "").includes(qNoSpace)
  );
  if (noSpaceMatch.length) return noSpaceMatch;

  // score
  const parts = q.split(" ");
  const scored = items
    .map(it => {
      const name = normalize(pickName(it));
      let score = 0;
      for (const p of parts) if (name.includes(p)) score++;
      return { it, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 10).map(x => x.it);
}

function buildHatchesEmbed(items) {
  const embed = new EmbedBuilder()
    .setTitle("Tap Sim — Eggs / Hatches")
    .setDescription("Source: tapsim.gg")
    .setTimestamp(new Date());

  if (!items.length) {
    embed.addFields({ name: "Top Eggs", value: "No data", inline: false });
    return embed;
  }

  // Sort by egg cost (clicks)
  const sorted = items.sort((a, b) => {
    const ca = Number(pickEggCost(a)) || 0;
    const cb = Number(pickEggCost(b)) || 0;
    return cb - ca;
  });

  const top = sorted.slice(0, 10);

  const lines = top.map((it, i) => {
    const name = pickName(it);

    const tokenValue = pickTokenValue(it);
    const eggCost = pickEggCost(it);

    const tokenText =
      tokenValue != null
        ? `${formatNumber(tokenValue)} ${TOKEN_EMOJI}`
        : `N/A ${TOKEN_EMOJI}`;

    const costText =
      eggCost != null
        ? `${formatNumber(eggCost)} ${CLICK_EMOJI}`
        : `N/A ${CLICK_EMOJI}`;

    return `**${i + 1}. ${name}**\nValue: **${tokenText}** | Cost: **${costText}**`;
  });

  embed.addFields({
    name: "Top Eggs (by cost)",
    value: lines.join("\n\n"),
    inline: false
  });

  return embed;
}

function buildTopValuesEmbed(items) {
  const embed = new EmbedBuilder()
    .setTitle("Tap Sim — Top Values")
    .setDescription("Source: tapsim.gg")
    .setTimestamp(new Date());

  if (!items.length) {
    embed.addFields({ name: "Top Values", value: "No data", inline: false });
    return embed;
  }

  const sorted = sortByTokenValue(items).slice(0, 10);

  const lines = sorted.map((it, i) => {
    const name = pickName(it);
    const value = pickTokenValue(it);
    return `**${i + 1}. ${name}** — **${formatNumber(value)}** ${TOKEN_EMOJI}`;
  });

  embed.addFields({
    name: "Top (by token value)",
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

async function autoPostHatches() {
  try {
    const data = await fetchAPI();
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
    if (cmd === "help") {
      return message.reply(
        "**Commands:**\n" +
        "`!hatches` - show eggs/hatches\n" +
        "`!value <name>` - value lookup\n" +
        "`!search <name>` - search pets\n" +
        "`!topvalues` - top 10 token values"
      );
    }

    if (cmd === "hatches") {
      const data = await fetchAPI();
      const items = extractItems(data);

      const embed = buildHatchesEmbed(items);
      return message.reply({ embeds: [embed] });
    }

    if (cmd === "topvalues") {
      const data = await fetchAPI();
      const items = extractItems(data);

      const embed = buildTopValuesEmbed(items);
      return message.reply({ embeds: [embed] });
    }

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

      const tokenValue = pickTokenValue(best);
      const eggCost = pickEggCost(best);

      const embed = new EmbedBuilder()
        .setTitle(name)
        .setDescription("Source: tapsim.gg")
        .addFields(
          {
            name: "Value",
            value:
              tokenValue != null
                ? `**${formatNumber(tokenValue)}** ${TOKEN_EMOJI}`
                : `N/A ${TOKEN_EMOJI}`,
            inline: true
          },
          {
            name: "Egg Cost",
            value:
              eggCost != null
                ? `**${formatNumber(eggCost)}** ${CLICK_EMOJI}`
                : `N/A ${CLICK_EMOJI}`,
            inline: true
          }
        )
        .setTimestamp(new Date());

      return message.reply({ embeds: [embed] });
    }

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
