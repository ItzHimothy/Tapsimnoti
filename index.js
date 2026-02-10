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

// ---------- helpers ----------
async function fetchEggs() {
  const url = `${API_BASE}${EGGS_ENDPOINT}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" }
  });

  if (!res.ok) throw new Error(`API error ${res.status} ${res.statusText}`);

  return await res.json();
}

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function formatNumber(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return String(n ?? "N/A");
  return x.toLocaleString("en-US");
}

function pickName(item) {
  return item?.name || item?.title || item?.petName || item?.eggName || "Unknown";
}

function pickPrice(item) {
  return (
    item?.price ??
    item?.value ??
    item?.tokens ??
    item?.cost ??
    item?.tokenCost ??
    item?.token_price ??
    null
  );
}

function buildHatchesEmbed(items, title = "Tap Sim — Eggs / Hatches") {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`Source: tapsim.gg`)
    .setTimestamp(new Date());

  const top = items.slice(0, 10);

  const lines = top.map((it, idx) => {
    const name = pickName(it);
    const price = pickPrice(it);
    const priceText =
      price != null
        ? `${formatNumber(price)} ${TOKEN_EMOJI}`
        : `N/A ${TOKEN_EMOJI}`;

    return `**${idx + 1}. ${name}** — ${priceText}`;
  });

  embed.addFields({
    name: "Top (by price)",
    value: lines.join("\n") || "No data",
    inline: false
  });

  return embed;
}

function fuzzyFind(items, query) {
  const q = normalize(query);
  if (!q) return [];

  const exact = items.filter(it => normalize(pickName(it)) === q);
  if (exact.length) return exact;

  const contains = items.filter(it => normalize(pickName(it)).includes(q));
  if (contains.length) return contains;

  const qParts = q.split(" ");
  const scored = items
    .map(it => {
      const name = normalize(pickName(it));
      let score = 0;
      for (const p of qParts) if (name.includes(p)) score++;
      return { it, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 10).map(x => x.it);
}

// ---------- auto posting ----------
let lastPostHash = "";

function hashTop(items) {
  return items
    .slice(0, 10)
    .map(it => `${pickName(it)}:${pickPrice(it)}`)
    .join("|");
}

async function postHatchesIfChanged() {
  try {
    const data = await fetchEggs();
    const items = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);

    if (!Array.isArray(items) || items.length === 0) return;

    const newHash = hashTop(items);
    if (newHash === lastPostHash) return;

    const channel = await client.channels.fetch(HATCHES_CHANNEL_ID);
    if (!channel?.isTextBased?.()) return;

    const embed = buildHatchesEmbed(items, "Tap Sim — Hatch Update");
    await channel.send({ embeds: [embed] });

    lastPostHash = newHash;
  } catch (err) {
    console.error("Auto-post error:", err?.message || err);
  }
}

// ---------- prefix commands ----------
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift()?.toLowerCase();

  try {
    // !hatches
    if (cmd === "hatches") {
      const data = await fetchEggs();
      const items = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
      const embed = buildHatchesEmbed(items, "Tap Sim — Eggs / Hatches");
      return message.reply({ embeds: [embed] });
    }

    // !topvalues
    if (cmd === "topvalues") {
      const data = await fetchEggs();
      const items = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
      const embed = buildHatchesEmbed(items, "Tap Sim — Top Values");
      return message.reply({ embeds: [embed] });
    }

    // !value <name>
    if (cmd === "value") {
      const query = args.join(" ");
      if (!query) return message.reply("Usage: `!value <pet name>`");

      const data = await fetchEggs();
      const items = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
      const matches = fuzzyFind(items, query);

      if (!matches.length) return message.reply(`No match found for **${query}**.`);

      const best = matches[0];
      const name = pickName(best);
      const price = pickPrice(best);

      const embed = new EmbedBuilder()
        .setTitle(name)
        .addFields({
          name: "Value",
          value: price != null
            ? `**${formatNumber(price)}** ${TOKEN_EMOJI}`
            : `**N/A** ${TOKEN_EMOJI}`,
          inline: true
        })
        .addFields({
          name: "Source",
          value: "tapsim.gg",
          inline: true
        })
        .setTimestamp(new Date());

      return message.reply({ embeds: [embed] });
    }

    // !search <query>
    if (cmd === "search") {
      const query = args.join(" ");
      if (!query) return message.reply("Usage: `!search <name>`");

      const data = await fetchEggs();
      const items = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
      const matches = fuzzyFind(items, query);

      if (!matches.length) return message.reply(`No results for **${query}**.`);

      const lines = matches.slice(0, 10).map((it, idx) => {
        const name = pickName(it);
        const price = pickPrice(it);

        return `**${idx + 1}. ${name}** — ${
          price != null ? formatNumber(price) : "N/A"
        } ${TOKEN_EMOJI}`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`Search results: ${query}`)
        .setDescription(lines.join("\n"))
        .setTimestamp(new Date());

      return message.reply({ embeds: [embed] });
    }

    // help
    if (cmd === "help") {
      return message.reply(
        "**Commands:**\n" +
        "`!hatches` - show eggs/hatches\n" +
        "`!value <name>` - value lookup\n" +
        "`!search <name>` - search pets\n" +
        "`!topvalues` - top 10 values"
      );
    }

  } catch (err) {
    console.error(err);
    return message.reply("Something went wrong (API error).");
  }
});

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setActivity({
    name: "Tap Sim Values",
    type: ActivityType.Watching
  });

  await postHatchesIfChanged();
  setInterval(postHatchesIfChanged, POST_INTERVAL_MINUTES * 60 * 1000);
});

client.login(TOKEN);
