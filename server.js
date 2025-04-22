const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');

const app = express();

// Configuration du middleware CORS
const corsOptions = {
  origin: '*', // Autoriser toutes les origines, ou spécifiez un domaine particulier
  methods: 'GET,POST', // Méthodes HTTP autorisées
  allowedHeaders: 'Content-Type,Authorization' // En-têtes autorisés
};
app.use(cors(corsOptions));

app.use(express.json());

// 🔐 Chargement sécurisé de la clé API
let MISTRAL_API_KEY = '';
try {
  MISTRAL_API_KEY = fs.readFileSync('key.env', 'utf-8').trim();
  if (!MISTRAL_API_KEY) throw new Error("Clé API manquante dans key.env");
} catch (err) {
  console.error("❌ Impossible de charger la clé API :", err.message);
  process.exit(1);
}

// ✅ Endpoint de test
app.get('/ping', (_, res) => {
  res.send('✅ Serveur opérationnel.');
});

// 🧪 Test simple de génération
app.get('/test', async (_, res) => {
  const testPrompt = `Génère 3 flashcards au format Q:... R:... à partir de ce texte : "La Révolution française débute en 1789..."`;

  try {
    const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: testPrompt }]
      })
    });

    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content;
    res.send(content || "❌ Réponse vide.");
  } catch (e) {
    res.status(500).send("❌ Erreur /test : " + e.message);
  }
});

// 🎯 Génération de flashcards
app.post('/flashcards', async (req, res) => {
  const { content, limit } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).send("❌ Requête invalide : contenu manquant.");
  }

  const prompt = `Génère ${limit || 20} flashcards au format suivant :

Q: [question]
R: [réponse]

Contenu source :\n\n${content}`;

  try {
    const apiRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      })
    });

    const raw = await apiRes.text();
    console.log("📥 Mistral brut:", raw);

    const parsed = JSON.parse(raw);
    const result = parsed.choices?.[0]?.message?.content;
    if (!result || !result.includes("Q:")) {
      return res.status(500).send("❌ Format de réponse incorrect.");
    }

    res.send(result);
  } catch (err) {
    console.error("❌ Erreur Mistral :", err.message);
    res.status(500).send("❌ Erreur Mistral : " + err.message);
  }
});

// 🧠 Évaluation de fin de session (mode eval)
app.post('/api/evaluate', async (req, res) => {
  const { questions, expected, responses } = req.body;

  if (!questions || !expected || !responses ||
      !Array.isArray(questions) ||
      !Array.isArray(expected) ||
      !Array.isArray(responses) ||
      questions.length !== expected.length ||
      expected.length !== responses.length) {
    return res.status(400).send("❌ Données invalides.");
  }

  try {
    // Construction du prompt pour une évaluation groupée
    const prompt = `Tu es un correcteur automatique. Pour chaque ligne, compare la réponse de l'utilisateur avec la bonne réponse. Attribue une note : 1 si c'est correct, 0.5 si partiellement correct, 0 si incorrect. Réponds uniquement par un tableau JSON des scores.

Exemple attendu : [1, 0.5, 0, 1]

Données à évaluer :
${questions.map((q, i) => `Q: ${q}\nAttendu: ${expected[i]}\nRéponse: ${responses[i]}`).join('\n\n')}
`;

    const apiRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      })
    });

    const raw = await apiRes.text();
    console.log("🧠 Réponse Mistral:", raw);

    const parsed = JSON.parse(raw);
    const reply = parsed.choices?.[0]?.message?.content;

    // Extraction du JSON de score depuis le texte renvoyé
    const scores = JSON.parse(reply.match(/\[.*?\]/s)[0]); // extrait le 1er tableau JSON
    if (!Array.isArray(scores)) throw new Error("Format de scores incorrect");

    res.json({ scores });
  } catch (err) {
    console.error("❌ Erreur d'évaluation :", err.message);
    res.status(500).send("❌ Échec de l'évaluation : " + err.message);
  }
});

// 🚀 Démarrage
app.listen(3000, () => {
  console.log("🚀 Serveur en écoute sur http://localhost:3000");
});
