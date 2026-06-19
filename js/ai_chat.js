// NPC chat: persona generation, command parsing, and reply generation.
// Tries a configurable remote AI endpoint first (window.AI_CHAT_ENDPOINT),
// and falls back to an offline persona-driven simulator so chat always works.

const COMMAND_PATTERNS = [
  { re: /\b(go|return)\s+home\b/i, state: 'go_home', ack: (u) => `Aye, heading back to the capital.` },
  { re: /\b(attack|fight|charge)\b/i, state: 'attack', ack: (u) => `For ${u.kingdom ? u.kingdom.name : 'glory'}! I'll attack the nearest foe.` },
  { re: /\b(flee|run away|retreat)\b/i, state: 'flee', ack: (u) => `Retreating at once!` },
  { re: /\b(stay|wait|halt|stop)\b/i, state: 'stay', ack: (u) => `I'll hold my position here.` },
  { re: /\b(wander|patrol|free|go)\b/i, state: null, ack: (u) => `Off I go, exploring the land.` },
];

function detectCommand(unit, text) {
  for (const c of COMMAND_PATTERNS) {
    if (c.re.test(text)) {
      // commands are requests the NPC chooses to honor for a while, not
      // permanent control - their own desires take back over afterward.
      const willing = unit.personality.friendliness * 0.6 + (1 - unit.personality.ambition) * 0.4;
      if (Math.random() > willing * 0.85 + 0.15) {
        return `Hmm, I'd rather not, honestly. ${DESIRE_FLAVOR[unit.desire] ? 'I ' + DESIRE_FLAVOR[unit.desire] + ' right now.' : ''}`;
      }
      unit.commandState = c.state;
      unit.commandTimer = 200 + Math.random() * 150;
      return c.ack(unit);
    }
  }
  return null;
}

function personaDescription(unit, kingdom) {
  const era = ERAS[kingdom ? kingdom.era : 0];
  const roleLabel = unit.isRoyal ? unit.role : (unit.role || unit.species);
  const traits = [];
  if (unit.personality.friendliness > 0.7) traits.push('warm and friendly');
  if (unit.personality.friendliness < 0.3) traits.push('gruff and wary');
  if (unit.personality.courage > 0.7) traits.push('bold');
  if (unit.personality.wit > 0.7) traits.push('quick-witted, fond of jokes');
  if (unit.personality.ambition > 0.7) traits.push('ambitious');
  if (unit.personality.faith > 0.7) traits.push('devout');
  if (traits.length === 0) traits.push('plain-spoken');
  const moodWord = unit.mood > 0.4 ? 'in good spirits' : unit.mood < -0.4 ? 'weary and on edge' : 'even-tempered today';
  return `${unit.name}, a ${traits.join(', ')} ${roleLabel} of ${kingdom ? kingdom.name : 'the wilds'}, living in the ${era.name}. `
    + `${unit.backstory || ''} Right now they are ${moodWord}, and privately ${DESIRE_FLAVOR[unit.desire] || 'unsure what they want from life'}.`;
}

const FALLBACK_LINES = {
  greeting: [
    "Well met, traveler.", "Oh! You can... speak to me? Strange and wonderful.",
    "Greetings. What brings a god to my doorstep?",
  ],
  era_stone: ["Life is hard, but the fire keeps us warm.", "We hunt, we gather, we survive."],
  era_bronze: ["Our smiths forge fine bronze tools now.", "Trade caravans pass through more often these days."],
  era_medieval: ["The castle walls give us comfort at night.", "Have you heard the bells from the church?"],
  era_renaissance: ["Art and learning bloom in our city now.", "The scholars argue endlessly at the school."],
  era_industrial: ["The factories never stop these days.", "Smoke fills the sky, but so does progress."],
  era_modern: ["Have you seen the hospital? Marvelous medicine.", "I saw an airplane overhead just yesterday!"],
  era_future: ["The future is strange and bright.", "Some say machines think for themselves now."],
  era_advanced_future: ["We have transcended so much, yet still we speak.", "Even now, your voice reaches us across ages."],
  royal: ["The crown weighs heavy, but I serve my people.", "Speak your will, and I shall consider it."],
  generic: [
    "I don't quite understand, but I'll remember you said that.",
    "Interesting... I'll think on it.",
    "The days are long here. Tell me more.",
  ],
};

function eraLineKey(eraId) {
  return ['era_stone', 'era_bronze', 'era_medieval', 'era_renaissance', 'era_industrial', 'era_modern', 'era_future', 'era_advanced_future'][eraId] || 'generic';
}

function fallbackReply(unit, kingdom, text, history) {
  const lower = text.toLowerCase();
  if (/\b(hi|hello|hey|greetings)\b/.test(lower)) {
    const greet = pick(FALLBACK_LINES.greeting);
    return unit.mood < -0.3 ? greet + " Forgive me if I seem distant, it's been a hard stretch." : greet;
  }
  if (unit.isRoyal && Math.random() < 0.35) return pick(FALLBACK_LINES.royal);
  if (/remember|before|last time/.test(lower) && history.length > 2) {
    const prev = history.filter(h => h.who === 'user').slice(-2)[0];
    if (prev) return `You once said "${prev.text}" — I haven't forgotten.`;
  }
  if (/name/.test(lower)) return `I am ${unit.name}, ${unit.role || unit.species} of ${kingdom ? kingdom.name : 'no one'}. ${unit.backstory || ''}`;
  if (/want|wish|dream|desire|hope/.test(lower)) return `If I'm honest... I ${DESIRE_FLAVOR[unit.desire] || 'have not yet found what I am looking for'}.`;
  if (/how are you|feel/.test(lower)) {
    if (unit.hp < unit.maxHp * 0.4) return "I've been better, honestly. Wounded, but standing.";
    if (unit.mood > 0.4) return "Quite well, actually! Today has been a good day.";
    if (unit.mood < -0.4) return "Tired. Worn thin, if I'm being truthful with you.";
    return "I'm doing alright, all things considered.";
  }
  if (/story|who are you|tell me about yourself/.test(lower)) return unit.backstory || pick(FALLBACK_LINES.generic);
  if (kingdom && Math.random() < 0.4) return pick(FALLBACK_LINES[eraLineKey(kingdom.era)]);
  // personality colors the generic fallback so two NPCs rarely sound alike
  const generic = pick(FALLBACK_LINES.generic);
  if (unit.personality.wit > 0.7 && Math.random() < 0.5) return generic + " (Though, ha, what do I know?)";
  if (unit.personality.friendliness < 0.3 && Math.random() < 0.5) return "Hm. " + generic;
  return generic;
}

async function getNpcReply(unit, kingdom, userText) {
  unit.memory.push({ who: 'user', text: userText });

  const command = detectCommand(unit, userText);

  let reply;
  if (window.AI_CHAT_ENDPOINT) {
    try {
      const res = await fetch(window.AI_CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona: personaDescription(unit, kingdom),
          history: unit.memory.slice(-10),
          message: userText,
        }),
      });
      const data = await res.json();
      reply = data.reply;
    } catch (e) {
      reply = null;
    }
  }

  if (!reply) {
    reply = command ? command : fallbackReply(unit, kingdom, userText, unit.memory);
  } else if (command) {
    reply = `${reply} (${command})`;
  }

  unit.memory.push({ who: 'npc', text: reply });
  if (unit.memory.length > 30) unit.memory.splice(0, unit.memory.length - 30);
  return reply;
}
