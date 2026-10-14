import type { Challenge } from "./index";

export interface ChallengeTemplate {
  id: string;
  icon: string;
  name: { fr: string; en: string };
  description: { fr: string; en: string };
  challenge: { fr: Challenge; en: Challenge };
}

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    id: "riddle-reindeer",
    icon: "🦌",
    name: { fr: "Énigme : le renne", en: "Riddle: the reindeer" },
    description: { fr: "Énigme classique avec deux indices progressifs.", en: "Classic riddle with two progressive hints." },
    challenge: {
      fr: {
        type: "riddle",
        title: "Qui suis-je ?",
        prompt: "J'ai un nez qui brille dans la nuit et je guide le traîneau du Père Noël. Qui suis-je ?",
        answers: ["Rudolph", "Rodolphe", "Rudolf"],
        hints: [
          { text: "Je suis un renne.", afterAttempts: 1 },
          { text: "Mon nez est rouge… et mon nom commence par R.", afterAttempts: 3, afterSeconds: 60 },
        ],
        maxAttempts: 0,
        successMessage: "Bravo, c'est bien Rudolph ! 🎉",
      },
      en: {
        type: "riddle",
        title: "Who am I?",
        prompt: "My nose glows in the dark and I guide Santa's sleigh. Who am I?",
        answers: ["Rudolph", "Rudolf"],
        hints: [
          { text: "I am a reindeer.", afterAttempts: 1 },
          { text: "My nose is red… and my name starts with R.", afterAttempts: 3, afterSeconds: 60 },
        ],
        maxAttempts: 0,
        successMessage: "Well done, it's Rudolph! 🎉",
      },
    },
  },
  {
    id: "riddle-snowman",
    icon: "☃️",
    name: { fr: "Énigme : bonhomme de neige", en: "Riddle: the snowman" },
    description: { fr: "Énigme facile pour les enfants.", en: "Easy riddle for kids." },
    challenge: {
      fr: {
        type: "riddle",
        title: "Devinette",
        prompt: "J'ai une carotte pour nez, des boutons en charbon et je fonds au soleil. Qui suis-je ?",
        answers: ["bonhomme de neige", "un bonhomme de neige", "bonhomme"],
        hints: [{ text: "On me construit dans le jardin quand il neige.", afterSeconds: 30 }],
        maxAttempts: 0,
      },
      en: {
        type: "riddle",
        title: "Guess who",
        prompt: "I have a carrot for a nose, coal buttons, and I melt in the sun. What am I?",
        answers: ["snowman", "a snowman"],
        hints: [{ text: "Kids build me in the garden when it snows.", afterSeconds: 30 }],
        maxAttempts: 0,
      },
    },
  },
  {
    id: "code-padlock",
    icon: "🔐",
    name: { fr: "Cadenas à 4 chiffres", en: "4-digit padlock" },
    description: {
      fr: "Le code est caché ailleurs (carte, objet, photo…). Idéal pour une chasse au trésor.",
      en: "The code is hidden somewhere else (card, object, photo…). Great for a treasure hunt.",
    },
    challenge: {
      fr: {
        type: "code",
        title: "Le cadenas du lutin",
        prompt: "Un lutin a caché le code sous le sapin. Trouve-le pour ouvrir la case !",
        code: "2412",
        hints: [{ text: "C'est une date très importante en décembre…", afterAttempts: 2 }],
        maxAttempts: 0,
      },
      en: {
        type: "code",
        title: "The elf's padlock",
        prompt: "An elf hid the code under the tree. Find it to open the door!",
        code: "2412",
        hints: [{ text: "It's a very important date in December…", afterAttempts: 2 }],
        maxAttempts: 0,
      },
    },
  },
  {
    id: "choice-culture",
    icon: "❓",
    name: { fr: "QCM culture de Noël", en: "Christmas trivia (MCQ)" },
    description: { fr: "Une question, plusieurs réponses possibles.", en: "One question, multiple answers." },
    challenge: {
      fr: {
        type: "choice",
        title: "Question du jour",
        prompt: "Dans quel pays la tradition du sapin de Noël est-elle née ?",
        options: ["Allemagne", "Finlande", "Canada", "Italie"],
        correct: 0,
        hints: [{ text: "Pense aux marchés de Noël de Strasbourg… et à leurs voisins.", afterAttempts: 1 }],
        maxAttempts: 3,
        failMessage: "Plus d'essais disponibles… reviens demain !",
      },
      en: {
        type: "choice",
        title: "Question of the day",
        prompt: "In which country did the Christmas tree tradition begin?",
        options: ["Germany", "Finland", "Canada", "Italy"],
        correct: 0,
        hints: [{ text: "Think about famous Christmas markets…", afterAttempts: 1 }],
        maxAttempts: 3,
        failMessage: "No attempts left… come back tomorrow!",
      },
    },
  },
  {
    id: "truefalse",
    icon: "✅",
    name: { fr: "Vrai ou faux", en: "True or false" },
    description: { fr: "Plusieurs affirmations à valider toutes correctement.", en: "Several statements to answer correctly." },
    challenge: {
      fr: {
        type: "truefalse",
        title: "Vrai ou faux ?",
        prompt: "Réponds correctement à toutes les affirmations.",
        items: [
          { text: "Le Père Noël habite au pôle Nord.", answer: true },
          { text: "Les rennes du Père Noël sont 4.", answer: false },
          { text: "La bûche de Noël est une tradition française.", answer: true },
        ],
        hints: [{ text: "Le traîneau est tiré par 8 rennes (9 avec Rudolph).", afterAttempts: 2 }],
        maxAttempts: 0,
      },
      en: {
        type: "truefalse",
        title: "True or false?",
        prompt: "Answer all statements correctly.",
        items: [
          { text: "Santa lives at the North Pole.", answer: true },
          { text: "Santa has 4 reindeer.", answer: false },
          { text: "Mince pies are a British Christmas tradition.", answer: true },
        ],
        hints: [{ text: "The sleigh is pulled by 8 reindeer (9 with Rudolph).", afterAttempts: 2 }],
        maxAttempts: 0,
      },
    },
  },
  {
    id: "scramble",
    icon: "🔤",
    name: { fr: "Mot mélangé", en: "Word scramble" },
    description: { fr: "Remets les lettres dans l'ordre.", en: "Put the letters back in order." },
    challenge: {
      fr: {
        type: "scramble",
        title: "Lettres en vrac",
        prompt: "Les lutins ont mélangé les lettres ! Retrouve le mot.",
        word: "GUIRLANDE",
        hints: [{ text: "On l'accroche au sapin et elle brille.", afterSeconds: 45 }],
        maxAttempts: 0,
      },
      en: {
        type: "scramble",
        title: "Mixed letters",
        prompt: "The elves mixed up the letters! Find the word.",
        word: "SNOWFLAKE",
        hints: [{ text: "Every one of them is unique.", afterSeconds: 45 }],
        maxAttempts: 0,
      },
    },
  },
  {
    id: "memory",
    icon: "🃏",
    name: { fr: "Memory festif", en: "Festive memory" },
    description: { fr: "Retrouve toutes les paires pour ouvrir la case.", en: "Match all pairs to open the door." },
    challenge: {
      fr: {
        type: "memory",
        title: "Memory de Noël",
        prompt: "Retrouve toutes les paires !",
        symbols: ["🎄", "🎁", "⛄", "🦌", "🔔", "⭐"],
        hints: [],
        maxAttempts: 0,
      },
      en: {
        type: "memory",
        title: "Christmas memory",
        prompt: "Find all the pairs!",
        symbols: ["🎄", "🎁", "⛄", "🦌", "🔔", "⭐"],
        hints: [],
        maxAttempts: 0,
      },
    },
  },
  {
    id: "slider",
    icon: "🧩",
    name: { fr: "Taquin (puzzle glissant)", en: "Sliding puzzle" },
    description: {
      fr: "Remets les pièces dans l'ordre. Ajoute une image pour un vrai puzzle.",
      en: "Put the tiles back in order. Add an image for a real puzzle.",
    },
    challenge: {
      fr: {
        type: "slider",
        title: "Le taquin du Père Noël",
        prompt: "Fais glisser les pièces pour remettre les nombres dans l'ordre.",
        size: 3,
        hints: [{ text: "Commence par placer la première ligne, puis la première colonne.", afterSeconds: 60 }],
        maxAttempts: 0,
      },
      en: {
        type: "slider",
        title: "Santa's sliding puzzle",
        prompt: "Slide the tiles to put the numbers back in order.",
        size: 3,
        hints: [{ text: "Solve the first row first, then the first column.", afterSeconds: 60 }],
        maxAttempts: 0,
      },
    },
  },
];
