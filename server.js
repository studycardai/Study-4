// ✅ Structure adaptée à Vercel avec Next.js
// Chaque endpoint Express devient un fichier dans /pages/api

// 📁 /pages/api/ping.js
export default function handler(_, res) {
  res.send("✅ Serveur opérationnel.");
}


// 📁 /pages/api/test.js
export default async function handler(_, res) {
  const testPrompt = `Génère 3 flashcards au format Q:... R:... à partir de ce texte : \"La Révolution française débute en 1789...\"`;

  try {
    const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
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
}


// 📁 /pages/api/flashcards.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send("❌ Méthode non autorisée");
  }

  const { content, limit } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).send("❌ Requête invalide : contenu manquant.");
  }

  const prompt = `Génère ${limit || 20} flashcards au format suivant :\n\nQ: [question]\nR: [réponse]\n\nContenu source :\n\n${content}`;

  try {
    const apiRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      })
    });

    const raw = await apiRes.text();
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
}


// 📁 /pages/api/evaluate.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send("❌ Méthode non autorisée");
  }

  const { questions, expected, responses } = req.body;

  if (!questions || !expected || !responses ||
      !Array.isArray(questions) ||
      !Array.isArray(expected) ||
      !Array.isArray(responses) ||
      questions.length !== expected.length ||
      expected.length !== responses.length) {
    return res.status(400).send("❌ Données invalides.");
  }

  const prompt = `Tu es un correcteur automatique. Pour chaque ligne, compare la réponse de l'utilisateur avec la bonne réponse. Attribue une note : 1 si c'est correct, 0.5 si partiellement correct, 0 si incorrect. Réponds uniquement par un tableau JSON des scores.\n\nExemple attendu : [1, 0.5, 0, 1]\n\nDonnées à évaluer :\n${questions.map((q, i) => `Q: ${q}\nAttendu: ${expected[i]}\nRéponse: ${responses[i]}`).join('\n\n')}`;

  try {
    const apiRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      })
    });

    const raw = await apiRes.text();
    const parsed = JSON.parse(raw);
    const reply = parsed.choices?.[0]?.message?.content;

    const scores = JSON.parse(reply.match(/\[.*?\]/s)[0]);
    if (!Array.isArray(scores)) throw new Error("Format de scores incorrect");

    res.json({ scores });
  } catch (err) {
    console.error("❌ Erreur d'évaluation :", err.message);
    res.status(500).send("❌ Échec de l'évaluation : " + err.message);
  }
}
